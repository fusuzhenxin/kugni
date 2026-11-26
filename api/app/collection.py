"""Hvoy public catalog adapter and database-backed, opt-in scheduler."""
import json
import logging
import re
import time
from datetime import datetime, timedelta
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from croniter import croniter
from fastapi import HTTPException
from sqlalchemy import select, update

from .cache import enqueue_invalidation
from .db import SessionLocal
from .models import Record, now
from .localization import sync_record
from .testing import next_run

ORIGIN = 'https://www.hvoyai.com'
SOURCE = 'hvoy'
logger = logging.getLogger(__name__)
DATASETS = ['模型大全', '模型套餐']


class PayloadParser(HTMLParser):
    def __init__(self, identity):
        super().__init__(convert_charrefs=False)
        self.identity, self.capture, self.parts = identity, False, []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('id') == self.identity:
            self.capture = True

    def handle_endtag(self, tag):
        if tag == 'script': self.capture = False

    def handle_data(self, data):
        if self.capture: self.parts.append(data)


def payload(html, identity):
    parser = PayloadParser(identity)
    parser.feed(html)
    try: data = json.loads(''.join(parser.parts))
    except (ValueError, TypeError): raise ValueError('来源页面的数据结构已变化：' + identity)
    if not isinstance(data, dict) or data.get('ok') is not True:
        raise ValueError('来源未返回有效数据')
    return data


def slug(value):
    result = re.sub(r'[^a-z0-9]+', '-', str(value).lower()).strip('-')
    if not result or len(result) > 150: raise ValueError('来源路径标识无效')
    return result


class SourceClient:
    """No admin-configurable URL, redirects off, bounded responses, modest pacing."""
    def __init__(self):
        self.client = httpx.Client(timeout=30, follow_redirects=False,
                                   headers={'User-Agent': 'KugniCatalog/1.0 (+https://www.kugni.com)'})
        self.last_request = 0

    def get(self, path):
        if not path.startswith(('/models/', '/coding-plans/', '/__provider-price/modellist')) or path.startswith('//'):
            raise ValueError('不允许的采集路径')
        for _ in range(4):
            url = urljoin(ORIGIN, path)
            if urlparse(url).netloc != 'www.hvoyai.com' or urlparse(url).scheme != 'https':
                raise ValueError('来源跳转到了未授权地址')
            time.sleep(max(0, .4 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            with self.client.stream('GET', url) as response:
                if response.is_redirect:
                    path = urljoin(url, response.headers['location'])
                    continue
                response.raise_for_status()
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 12_000_000: raise ValueError('来源响应超过大小限制')
                return body.decode('utf-8')
        raise ValueError('来源重定向次数过多')

    def close(self):
        self.client.close()


def fetch_models(client, heartbeat=lambda: None):
    first = payload(client.get('/models/'), '__MODEL_LIST_PAYLOAD__')
    total, pages = int(first['total']), int(first['totalPages'])
    if not 1 <= total <= 20000 or not 1 <= pages <= 200:
        raise ValueError('模型分页数量异常，保留原数据')
    result = list(first['models'])
    for page in range(2, pages + 1):
        # The HTML page ignores query pagination; use the same public endpoint as its UI.
        data = json.loads(client.get('/__provider-price/modellist?page=' + str(page)))
        if data.get('ok') is not True or data.get('page') != page or data.get('total') != total:
            raise ValueError('模型分页不完整，保留原数据')
        result.extend(data['models'])
        heartbeat()
    if len(result) != total or len({slug(m['slug']) for m in result}) != total:
        raise ValueError('模型数量不一致或路径重复，保留原数据')
    return result, first['updatedAt']


def fetch_packages(client, heartbeat=lambda: None):
    listing = payload(client.get('/coding-plans/'), '__CODING_PLANS_PAYLOAD__')
    groups = {}
    for plan in listing['plans']:
        seller, product = plan['sellerKey'], plan['productKey']
        if not all(re.fullmatch(r'[a-z0-9_\-]+', part) for part in [seller, product]):
            raise ValueError('套餐来源路径异常')
        groups.setdefault((seller, product), set()).add(plan['planKey'])
    if not groups or len(groups) > 300: raise ValueError('套餐列表为空或数量异常，保留原数据')
    result = []
    for seller, product in groups:
        path = '/coding-plans/' + seller + '/' + product + '/'
        data = payload(client.get(path), '__CODING_PLAN_PRODUCT_PAYLOAD__')
        info = data['product']
        keys = [p['planKey'] for p in data['plans']]
        if info['sellerKey'] != seller or info['productKey'] != product or not keys or len(set(keys)) != len(keys) or set(keys) != groups[(seller, product)]:
            raise ValueError('套餐详情与列表不一致，保留原数据')
        result.append({'product': info, 'plans': data['plans'], 'sourceUrl': ORIGIN + path,
                       'sourceUpdatedAt': data.get('updatedAt') or listing.get('updatedAt')})
        heartbeat()
    if len({slug(p['product']['sellerKey']) + '/' + slug(p['product']['productKey']) for p in result}) != len(result):
        raise ValueError('套餐路径重复，保留原数据')
    return result


def validate_task(data):
    if not isinstance(data.get('datasets'), list) or not data['datasets'] or any(x not in DATASETS for x in data['datasets']):
        raise HTTPException(422, '请选择模型大全或模型套餐')
    schedule = data.get('schedule', '仅手动')
    if schedule not in ['仅手动', '间隔执行', '每日定时', 'Cron 表达式']:
        raise HTTPException(422, '更新周期无效')
    data['timezone'] = 'Asia/Shanghai'
    if schedule == '间隔执行':
        try:
            interval = float(data.get('interval') or 360)
            if not interval.is_integer() or not 60 <= interval <= 43200: raise ValueError()
        except (ValueError, TypeError): raise HTTPException(422, '更新间隔为 60–43200 分钟的整数')
        data['interval'] = int(interval)
    if schedule == '每日定时' and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', str(data.get('dailyTime', ''))):
        raise HTTPException(422, '请选择每天更新时间')
    if schedule == 'Cron 表达式':
        expression = data.get('cron', '')
        if not isinstance(expression, str) or len(expression.split()) != 5 or not croniter.is_valid(expression):
            raise HTTPException(422, '需要有效的五段 Cron 表达式')
        cursor = croniter(expression, now())
        times = [cursor.get_next(datetime) for _ in range(50)]
        if any((b - a).total_seconds() < 3600 for a, b in zip(times, times[1:])):
            raise HTTPException(422, '采集频率不能高于每小时一次')
    data['_nextRun'] = next_run(data) if data.get('status') == '启用' else None
    return data


def queue_collection(db, task, actor_id=None):
    pending = list(db.scalars(select(Record).where(Record.module == 'collection-runs', Record.status.in_(['排队中', '采集中']))))
    if pending: raise HTTPException(409, '已有采集任务排队或运行，请等待完成')
    row = Record(module='collection-runs', name=task.name, status='排队中', owner_id=actor_id,
                 data={'taskId': task.id, 'datasets': task.data['datasets'], 'syncMode': task.data.get('syncMode', '保留人工修改'), 'trigger': '手动' if actor_id else '定时', 'progress': '等待 worker', 'startedAt': '', 'finishedAt': '', 'error': ''})
    db.add(row)
    db.flush()
    return row


def upsert_catalog(db, module, identity, name, values, preserve):
    row = db.scalar(select(Record).where(Record.module == module, Record.slug == identity))
    if not row:
        row = Record(module=module, slug=identity, name=name, status='已发布', data={})
        db.add(row)
        created = True
    else: created = False
    manual = row.data.get('_manualFields', []) if preserve else []
    overrides = {k: row.data[k] for k in manual if k in row.data}
    row.name = overrides.get('name', name)
    row.status = overrides.get('status', '已发布')
    row.data = {**values, 'name': row.name, 'status': row.status, **overrides, '_manualFields': manual}
    row.version = (row.version or 0) + 1
    if module in ['model-directory', 'model-packages']:
        db.flush()
        sync_record(db, row)
    return created


def process_collection(run_id, client=None):
    own_client = client is None
    client = client or SourceClient()
    def heartbeat(message='采集来源详情'):
        with SessionLocal() as db:
            run = db.get(Record, run_id)
            run.data = {**run.data, 'heartbeat': now().isoformat(), 'progress': message}
            db.commit()
    try:
        with SessionLocal() as db:
            run = db.get(Record, run_id)
            if not run or run.status != '采集中': return
            datasets, preserve = run.data['datasets'], run.data.get('syncMode') != '跟随来源更新'
        models, packages, updated = [], [], ''
        if '模型大全' in datasets:
            heartbeat('读取模型及全部分页')
            models, updated = fetch_models(client, heartbeat)
        if '模型套餐' in datasets:
            heartbeat('读取套餐列表及每组产品详情')
            packages = fetch_packages(client, heartbeat)
        created = changed = 0
        # Publish only once every selected dataset has passed completeness checks.
        with SessionLocal() as db:
            stamp = now().isoformat()
            seen = {'model-directory': set(), 'model-packages': set()}
            for model in models:
                identity = slug(model['slug'])
                seen['model-directory'].add(identity)
                values = {'summary': model.get('subtitle', {}).get('zh', ''), 'modelId': model['modelId'], 'vendor': model['organization']['nameZh'],
                          'model': model, 'source': SOURCE, 'sourceUrl': ORIGIN + '/models/' + model['slug'] + '/', 'sourceUpdatedAt': updated, 'collectedAt': stamp}
                added = upsert_catalog(db, 'model-directory', identity, model['displayName'], values, preserve)
                created += added; changed += not added
            for package in packages:
                info = package['product']
                identity = slug(info['sellerKey']) + '/' + slug(info['productKey'])
                seen['model-packages'].add(identity)
                values = {**package, 'summary': info.get('summary', ''), 'vendor': info['sellerName'], 'tierCount': len(package['plans']), 'source': SOURCE, 'collectedAt': stamp}
                added = upsert_catalog(db, 'model-packages', identity, info['productName'], values, preserve)
                created += added; changed += not added
            for module, identities in seen.items():
                if not identities: continue
                for row in db.scalars(select(Record).where(Record.module == module)):
                    if row.data.get('source') == SOURCE and row.slug not in identities and 'status' not in row.data.get('_manualFields', []):
                        row.status = '来源已移除'
            run = db.get(Record, run_id)
            run.status = '已完成'
            run.data = {**run.data, 'modelCount': len(models), 'productCount': len(packages), 'tierCount': sum(len(p['plans']) for p in packages), 'createdCount': created, 'updatedCount': changed, 'finishedAt': stamp, 'progress': '采集完成，已刷新公开页面'}
            task = db.get(Record, run.data['taskId'])
            if task: task.data = {**task.data, 'lastRun': stamp, 'lastResult': run.status, 'lastCounts': f'{len(models)} 个模型 / {len(packages)} 组套餐'}
            enqueue_invalidation(db, 'model-directory')
            db.commit()
    except Exception as exc:
        logger.exception('Catalog collection %s failed', run_id)
        message = ('来源返回 HTTP ' + str(exc.response.status_code)) if isinstance(exc, httpx.HTTPStatusError) else '来源请求失败，请稍后重试' if isinstance(exc, httpx.HTTPError) else str(exc)[:240] if isinstance(exc, (ValueError, KeyError, TypeError)) else '采集失败，请检查 worker 日志'
        with SessionLocal() as db:
            run = db.get(Record, run_id)
            if run:
                run.status = '失败'
                run.data = {**run.data, 'error': message, 'finishedAt': now().isoformat(), 'progress': '保留上一次已发布数据'}
                task = db.get(Record, run.data['taskId'])
                if task: task.data = {**task.data, 'lastRun': run.data['finishedAt'], 'lastResult': '失败'}
                db.commit()
    finally:
        if own_client: client.close()


def collection_tick():
    with SessionLocal() as db:
        for run in db.scalars(select(Record).where(Record.module == 'collection-runs', Record.status == '采集中')):
            heartbeat = run.data.get('heartbeat') or run.data.get('startedAt')
            if heartbeat and datetime.fromisoformat(heartbeat) < now() - timedelta(minutes=10):
                run.status = '失败'
                run.data = {**run.data, 'error': '采集进程失联，可重新运行；上次数据仍保留', 'finishedAt': now().isoformat()}
        tasks = list(db.scalars(select(Record).where(Record.module == 'collection-tasks', Record.status == '启用').with_for_update(skip_locked=True)))
        for task in tasks:
            due = task.data.get('_nextRun')
            if due and datetime.fromisoformat(due) <= now():
                try: queue_collection(db, task)
                except HTTPException: continue
                task.data = {**task.data, '_nextRun': next_run(task.data)}
        db.commit()
        run = db.scalar(select(Record).where(Record.module == 'collection-runs', Record.status == '排队中').order_by(Record.created_at).limit(1).with_for_update(skip_locked=True))
        if not run: return False
        data = {**run.data, 'startedAt': now().isoformat(), 'heartbeat': now().isoformat()}
        claimed = db.execute(update(Record).where(Record.id == run.id, Record.status == '排队中').values(status='采集中', data=data))
        run_id = run.id
        db.commit()
        if not claimed.rowcount: return False
    process_collection(run_id)
    return True
