import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import SHARED
from .db import get_db
from .models import PageRedirect, Record, Report, now
from .serialization import record_json


def public_json(record):
    data = {k: v for k, v in record_json(record).items() if k not in ['note', 'ownerId', 'reviewNote', 'publishedStationId'] and not k.startswith('_')}
    if record.module == 'stations':
        snapshot = next((s for s in seed['source']['sites'] if s['id'] == record.id), {})
        data['sourceModelCount'] = snapshot.get('modelCount')
        data['sourceUrl'] = snapshot.get('sourceUrl') or data.get('source', '')
        # Newly published stations can legitimately have no model or policy data.
        for key in ['models', 'payments', 'tags', 'categories']:
            if not isinstance(data.get(key), list):
                data[key] = [data['category']] if key == 'categories' and data.get('category') else []
            data[key] = [value for value in data[key] if value]
        for key in ['domain', 'summary', 'category']:
            data[key] = data.get(key) or ''
        data['serviceStatus'] = data.get('serviceStatus') or '待核验'
        data['sourceDate'] = data.get('sourceDate') or record.updated_at.date().isoformat()
    return data


router = APIRouter(prefix='/public', tags=['公开目录'])
seed = json.loads((SHARED / 'seed.json').read_text(encoding='utf-8'))


def price_json(db, record):
    data = public_json(record)
    station = db.get(Record, data.get('station')) if data.get('station') else None
    if station and station.module == 'stations': data['stationName'] = station.name
    return data


def published(db, module, statuses=None):
    return list(db.scalars(select(Record).where(Record.module == module, Record.status.in_(statuses or ['已收录', '已发布', '启用'])).order_by(Record.created_at)))


@router.get('/catalog/')
def catalog(db: Session = Depends(get_db)):
    categories = [record_json(r) for r in published(db, 'categories')]
    system = db.get(Record, 'settings-general')
    suggestions = sorted(published(db, 'model-suggestions', ['启用']), key=lambda r: (r.data.get('sort', 0), r.created_at, r.id))
    return {'categories': categories, 'models': [record_json(r) for r in published(db, 'models')],
            'modelSuggestions': [dict(modelId=r.name, sort=r.data.get('sort', 0)) for r in suggestions],
            'settings': system.data if system else {}, 'sourceDate': seed['source']['capturedAt'], 'routes': seed['routes']}


@router.get('/localization/')
def localization(db: Session = Depends(get_db)):
    from .localization import public_bundle
    return public_bundle(db)


@router.get('/redirect/')
def resolve_redirect(path: str, db: Session = Depends(get_db)):
    row = db.get(PageRedirect, path)
    return {'destination': row.destination if row else None}


@router.get('/resources/')
def resources(db: Session = Depends(get_db)):
    return {'items': [record_json(r) for r in published(db, 'resources')]}


@router.get('/stations/')
def stations(category: str = '', q: str = '', model: str = '', payment: str = '', sort: str = 'recommended', page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = [public_json(r) for r in published(db, 'stations')]
    if category:
        rows = [r for r in rows if category in r.get('categories', [r.get('category')])]
    if q:
        rows = [r for r in rows if q.lower() in (r['name'] + r.get('domain', '') + r.get('summary', '')).lower()]
    if model:
        rows = [r for r in rows if model in r.get('models', [])]
    if payment:
        rows = [r for r in rows if payment in r.get('payments', [])]
    if sort == 'newest': rows.sort(key=lambda r: r.get('listedAt') or r['created'], reverse=True)
    else: rows.sort(key=lambda r: r.get('rank') or 100000)
    start = (page - 1) * page_size
    return {'items': rows[start:start + page_size], 'total': len(rows), 'page': page, 'pageSize': page_size}


@router.get('/stations/{slug}/')
def station(slug: str, db: Session = Depends(get_db)):
    row = db.scalar(select(Record).where(Record.module == 'stations', Record.slug == slug, Record.status == '已收录'))
    if not row:
        redirect = db.get(PageRedirect, '/stations/' + slug + '/')
        if redirect:
            return {'redirect': redirect.destination}
        raise HTTPException(404, '站点不存在或已下架')
    today = now().date().isoformat()
    notices = [public_json(r) for r in published(db, 'station-notices') if r.data.get('stationId') in [row.id, row.name] and (not r.data.get('start') or r.data['start'] <= today) and (not r.data.get('end') or r.data['end'] >= today)] if row.data.get('noticeDisplay') not in ['隐藏', '关闭'] else []
    notices.sort(key=lambda n: (n.get('pinned') == '是', n.get('start', ''), n.get('created', '')), reverse=True)
    reviews = [record_json(r) for r in published(db, 'reviews', ['已通过']) if r.data.get('stationId') == row.id]
    reports = db.scalars(select(Report).where(Report.station_id == row.id, Report.status == '已通过', Report.visibility == '公开可见').order_by(Report.created_at.desc()).limit(12))
    pricing = [price_json(db, r) for r in published(db, 'pricing') if r.data.get('stationId') == row.id or r.data.get('station') in [row.id, row.name]]
    source = db.scalar(select(Record).where(Record.module == 'source-pricing', Record.slug == slug))
    from .station_sources import public_snapshot
    return {**public_json(row), 'channelSnapshot': public_snapshot(row), 'notices': notices, 'reviews': reviews, 'reports': [dict(id=r.id, model=r.model, type=r.test_type, score=r.score, date=r.created_at.isoformat()) for r in reports], 'pricing': pricing, 'sourcePricing': {k:v for k,v in source.data.items() if k != 'billingRules'} if source else None}


@router.get('/pricing/')
def pricing(db: Session = Depends(get_db)):
    sources = []
    for row in published(db, 'source-pricing'):
        data = {k:v for k,v in record_json(row).items() if k != 'billingRules'}
        # Lists need display cells only. Full per-model billing evidence stays in
        # the station endpoint and database, keeping Next's cache below 2 MB.
        data['rows'] = [{k:v for k,v in value.items() if k in ['cells', 'brand', 'ecosystem']} for value in data.get('rows', [])]
        sources.append(data)
    return {'items': [price_json(db, r) for r in published(db, 'pricing')], 'source': sources, 'dataAsOf': max((r.get('dataAsOf', '') for r in sources), default=seed['pricing']['dataAsOf'])}


@router.get('/coding-plans/')
def coding_plans(db: Session = Depends(get_db)):
    return {'items': [public_json(r) for r in published(db, 'coding-plans')]}


@router.get('/model-directory/')
def model_directory(slug: str = '', db: Session = Depends(get_db)):
    rows = published(db, 'model-directory', ['已发布'])
    if slug: rows = [r for r in rows if r.slug == slug]
    values = []
    for row in rows:
        data = public_json(row)
        if not slug:
            model = data['model']
            fields = ['modelId', 'releaseDate', 'modelType', 'contextTokens', 'maxOutputTokens', 'officialPricing', 'bestRelay', 'supportsReasoning', 'supportsToolCall', 'supportsStructuredOutput', 'openWeights', 'inputText', 'inputImage', 'inputAudio', 'inputVideo', 'inputPdf', 'outputText', 'outputImage', 'outputAudio', 'outputVideo']
            data['model'] = {k: model.get(k) for k in fields}
            data['model']['organization'] = {k: model['organization'].get(k) for k in ['organizationId', 'nameZh', 'nameEn', 'logoUrl']}
        values.append(data)
    return {'items': values, 'total': len(rows), 'updatedAt': max((r.data.get('collectedAt', '') for r in rows), default='')}


@router.get('/model-packages/')
def model_packages(slug: str = '', db: Session = Depends(get_db)):
    rows = published(db, 'model-packages', ['已发布'])
    if slug: rows = [r for r in rows if r.slug == slug]
    values = []
    for row in rows:
        data = public_json(row)
        if not slug: data['plans'] = [{k: p.get(k) for k in ['planName', 'planKey', 'prices', 'status']} for p in data['plans']]
        values.append(data)
    return {'items': values, 'total': len(rows), 'updatedAt': max((r.data.get('collectedAt', '') for r in rows), default='')}


@router.get('/content/')
def content(path: str = '/', db: Session = Depends(get_db)):
    target = path.rstrip('/') or '/'
    record = db.scalar(select(Record).where(Record.module == 'page-content', Record.slug == target, Record.status == '已发布'))
    seo = next((r for r in published(db, 'seo') if r.data.get('path', '').rstrip('/') == path.rstrip('/')), None)
    article = db.scalar(select(Record).where(Record.module == 'articles', Record.slug == target.removeprefix('/articles/'), Record.status == '已发布'))
    return {'page': record_json(record) if record else None, 'seo': record_json(seo) if seo else None, 'article': record_json(article) if article else None}


@router.get('/reports/')
def recent_reports(db: Session = Depends(get_db)):
    rows = db.scalars(select(Report).where(Report.status == '已通过', Report.visibility == '公开可见').order_by(Report.created_at.desc()).limit(6))
    return {'items': [dict(id=r.id, model=r.model, type=r.test_type, score=r.score, stationId=r.station_id, date=r.created_at.isoformat()) for r in rows]}


@router.get('/reports/{id}/')
def report(id: str, token: str = '', db: Session = Depends(get_db)):
    r = db.get(Report, id)
    if not r or r.status != '已通过' or (r.visibility != '公开可见' and (not token or token != r.share_token)):
        raise HTTPException(404, '报告不存在、尚未公开或分享已失效')
    return dict(id=r.id, model=r.model, type=r.test_type, score=r.score, date=r.created_at.isoformat(), evidence=r.evidence, visibility=r.visibility)


@router.get('/sitemap/')
def sitemap(db: Session = Depends(get_db)):
    from .localization import builtins, public_bundle
    dictionary = {**builtins(), **public_bundle(db)['dictionary']}
    def model_english_ready(row):
        model = row.data.get('model', {})
        labels = [row.name, model.get('displayName', ''), model.get('license', ''),
                  (model.get('organization') or {}).get('nameEn', ''), (model.get('bestRelay') or {}).get('siteName', '')]
        for quote in [model.get('officialPricing') or {}, model.get('bestRelay') or {}]:
            unit = quote.get('unitLabel') or quote.get('unit') or ''
            labels.append(unit.get('en') or unit.get('zh') or '' if isinstance(unit, dict) else unit)
        description = (model.get('description') or {}).get('en') or (model.get('subtitle') or {}).get('en') or dictionary.get((model.get('description') or {}).get('zh') or row.data.get('summary', ''), '')
        return bool(description) and all(not re.search(r'[\u3400-\u9fff]', dictionary.get(label, label)) for label in labels + [description])
    # Snapshot detail routes are supplied by current published records below.
    # A tool such as model-fingerprint is a static page, not a model detail.
    paths = [{'path': r['path'] + ('/' if r['path'] != '/' else ''), 'updated': None} for r in seed['routes'] if r['index'] and not (r['id'].startswith(('station-', 'model-', 'category-')) and r['path'].startswith(('/stations/', '/models/')))]
    for module, prefix in [('stations', '/stations/'), ('categories', '/stations/categories/'), ('models', '/models/'), ('articles', '/articles/'), ('model-directory', '/models/'), ('model-packages', '/coding-plans/')]:
        paths += [{'path': prefix + r.slug + '/', 'updated': r.updated_at.isoformat(), **({'direct': module == 'model-directory', 'englishReady': model_english_ready(r) if module == 'model-directory' else False} if module in ['model-directory', 'model-packages'] else {})} for r in published(db, module) if r.slug]
    return {'items': paths}
