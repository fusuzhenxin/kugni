import csv
import hashlib
import hmac
import io
import re
from collections import Counter
from datetime import timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import module
from .config import settings
from .db import get_db
from .models import AnalyticsEvent, Record, Report, User, VisitorSession, now, uid
from .security import check_permission, origin_guard, rate_limit, require_user
from .serialization import record_json

router = APIRouter(tags=['流量与广告'])


class EventBody(BaseModel):
    id: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    visitor: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    kind: str = Field(pattern=r'^(pageview|duration|outbound|impression|adclick|heartbeat)$')
    session: str = Field(default='', max_length=64, pattern=r'^[a-zA-Z0-9_-]*$')
    path: str = Field(max_length=500)
    referrer: str = Field(default='', max_length=2000)
    campaignId: str | None = None
    duration: int = Field(default=0, ge=0, le=3600)


def visitor_hash(visitor):
    return hmac.new(settings().secret_key.encode(), (now().strftime('%Y-%m') + visitor).encode(), hashlib.sha256).hexdigest()


def campaign_active(r):
    today = now().date().isoformat()
    return r.module == 'campaigns' and r.status == '投放中' and (not r.data.get('start') or r.data['start'] <= today) and (not r.data.get('end') or r.data['end'] >= today)


@router.post('/track/events/')
def event(body: EventBody, request: Request, db: Session = Depends(get_db)):
    origin_guard(request)
    if re.search(r'bot|spider|crawler|headless', request.headers.get('user-agent', ''), re.I):
        return {'ok': True, 'ignored': True}
    rate_limit(db, 'analytics:' + hashlib.sha256((request.client.host if request.client else 'unknown').encode()).hexdigest(), 600, 60)
    path = urlparse(body.path).path
    private_path = re.sub(r'^/en(?=/|$)', '', path)
    if not path.startswith('/') or re.match(r'^/(admin|publisher|api|auth|account)(/|$)', private_path):
        return {'ok': True, 'ignored': True}
    visitor = visitor_hash(body.visitor)
    existing = db.get(AnalyticsEvent, body.id)
    if body.kind == 'duration':
        if existing and existing.visitor == visitor:
            existing.duration = max(existing.duration, body.duration)
            db.commit()
        return {'ok': True}
    if existing:
        return {'ok': True}
    if body.kind in ['impression', 'adclick']:
        campaign = db.get(Record, body.campaignId) if body.campaignId else None
        if not campaign or not campaign_active(campaign): raise HTTPException(404, '广告不在投放期')
    session_id = hmac.new(settings().secret_key.encode(), (visitor + ':' + (body.session or body.visitor)).encode(), hashlib.sha256).hexdigest()
    session = db.get(VisitorSession, session_id)
    previous = session.last_path if session else ''
    if not session:
        session = VisitorSession(id=session_id, visitor=visitor, entry_path=path, last_path=path)
        db.add(session)
    session.last_seen = now()
    if body.kind == 'pageview': session.last_path = path
    if body.kind == 'heartbeat':
        db.commit()
        return {'ok': True}
    from .analytics_details import locate
    country, region = locate(request)
    ua = request.headers.get('user-agent', '')
    device = 'mobile' if re.search(r'Android|iPhone|Mobile', ua, re.I) else 'desktop'
    db.add(AnalyticsEvent(id=body.id, kind=body.kind, visitor=visitor, path=path, referrer=urlparse(body.referrer).hostname or '直接访问', device=device, campaign_id=body.campaignId if body.kind in ['impression', 'adclick'] else None, session_id=session_id, previous_path=previous if body.kind == 'pageview' else '', country=country, region=region))
    db.commit()
    return {'ok': True}


@router.get('/public/ads/')
def ads(placement: str, db: Session = Depends(get_db)):
    aliases = {placement}
    for slot in db.scalars(select(Record).where(Record.module == 'placements', Record.status == '可投放')):
        if placement in [slot.id, slot.name, slot.slug]: aliases.update([slot.id, slot.name, slot.slug])
    items = [r for r in db.scalars(select(Record).where(Record.module == 'campaigns', Record.status == '投放中')) if campaign_active(r) and r.data.get('placement') in aliases]
    return {'items': [{k: v for k, v in record_json(r).items() if k in ['id', 'name', 'headline', 'description', 'target', 'creative', 'placement']} for r in items[:3]]}


def analytics_data(db, user, m, days):
    role = check_permission(db, user, m, 'read')
    if m['key'] == 'test-trends':
        query = select(Report).where(Report.created_at >= now() - timedelta(days=days))
        if role.scope == 'own': query = query.where(Report.owner_id == user.id)
        reports = list(db.scalars(query))
        successful = [r for r in reports if r.evidence.get('success')]
        scores = [r.score for r in reports if r.score is not None]
        latencies = [s['elapsedMs'] for r in reports for s in r.evidence.get('samples', []) if isinstance(s.get('elapsedMs'), (int, float))]
        series = []
        for offset in range(days - 1, -1, -1):
            day = (now() - timedelta(days=offset)).date()
            rows = [r for r in reports if r.created_at.date() == day]
            series.append(dict(date=day.isoformat(), total=len(rows), successful=sum(bool(r.evidence.get('success')) for r in rows)))
        models = []
        for model in sorted({r.model for r in reports}):
            rows = [r for r in reports if r.model == model]
            models.append(dict(name=model, total=len(rows), successful=sum(bool(r.evidence.get('success')) for r in rows)))
        return {'test': dict(total=len(reports), successful=len(successful), successRate=round(len(successful) / len(reports) * 100, 2) if reports else None, averageScore=round(sum(scores) / len(scores), 1) if scores else None, averageLatency=round(sum(latencies) / len(latencies)) if latencies else None, scored=len(scores), series=series, models=models), 'series': series, 'note': '按实际报告统计，包含待审核的内部报告。平均分只计算有得分的题集报告；指纹采样不计分。'}
    query = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= now() - timedelta(days=days))
    if role.surface == 'publisher' or role.scope == 'own':
        owned = select(Record.id).where(Record.module == 'campaigns', Record.owner_id == user.id)
        query = query.where(AnalyticsEvent.campaign_id.in_(owned))
    rows = list(db.scalars(query))
    pv = sum(r.kind == 'pageview' for r in rows)
    visitors = {r.visitor for r in rows}
    impressions = sum(r.kind == 'impression' for r in rows)
    clicks = sum(r.kind == 'adclick' for r in rows)
    outbound = sum(r.kind == 'outbound' for r in rows)
    series = []
    for offset in range(days - 1, -1, -1):
        date = (now() - timedelta(days=offset)).date()
        day = [r for r in rows if r.created_at.date() == date]
        series.append(dict(date=date.isoformat(), pageviews=sum(r.kind == 'pageview' for r in day), visitors=len({r.visitor for r in day}), impressions=sum(r.kind == 'impression' for r in day), clicks=sum(r.kind == 'adclick' for r in day)))
    sources = Counter(r.referrer for r in rows if r.kind in ['pageview', 'adclick'])
    pages = Counter(r.path for r in rows if r.kind in ['pageview', 'adclick'])
    devices = Counter(r.device for r in rows if r.kind in ['pageview', 'adclick'])
    campaigns = []
    for campaign_id in {r.campaign_id for r in rows if r.campaign_id}:
        c = db.get(Record, campaign_id)
        cr = [r for r in rows if r.campaign_id == campaign_id]
        ci = sum(r.kind == 'impression' for r in cr)
        cc = sum(r.kind == 'adclick' for r in cr)
        campaigns.append(dict(id=campaign_id, name=c.name if c else '已删除广告', impressions=ci, clicks=cc, ctr=round(cc / ci * 100, 2) if ci else 0))
    return dict(pv=pv, uv=len(visitors), impressions=impressions, clicks=clicks, outbound=outbound, ctr=round(clicks / impressions * 100, 2) if impressions else 0, averageDuration=round(sum(r.duration for r in rows if r.kind == 'pageview') / pv) if pv else 0, series=series, sources=[dict(name=k, value=v) for k, v in sources.most_common(15)], pages=[dict(name=k, value=v) for k, v in pages.most_common(20)], devices=[dict(name=k, value=v) for k, v in devices.items()], campaigns=campaigns, days=days, note='只统计采集到的浏览器事件；UV 按当月匿名访客标识去重，非独立自然人数。地区来自本地 GeoIP，无法识别时显示未知。')


@router.get('/admin/analytics/{key}/')
def analytics(key: str, days: int = Query(7, ge=1, le=90), export: bool = False, user: User = Depends(require_user), db: Session = Depends(get_db)):
    m = module(key)
    if m['kind'] not in ['analytics', 'dashboard']:
        raise HTTPException(404, '不是统计模块')
    data = analytics_data(db, user, m, days)
    if export:
        check_permission(db, user, m, 'export')
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=['date', 'total', 'successful'] if m['key'] == 'test-trends' else ['date', 'pageviews', 'visitors', 'impressions', 'clicks'])
        writer.writeheader()
        writer.writerows(data['series'])
        return Response('\ufeff' + stream.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="analytics.csv"'})
    if key != 'test-trends':
        from .analytics_details import details
        role = check_permission(db, user, m, 'read')
        query = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= now() - timedelta(days=days))
        own = role.surface == 'publisher' or role.scope == 'own'
        if own:
            query = query.where(AnalyticsEvent.campaign_id.in_(select(Record.id).where(Record.module == 'campaigns', Record.owner_id == user.id)))
        data.update(details(db, list(db.scalars(query)), own))
    return data
