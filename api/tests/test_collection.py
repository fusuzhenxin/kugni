import copy
import json
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.collection import fetch_models, process_collection, queue_collection, collection_tick
from app.db import SessionLocal
from app.models import Record, Role, User
from app.testing import next_run
from .conftest import login, register

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/hvoy.json').read_text(encoding='utf-8'))
BASE = '/api/v1/admin/records/collection-tasks/'


class Source:
    def __init__(self, broken=False, collision=False):
        self.broken, self.collision = broken, collision
        self.calls = []

    def get(self, path):
        self.calls.append(path)
        if path == '/models/':
            data = dict(ok=True, total=2, totalPages=2, models=FIXTURE['models'][:1], updatedAt='2026-11-25')
            identity = '__MODEL_LIST_PAYLOAD__'
        elif path.startswith('/__provider-price/modellist'):
            model = copy.deepcopy(FIXTURE['models'][1])
            if self.collision: model['slug'] = FIXTURE['models'][0]['slug'].replace('-', '_')
            return json.dumps(dict(ok=True, page=1 if self.broken else 2, total=2, models=[model]))
        elif path == '/coding-plans/':
            product = FIXTURE['package']['product']
            data = dict(ok=True, plans=[dict(sellerKey=product['sellerKey'], productKey=product['productKey'], planKey=p['planKey']) for p in FIXTURE['package']['plans']])
            identity = '__CODING_PLANS_PAYLOAD__'
        else:
            if self.broken: raise ValueError('source detail unavailable')
            data = copy.deepcopy(FIXTURE['package'])
            identity = '__CODING_PLAN_PRODUCT_PAYLOAD__'
        return '<script id="' + identity + '" type="application/json">' + json.dumps(data) + '</script>'


def run_source(source=None, datasets=None, preserve=True):
    with SessionLocal() as db:
        task = db.get(Record, 'hvoy-catalog-task')
        task.data = {**task.data, 'datasets': datasets or ['模型大全', '模型套餐'], 'syncMode': '保留人工修改' if preserve else '跟随来源更新'}
        run = queue_collection(db, task)
        run.status = '采集中'
        identity = run.id
        db.commit()
    process_collection(identity, source or Source())
    with SessionLocal() as db:
        row = db.get(Record, identity)
        return row.status, row.data


def test_full_pagination_products_and_public_projection(client):
    source = Source()
    status, data = run_source(source)
    assert status == '已完成', data.get('error')
    assert data['modelCount'] == 2 and data['productCount'] == 1 and data['tierCount'] == 5
    assert '/__provider-price/modellist?page=2' in source.calls
    models = client.get('/api/v1/public/model-directory/').json()
    assert models['total'] == 2
    assert 'description' not in models['items'][0]['model']
    detail = client.get('/api/v1/public/model-directory/', params={'slug': models['items'][0]['slug']}).json()['items'][0]
    assert detail['model']['description']['en']
    assert not any(k.startswith('_') for k in detail)
    packages = client.get('/api/v1/public/model-packages/').json()
    item = packages['items'][0]
    assert len(item['plans']) == 5 and 'notes' not in item['plans'][0]
    plans = client.get('/api/v1/public/model-packages/', params={'slug': item['slug']}).json()['items'][0]['plans']
    pro = next(p for p in plans if p['planName'] == 'Pro')
    assert {(p['currency'], p['period'], p['amountCents']) for p in pro['prices']} >= {('USD', 'month', 2000), ('USD', 'year', 20000)}
    paths = client.get('/api/v1/public/sitemap/').json()['items']
    assert any(p['path'] == '/coding-plans/' + item['slug'] + '/' and not p['direct'] for p in paths)
    with SessionLocal() as db:
        assert db.scalar(select(Record).where(Record.module == 'translations', Record.data['module'].as_string() == 'model-packages'))


def test_bad_pagination_and_normalized_collision_do_not_publish(client):
    for source in [Source(broken=True), Source(collision=True)]:
        with pytest.raises(ValueError): fetch_models(source)
    run_source()
    before = client.get('/api/v1/public/model-directory/').json()
    status, data = run_source(Source(broken=True))
    assert status == '失败' and data['progress'] == '保留上一次已发布数据'
    assert client.get('/api/v1/public/model-directory/').json() == before
    with SessionLocal() as db:
        assert db.get(Record, 'hvoy-catalog-task').data['lastResult'] == '失败'


def test_detail_failure_keeps_both_datasets_atomic(client):
    class BrokenDetail(Source):
        def get(self, path):
            if path.startswith('/coding-plans/') and path != '/coding-plans/': raise ValueError('detail unavailable')
            return super().get(path)
    status, _ = run_source(BrokenDetail())
    assert status == '失败'
    assert client.get('/api/v1/public/model-directory/').json()['total'] == 0
    assert client.get('/api/v1/public/model-packages/').json()['total'] == 0


def test_missing_package_tiers_are_rejected(client):
    class MissingTier(Source):
        def get(self, path):
            body = super().get(path)
            if path.startswith('/coding-plans/') and path != '/coding-plans/':
                data = copy.deepcopy(FIXTURE['package'])
                data['plans'].pop()
                return '<script id="__CODING_PLAN_PRODUCT_PAYLOAD__">' + json.dumps(data) + '</script>'
            return body
    status, _ = run_source(MissingTier())
    assert status == '失败'
    assert client.get('/api/v1/public/model-packages/').json()['total'] == 0


def test_import_idempotent_and_editorial_override(client):
    run_source()
    row = client.get('/api/v1/public/model-directory/').json()['items'][0]
    login(client)
    path = '/api/v1/admin/records/model-directory/' + row['id'] + '/'
    assert client.patch(path, json={'values': {'name': '人工标题', 'summary': '人工介绍'}}).status_code == 200
    assert run_source()[0] == '已完成'
    kept = client.get(path).json()
    assert kept['name'] == '人工标题' and kept['summary'] == '人工介绍'
    assert client.get('/api/v1/public/model-directory/').json()['total'] == 2
    assert run_source(preserve=False)[0] == '已完成'
    assert client.get(path).json()['name'] == row['name']


def test_schedule_validation_and_beijing_time(client):
    login(client)
    task = client.get(BASE + 'hvoy-catalog-task/').json()
    assert task['schedule'] == '仅手动'
    for values in [{'schedule': '每日定时', 'dailyTime': '25:00'}, {'schedule': '间隔执行', 'interval': 30}, {'schedule': 'Cron 表达式', 'cron': '*/5 * * * *'}, {'datasets': ['任意网站']}]:
        assert client.patch(BASE + task['id'] + '/', json={'values': values}).status_code == 422
    edited = client.patch(BASE + task['id'] + '/', json={'values': {'schedule': '每日定时', 'dailyTime': '03:30'}})
    assert edited.status_code == 200 and edited.json()['nextRun'].endswith('03:30')
    assert next_run({'schedule': '每日定时', 'dailyTime': '03:30'}, datetime(2026, 11, 24, 12)) == '2026-11-24T19:30:00'
    assert client.patch(BASE + task['id'] + '/', json={'values': {'status': '停用'}}).status_code == 200
    with SessionLocal() as db:
        assert db.get(Record, task['id']).data['_nextRun'] is None
    assert collection_tick() is False


def test_run_requires_separate_permission_and_deduplicates(client):
    assert client.get(BASE).status_code == 401
    register(client)
    assert client.post(BASE + 'hvoy-catalog-task/actions/run/', json={}).status_code == 403
    with SessionLocal() as db:
        db.add(Role(id='collection-reader', name='采集只读', code='collection-reader', surface='platform', permissions=['platform.collection-tasks.read']))
        db.get(User, 'local-reviewer').role_id = 'collection-reader'
        db.commit()
    login(client, 'local-reviewer@kugni.com')
    assert client.get(BASE).status_code == 200
    assert client.post(BASE + 'hvoy-catalog-task/actions/run/', json={}).status_code == 403
    login(client)
    assert client.post(BASE + 'hvoy-catalog-task/actions/run/', json={}).status_code == 200
    assert client.post(BASE + 'hvoy-catalog-task/actions/run/', json={}).status_code == 409



