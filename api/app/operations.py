"""Read-only collection health, translation quality and explicit maintenance actions."""
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import module
from .db import get_db
from .models import Record, User, now
from .security import check_permission, require_user

router = APIRouter(prefix='/admin/operations', tags=['数据运维'])


def authorize(db, user, key, action='read'):
    role = check_permission(db, user, module(key), action)
    if role.scope != 'all': raise HTTPException(403, '全站运维视图需要全部数据范围')


def instant(value):
    from .station_sources import stamp
    parsed = stamp(value)
    return parsed.replace(tzinfo=None) if parsed else None


def collection_health(db):
    stations = list(db.scalars(select(Record).where(Record.module == 'stations')))
    tasks = list(db.scalars(select(Record).where(Record.module.in_(['station-sync-tasks', 'collection-tasks']))))
    runs = list(db.scalars(select(Record).where(Record.module.in_(['station-sync-runs', 'collection-runs'])).order_by(Record.created_at.desc()).limit(3000)))
    findings = {r.data.get('station'): r for r in db.scalars(select(Record).where(Record.module == 'station-source-findings'))}
    prices = {r.data.get('stationId') or r.slug: r for r in db.scalars(select(Record).where(Record.module == 'source-pricing'))}
    output = []
    for station in stations:
        related = [t for t in tasks if t.data.get('station') == station.id]
        jobs = [r for r in runs if r.data.get('station') == station.id]
        snapshot = station.data.get('_channelSnapshot') or {}
        pricing = prices.get(station.id) or prices.get(station.slug)
        last = jobs[0] if jobs else None
        successes = [r for r in jobs if r.status in ['已完成', '部分成功']]
        due = [instant(t.data.get('_nextRun')) for t in related if t.status == '启用']
        late = any(t and t < now() - timedelta(minutes=15) for t in due)
        expires = instant(snapshot.get('expiresAt'))
        stale = bool(expires and expires < now())
        active = any(r.status in ['排队中', '采集中'] for r in jobs)
        status = '运行中' if active else '需处理' if last and last.status == '失败' or stale or late else '部分成功' if last and last.status == '部分成功' else '正常' if last else '未接入'
        finding = findings.get(station.id)
        if finding and not any(t.status == '启用' for t in related): status = finding.status
        output.append({'id': station.id, 'slug': station.slug, 'name': station.name, 'status': status,
            'taskIds': [t.id for t in related], 'enabled': sum(t.status == '启用' for t in related),
            'lastRunId': last.id if last else '', 'lastRun': last.data.get('finishedAt') or last.created_at.isoformat() if last else '',
            'lastSuccess': successes[0].data.get('finishedAt', '') if successes else '',
            'nextRun': min((d.isoformat() for d in due if d), default=''), 'late': late, 'stale': stale,
            'channels': len(snapshot.get('channels', [])), 'modelChannels': len(snapshot.get('modelChannels', [])),
            'channelUpdatedAt': snapshot.get('collectedAt', ''), 'sourceType': snapshot.get('sourceType', ''),
            'models': pricing.data.get('modelCount', len({r['cells'][0] for r in pricing.data.get('rows', []) if r.get('cells')})) if pricing else 0,
            'quotes': len(pricing.data.get('rows', [])) if pricing else 0,
            'pricingUpdatedAt': pricing.data.get('collectedAt', '') if pricing else '',
            'errors': last.data.get('errors', {}) if last else {}, 'warnings': last.data.get('warnings', []) if last else [],
            'consecutiveFailures': next((i for i, r in enumerate(jobs) if r.status != '失败'), len(jobs)),
            'finding': {'status': finding.status, 'body': finding.data.get('body', ''), 'sourceUrl': finding.data.get('sourceUrl', '')} if finding else None})
    recent = [r for r in runs if r.created_at >= now() - timedelta(days=1) and r.status not in ['排队中', '采集中']]
    return {'updatedAt': now().isoformat(), 'summary': {'stations': len(stations), 'withChannels': sum(r['channels'] > 0 for r in output),
        'withPricing': sum(bool(r['pricingUpdatedAt']) for r in output), 'attention': sum(r['status'] in ['需处理', '部分成功', '需要验证'] for r in output),
        'activeJobs': sum(r.status in ['排队中', '采集中'] for r in runs), 'runs24h': len(recent),
        'successRate24h': round(sum(r.status == '已完成' for r in recent) / len(recent) * 100, 2) if recent else None},
        'stations': output,
        'jobs': [{'id': r.id, 'name': r.name, 'status': r.status, 'kind': r.module, 'createdAt': r.created_at.isoformat(),
                  'errors': r.data.get('errors') or r.data.get('error') or {}, 'warnings': r.data.get('warnings', [])} for r in runs[:30]]}


def translation_health(db):
    from .localization import FIELDS, PUBLIC_STATUSES
    public = {r.id: r for r in db.scalars(select(Record).where(Record.module.in_(list(FIELDS)), Record.status.in_(PUBLIC_STATUSES)))}
    rows = [r for r in db.scalars(select(Record).where(Record.module == 'translations')) if r.data.get('recordId') in public or r.data.get('recordId') == 'ui']
    statuses = Counter(r.status for r in rows)
    modules = {}
    for row in rows:
        key = row.data.get('module') or 'ui'
        item = modules.setdefault(key, {'module': key, 'total': 0, 'ready': 0, 'failed': 0, 'manual': 0})
        item['total'] += 1
        item['ready'] += row.status == '已翻译' and row.data.get('translatedHash') == row.data.get('sourceHash')
        item['failed'] += row.status == '翻译失败'
        item['manual'] += row.status == '待校对'
    documents = []
    for identity, parent in public.items():
        slots = [r for r in rows if r.data.get('recordId') == identity]
        ready = sum(r.status == '已翻译' and r.data.get('translatedHash') == r.data.get('sourceHash') for r in slots)
        if ready < len(slots):
            documents.append({'id': identity, 'name': parent.name, 'module': parent.module, 'total': len(slots), 'ready': ready,
                              'pending': len(slots) - ready, 'failed': sum(r.status == '翻译失败' for r in slots)})
    provider = db.get(Record, 'translation-provider')
    return {'updatedAt': now().isoformat(), 'total': len(rows), 'statuses': dict(statuses), 'modules': list(modules.values()),
        'uniquePending': len({r.data.get('sourceHash') for r in rows if r.status != '已翻译'}),
        'documents': sorted(documents, key=lambda r: (-r['failed'], -r['pending']))[:100],
        'provider': {'status': provider.status if provider else '待执行', **{k: provider.data.get(k) for k in ['nextAttempt', 'lastSuccess', 'lastError', 'lastBatchSize']}} if provider else {},
        'failures': [{'id': r.id, 'name': r.name, 'source': r.data.get('source', '')[:300], 'error': r.data.get('error', '')} for r in rows if r.status in ['翻译失败', '待校对']][:30]}


@router.get('/collection-health/')
def health(user: User = Depends(require_user), db: Session = Depends(get_db)):
    authorize(db, user, 'collection-health')
    return collection_health(db)


@router.get('/translation-health/')
def translations(user: User = Depends(require_user), db: Session = Depends(get_db)):
    authorize(db, user, 'translation-health')
    return translation_health(db)


@router.post('/translation-health/reconcile/')
def reconcile(user: User = Depends(require_user), db: Session = Depends(get_db)):
    authorize(db, user, 'translation-health', 'retry')
    check_permission(db, user, module('translations'), 'retry')
    from .localization import reuse_translations
    from .admin_service import audit
    count = reuse_translations(db)
    audit(db, user, 'retry', module('translation-health'), 'reconcile', {'reused': count})
    db.commit()
    return {'ok': True, 'reused': count}
