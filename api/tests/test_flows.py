import json
from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.db import SessionLocal
from app.models import Credential, Execution, Ledger, Record, Report, Role, User, Wallet, now
from app.catalog import MODULES
from .conftest import login, register

API = '/api/v1'


def create(client, module, values):
    response = client.post(f'{API}/admin/records/{module}/', json={'values': values})
    assert response.status_code == 201, response.text
    return response.json()


def test_auth_csrf_permissions_and_revocation(client):
    assert client.get(API + '/admin/context/').status_code == 401
    user = login(client)
    assert user['surface'] == 'platform'
    assert client.cookies.get('kugni_session')
    token = client.headers.pop('x-csrf-token')
    assert client.post(API + '/admin/records/categories/', json={'values': {}}).status_code == 403
    client.headers['x-csrf-token'] = token
    assert client.post(API + '/auth/logout/').status_code == 200
    assert client.get(API + '/admin/context/').status_code == 401
    register(client)
    assert client.get(API + '/admin/records/users/').status_code == 403
    assert client.post(API + '/admin/records/stations/', json={'values': {}}).status_code == 403


def test_station_edit_redirect_chain_and_bulk_atomicity(client):
    login(client)
    station = client.get(API + '/admin/records/stations/').json()['items'][0]
    id, old_slug = station['id'], station['slug']
    for slug in ['verified-station', 'renamed-station']:
        response = client.patch(f'{API}/admin/records/stations/{id}/', json={'values': {'slug': slug, 'summary': '这是一次接口验证更新'}})
        assert response.status_code == 200, response.text
    assert client.get(f'{API}/public/stations/{old_slug}/').json()['redirect'] == '/stations/renamed-station/'
    assert client.get(f'{API}/public/stations/verified-station/').json()['redirect'] == '/stations/renamed-station/'
    assert client.get(f'{API}/public/stations/renamed-station/').json()['summary'] == '这是一次接口验证更新'
    response = client.post(API + '/admin/records/stations/bulk/', json={'ids': [id, 'missing-id'], 'action': 'edit', 'values': {'status': '已隐藏'}})
    assert response.status_code == 404
    assert client.get(f'{API}/public/stations/renamed-station/').status_code == 200
    with SessionLocal() as db: assert db.scalar(select(Record).where(Record.module == 'cache-outbox'))
    assert client.post(f'{API}/admin/records/stations/{id}/actions/delete/', json={}).status_code == 200
    assert client.get(f'{API}/public/stations/{old_slug}/').status_code == 404
    assert client.get(f'{API}/public/redirect/', params={'path': '/stations/' + old_slug + '/'}).json()['destination'] is None


def test_minimal_station_public_contract(client):
    login(client)
    station = create(client, 'stations', {'name': '基础资料站点', 'slug': 'minimal-station', 'domain': 'https://example.com', 'summary': '先发布基本信息', 'status': '已收录'})
    detail = client.get(f'{API}/public/stations/{station["slug"]}/').json()
    listed = client.get(API + '/public/stations/', params={'q': station['name']}).json()['items'][0]
    for data in [detail, listed]:
        for key in ['models', 'payments', 'tags', 'categories']:
            assert data[key] == []
        assert data['serviceStatus'] == '待核验'
        assert data['sourceDate']
        assert 'ownerId' not in data


def test_reviewer_scope_and_role_escalation(client):
    login(client, 'local-reviewer@kugni.com')
    assert client.get(API + '/admin/records/users/').status_code == 403
    assert client.post(API + '/admin/records/stations/', json={'values': {}}).status_code == 403
    login(client)
    custom = create(client, 'roles', {'name': '仅管理用户', 'code': 'limited-user-admin', 'surface': 'platform', 'scope': 'all', 'permissions': ['platform.users.read', 'platform.users.create'], 'status': '启用'})
    create(client, 'users', {'name': '受限管理员', 'email': 'limited@example.com', 'password': 'KugniTest!2026', 'roleId': custom['id'], 'status': '正常'})
    login(client, 'limited@example.com')
    response = client.post(API + '/admin/records/users/', json={'values': {'name': '越权用户', 'email': 'escalated@example.com', 'password': 'KugniTest!2026', 'roleId': 'super'}})
    assert response.status_code == 403


def test_points_idempotency_and_redemption_refund(client):
    user = register(client)
    assert client.get(API + '/member/points/').json()['balance'] == 0
    assert client.post(API + '/member/points/claim/checkin/').status_code == 200
    assert client.post(API + '/member/points/claim/checkin/').status_code == 409
    assert client.post(API + '/member/points/claim/first-check/').status_code == 409
    with SessionLocal() as db:
        db.add(Record(id='test-reward', module='rewards', name='可发放权益', status='启用', data={'cost': 3, 'stock': 1, 'description': '测试权益'})); db.commit()
    assert client.post(API + '/member/points/redeem/test-reward/').status_code == 200
    assert client.post(API + '/member/points/redeem/test-reward/').status_code == 409
    points = client.get(API + '/member/points/').json()
    assert points['balance'] == 2
    rid = points['redemptions'][0]['id']
    login(client)
    assert client.patch(f'{API}/admin/records/redemptions/{rid}/', json={'values': {'status': '已取消', 'fulfillment': '权益取消，退还积分'}}).status_code == 200
    assert client.patch(f'{API}/admin/records/redemptions/{rid}/', json={'values': {'status': '已取消', 'fulfillment': '重复取消'}}).status_code == 409
    with SessionLocal() as db:
        assert db.get(Wallet, user['id']).balance == 5
        assert db.get(Record, 'test-reward').data['stock'] == 1
        assert len(list(db.scalars(select(Ledger).where(Ledger.user_id == user['id'])))) == 3


def test_invite_verified_reward_only_once(client):
    inviter = register(client)
    invited = register(client, '受邀用户', 'invited@example.com', inviter['id'])
    login(client)
    for _ in range(2):
        response = client.patch(f'{API}/admin/records/users/{invited["id"]}/', json={'values': {'verified': '已核验'}})
        assert response.status_code == 200, response.text
    with SessionLocal() as db: assert db.get(Wallet, inviter['id']).balance == 50


def test_publisher_ownership_orders_and_campaign_statistics(client):
    publisher = login(client, 'local-publisher@kugni.com')
    assert client.get(API + '/admin/records/p-account/').json()['total'] == 1
    values = dict(name='真实排期验证', headline='测试广告', placement='placement-0', target='https://www.kugni.com/', start=now().date().isoformat(), end=(now() + timedelta(days=6)).date().isoformat(), budget=1280, status='待审核')
    campaign = create(client, 'p-campaigns', values)
    assert client.get(API + '/admin/records/campaigns/').status_code == 403
    login(client)
    assert client.post(f'{API}/admin/records/adreview/{campaign["id"]}/actions/approve/', json={}).status_code == 200
    login(client, 'local-publisher@kugni.com')
    order = client.post(f'{API}/publisher/campaigns/{campaign["id"]}/order/').json()
    assert order['status'] == '待付款'
    assert client.post(f'{API}/admin/orders/{order["id"]}/confirm-payment/', json={'reference': 'PAY-TEST-001'}).status_code == 403
    login(client)
    assert client.post(f'{API}/admin/orders/{order["id"]}/confirm-payment/', json={'reference': 'PAY-TEST-001'}).status_code == 200
    assert client.post(f'{API}/admin/orders/{order["id"]}/confirm-payment/', json={'reference': 'PAY-TEST-001'}).status_code == 409
    assert client.get(API + '/public/ads/?placement=首页横幅').json()['items'][0]['id'] == campaign['id']
    with TestClient(app) as outsider:
        register(outsider, email='outsider@example.com')
        assert outsider.get(f'{API}/admin/records/p-campaigns/{campaign["id"]}/').status_code == 403
    login(client, 'local-publisher@kugni.com')
    event = dict(id='event-impression-00001', visitor='visitor-anonymous-001', kind='impression', path='/', campaignId=campaign['id'])
    for _ in range(2): assert client.post(API + '/track/events/', json=event, headers={'User-Agent': 'Mozilla/5.0'}).status_code == 200
    event.update(id='event-pageview-0000001', kind='pageview', campaignId=None)
    assert client.post(API + '/track/events/', json=event, headers={'User-Agent': 'Mozilla/5.0'}).status_code == 200
    stats = client.get(API + '/admin/analytics/p-overview/').json()
    assert stats['impressions'] == 1 and stats['pv'] == 0
    assert stats['campaigns'][0]['id'] == campaign['id']


def test_data_validation_menu_and_seo(client):
    login(client)
    assert client.post(API + '/admin/records/users/', json={'values': {'name': '用户', 'email': 'bad-email', 'password': 'KugniTest!2026'}}).status_code == 422
    assert client.post(API + '/admin/records/menus/', json={'values': {'name': '错误菜单', 'module': 'bad'}}).status_code == 422
    seo = create(client, 'seo', {'name': '首页', 'path': '/', 'title': '首页 SEO 测试', 'description': '测试描述', 'index': '否'})
    assert client.get(API + '/public/content/?path=/').json()['seo']['id'] == seo['id']
    article = create(client, 'articles', {'name': '接口指南', 'slug': 'test-guide', 'status': '已发布', 'body': '完整的文章正文供测试读取。'})
    assert client.get(API + '/public/content/?path=/articles/test-guide/').json()['article']['id'] == article['id']


def test_private_reports_share_review_and_delete(client):
    user = register(client)
    with SessionLocal() as db:
        job = Execution(owner_id=user['id'], name='报告流程', targets=[], settings={}, total=1); db.add(job); db.flush()
        row = Report(execution_id=job.id, owner_id=user['id'], model='test-model', test_type='基础可用性', score=None, evidence={'success': True, 'samples': []}); db.add(row); db.commit(); rid = row.id
    assert client.get(f'{API}/tests/reports/{rid}/').status_code == 200
    assert client.get(f'{API}/public/reports/{rid}/').status_code == 404
    assert client.post(f'{API}/tests/reports/{rid}/share/').status_code == 409
    login(client)
    assert client.post(f'{API}/admin/records/reports/{rid}/actions/approve/', json={}).status_code == 200
    login(client, 'member@example.com')
    assert client.post(f'{API}/tests/reports/{rid}/share/').status_code == 200
    assert client.get(f'{API}/public/reports/{rid}/').status_code == 200
    login(client)
    assert client.post(f'{API}/admin/records/reports/{rid}/actions/delete/', json={}).status_code == 200
    assert client.get(f'{API}/public/reports/{rid}/').status_code == 404


def test_ssrf_and_unconfigured_services(client):
    register(client)
    for host in ['http://127.0.0.1:1234', 'http://169.254.169.254/latest', 'file:///etc/passwd']:
        response = client.post(API + '/tests/executions/', json={'baseUrl': host, 'secret': 'test-secret', 'model': 'gpt-test', 'protocol': 'OpenAI Responses'})
        assert response.status_code == 422, response.text
    assert client.post(API + '/auth/password-reset/request/', json={'email': 'member@example.com'}).status_code == 503


def test_editorial_visibility_and_station_price_association(client):
    login(client)
    station = client.get(API + '/admin/records/stations/').json()['items'][0]
    notice = create(client, 'station-notices', {'name': '公开公告', 'stationId': station['id'], 'body': '当前公告内容', 'start': now().date().isoformat(), 'status': '已发布'})
    create(client, 'station-notices', {'name': '未来公告', 'stationId': station['id'], 'body': '尚未生效', 'start': (now() + timedelta(days=2)).date().isoformat(), 'status': '已发布'})
    create(client, 'pricing', {'name': '精确型号报价', 'station': station['id'], 'modelId': 'gpt-test', 'input': 2, 'output': 6, 'cache': 1, 'multiplier': 1, 'currency': 'CNY', 'unit': '百万 Token', 'status': '启用'})
    response = client.get(f'{API}/public/stations/{station["slug"]}/').json()
    assert [n['id'] for n in response['notices']] == [notice['id']]
    assert response['pricing'][0]['stationName'] == station['name']
    assert 'note' not in response and 'ownerId' not in response
    plan = create(client, 'coding-plans', {'name': '编程计划', 'station': station['id'], 'price': 100, 'currency': 'CNY', 'cycle': '月', 'models': '以服务商说明为准', 'limits': '每日额度需在官网核对', 'url': 'https://www.kugni.com/', 'verifiedAt': now().date().isoformat(), 'status': '草稿'})
    assert client.get(API + '/public/coding-plans/').json()['items'] == []
    assert client.patch(f'{API}/admin/records/coding-plans/{plan["id"]}/', json={'values': {'status': '已发布'}}).status_code == 200
    assert client.get(API + '/public/coding-plans/').json()['items'][0]['id'] == plan['id']


def test_all_imported_directory_records_are_editable(client):
    login(client)
    for key in ['stations', 'categories']:
        for row in client.get(f'{API}/admin/records/{key}/?page_size=100').json()['items']:
            values = {f['key']: row[f['key']] for f in MODULES[key]['fields'] if f['key'] in row}
            response = client.patch(f'{API}/admin/records/{key}/{row["id"]}/', json={'values': values})
            assert response.status_code == 200, (key, row['id'], response.text)


def test_test_trends_uses_reports_not_website_visits(client):
    user = login(client)
    with SessionLocal() as db:
        job = Execution(owner_id=user['id'], name='趋势验证', targets=[], settings={}, total=2); db.add(job); db.flush()
        for success, score in [(True, 80), (False, None)]:
            db.add(Report(execution_id=job.id, owner_id=user['id'], model='test-model', test_type='糖果测试', score=score, evidence={'success': success, 'samples': [{'elapsedMs': 100}]}))
        db.commit()
    data = client.get(API + '/admin/analytics/test-trends/').json()['test']
    assert data['total'] == 2 and data['successRate'] == 50
    assert data['averageScore'] == 80 and data['averageLatency'] == 100
