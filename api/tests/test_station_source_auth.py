import copy
import json
import ssl
from datetime import timedelta
from urllib.parse import urlparse

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import station_sources as sources
from app.catalog import MODULES
from app.db import SessionLocal
from app.models import AuditLog, Credential, Record, Role, User, now
from app.security import decrypt
from app.station_source_adapters import channel_rows, notice_rows
from app.station_source_auth import ConsoleSession, StationTLSContext, load_auth, save_auth
from .conftest import login

BASE = '/api/v1/admin/records/station-source-accounts/'


def account(client, **extra):
    login(client)
    with SessionLocal() as db:
        station = db.scalar(select(Record).where(Record.module == 'stations'))
        sid = station.id
    values = {'name': '采集账号', 'station': sid, 'baseUrl': 'https://example.com', 'adapter': 'Sub2API',
              'account': 'metadata@example.com', 'password': 'test-password-never-public', 'status': '启用', **extra}
    response = client.post(BASE, json={'values': values})
    assert response.status_code == 201, response.text
    return response.json()


def remote(adapter='Sub2API', session=None, handler=None):
    row = Record(id='fixture', data={'baseUrl': 'https://example.com', 'adapter': adapter})
    state = {'account': 'fixture@example.com', 'password': 'do-not-leak', 'session': copy.deepcopy(session or {})}
    calls = []

    def request(req):
        calls.append((req.method, req.url.path, req.headers, json.loads(req.content) if req.content else None))
        return handler(req) if handler else httpx.Response(200, json={'code': 0, 'data': []})
    instance = ConsoleSession(row, state, transport=httpx.MockTransport(request))
    return instance, calls


def test_password_and_sessions_encrypted_and_not_in_admin_or_audit(client):
    row = account(client)
    assert row['authConfigured'] and 'password' not in row and 'session' not in row
    with SessionLocal() as db:
        record = db.get(Record, row['id'])
        assert 'password' not in record.data and 'session' not in record.data
        auth = load_auth(db, record)
        auth['session'] = {'accessToken': 'private-access', 'refreshToken': 'private-refresh'}
        save_auth(db, record, auth); db.commit()
        encrypted = db.get(Credential, record.id).encrypted_secret
        assert 'private-access' not in encrypted and 'test-password-never-public' not in encrypted
        assert json.loads(decrypt(encrypted))['password'] == 'test-password-never-public'
        assert not any('test-password-never-public' in json.dumps(log.data) for log in db.scalars(select(AuditLog)))
    detail = client.get(BASE + row['id'] + '/').text
    assert 'private-access' not in detail and 'private-refresh' not in detail and 'password' not in detail
    response = client.patch(BASE + row['id'] + '/', json={'values': {'password': ''}})
    assert response.status_code == 200
    with SessionLocal() as db:
        assert load_auth(db, db.get(Record, row['id']))['session']['accessToken'] == 'private-access'


def test_new_password_clears_old_session_and_authentication_block(client):
    row = account(client)
    with SessionLocal() as db:
        record = db.get(Record, row['id']); auth = load_auth(db, record)
        auth.update(session={'accessToken': 'obsolete'}, blocked=True)
        save_auth(db, record, auth); db.commit()
    assert client.patch(BASE + row['id'] + '/', json={'values': {'password': 'updated-private-password'}}).status_code == 200
    with SessionLocal() as db:
        auth = load_auth(db, db.get(Record, row['id']))
        assert 'session' not in auth and not auth.get('blocked')


def test_valid_session_reused_across_requests_without_login_or_refresh():
    instance, calls = remote(session={'accessToken': 'valid-access', 'refreshToken': 'valid-refresh'})
    instance.get('/api/v1/announcements'); instance.get('/api/v1/channel-monitors')
    assert len(calls) == 2 and all(method == 'GET' for method, _, _, _ in calls)
    assert all(headers['authorization'] == 'Bearer valid-access' for _, _, headers, _ in calls)
    assert all(headers['host'] == 'example.com' for _, _, headers, _ in calls)


def test_expired_access_refreshes_once_without_password_login():
    def handler(req):
        if req.url.path.endswith('/auth/refresh'):
            assert json.loads(req.content) == {'refresh_token': 'refresh'}
            return httpx.Response(200, json={'code': 0, 'data': {'access_token': 'renewed', 'refresh_token': 'rotated', 'expires_in': 3600}})
        if req.headers.get('authorization') == 'Bearer old': return httpx.Response(401, json={})
        return httpx.Response(200, json={'code': 0, 'data': []})
    instance, calls = remote(session={'accessToken': 'old', 'refreshToken': 'refresh'}, handler=handler)
    instance.get('/api/v1/announcements')
    assert [path for _, path, _, _ in calls] == ['/api/v1/announcements', '/api/v1/auth/refresh', '/api/v1/announcements']
    assert instance.session['refreshToken'] == 'rotated'


def test_expired_refresh_causes_one_login_and_one_retry():
    def handler(req):
        if req.url.path.endswith('/auth/refresh'): return httpx.Response(401, json={})
        if req.url.path.endswith('/auth/login'):
            assert json.loads(req.content)['password'] == 'do-not-leak'
            return httpx.Response(200, json={'code': 0, 'data': {'access_token': 'new', 'expires_in': 60}})
        return httpx.Response(401 if req.headers.get('authorization') == 'Bearer old' else 200, json={'code': 0, 'data': []})
    instance, calls = remote(session={'accessToken': 'old', 'refreshToken': 'expired'}, handler=handler)
    instance.get('/api/v1/announcements')
    assert [path for _, path, _, _ in calls].count('/api/v1/auth/login') == 1
    assert instance.session['lastLoginAt']


@pytest.mark.parametrize('status', [403, 429, 500])
def test_non_expiry_failures_never_trigger_login(status):
    instance, calls = remote(session={'accessToken': 'valid'}, handler=lambda req: httpx.Response(status, json={}))
    with pytest.raises(HTTPException): instance.get('/api/v1/channel-monitors')
    assert len(calls) == 1


def test_failed_login_is_not_retried_for_each_dataset_or_exposed_in_errors():
    instance, calls = remote(handler=lambda req: httpx.Response(401, json={'message': 'invalid email or password do-not-leak'}))
    for path in ['/api/v1/announcements', '/api/v1/channel-monitors']:
        with pytest.raises(HTTPException) as exc: instance.get(path)
        assert 'do-not-leak' not in str(exc.value.detail)
    assert len(calls) == 1 and instance.auth['blocked']


def test_fox_cookie_session_preserves_paths_and_refresh_without_password():
    def handler(req):
        if req.url.path == '/api/auth/login':
            return httpx.Response(200, json={'data': {'user': {'id': 'ignored'}}}, headers=[('set-cookie', 'access=private-cookie; Path=/; HttpOnly; Secure'), ('set-cookie', 'foreign=secret; Domain=evil.example; Path=/')])
        assert req.headers['cookie'] == 'access=private-cookie'
        return httpx.Response(200, json={'data': {'items': []}})
    instance, calls = remote(adapter='Foxcode', handler=handler)
    assert instance.get('/api/user/announcements/timeline') == {'items': []}
    assert len(instance.session['cookies']) == 1
    instance.get('/api/user/announcements/timeline')
    assert [path for _, path, _, _ in calls].count('/api/auth/login') == 1


def test_redirects_never_forward_console_credentials():
    instance, calls = remote(session={'accessToken': 'valid'}, handler=lambda req: httpx.Response(302, headers={'location': 'https://evil.example/'}))
    with pytest.raises(HTTPException): instance.get('/api/v1/announcements')
    assert len(calls) == 1
    for path in ['//evil.example/api', '/api/v1/admin/users']:
        with pytest.raises(ValueError): instance.get(path)


def test_tls_context_keeps_certificate_and_original_hostname_verification(monkeypatch):
    ctx = StationTLSContext('console.example')
    assert ctx.check_hostname and ctx.verify_mode == ssl.CERT_REQUIRED
    seen = {}
    def wrap(self, *args, **kwargs): seen.update(kwargs); return None
    monkeypatch.setattr(ssl.SSLContext, 'wrap_socket', wrap)
    ctx.wrap_socket(None, server_hostname='203.0.113.1')
    assert seen['server_hostname'] == 'console.example'


@pytest.fixture
def trusted_dns(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr('app.station_source_auth.settings', lambda: SimpleNamespace(
        allow_private_targets=False, station_source_proxy_url='http://127.0.0.1:7897',
        station_source_dns_url='https://cloudflare-dns.com/dns-query'))
    # httpx otherwise mounts a real proxy transport ahead of MockTransport.
    original_client = httpx.Client
    monkeypatch.setattr('app.station_source_auth.httpx.Client',
                        lambda **kwargs: original_client(**{**kwargs, 'proxy': None}))


@pytest.mark.parametrize('addresses', [['127.0.0.1'], ['10.0.0.2'], ['1.1.1.1', '169.254.169.254']])
def test_trusted_dns_rejects_private_or_mixed_answers(trusted_dns, addresses):
    instance, calls = remote(handler=lambda req: httpx.Response(200, json={
        'Status': 0, 'Answer': [{'type': 1, 'data': ip} for ip in addresses]}))
    instance.proxy = 'http://127.0.0.1:7897'
    with pytest.raises(HTTPException, match='有效公开地址'):
        instance.resolve_ip(urlparse('https://example.com'), '1.1.1.1')
    assert len(calls) == 1


def test_trusted_dns_pins_public_answer_and_caches_for_one_client(trusted_dns):
    instance, calls = remote(handler=lambda req: httpx.Response(200, json={
        'Status': 0, 'Answer': [{'type': 1, 'data': '1.1.1.1'}]}))
    instance.proxy = 'http://127.0.0.1:7897'
    assert instance.resolve_ip(urlparse('https://example.com'), '8.8.8.8') == '1.1.1.1'
    assert instance.resolve_ip(urlparse('https://example.com'), '8.8.8.8') == '1.1.1.1'
    assert len(calls) == 1 and calls[0][2]['accept'] == 'application/dns-json'


def test_bindings_require_same_station_origin_adapter_and_account_permission(client):
    row = account(client)
    cfg = {'name': '每日采集', 'station': row['station'], 'sourceBaseUrl': 'https://example.com', 'sourceAdapter': 'Sub2API',
           'sourceAccount': row['id'], 'datasets': ['站点公告', '渠道状态'], 'statusAdapter': 'Sub2API 渠道监控',
           'schedule': '每日定时', 'dailyTime': '04:00', 'status': '启用'}
    base = '/api/v1/admin/records/station-sync-tasks/'
    response = client.post(base, json={'values': cfg})
    assert response.status_code == 201, response.text
    tid = response.json()['id']
    assert response.json()['nextRun'] != '仅手动 / 已停用'
    assert client.post(base, json={'values': {**cfg, 'sourceBaseUrl': 'https://example.org'}}).status_code == 422
    assert client.post(base, json={'values': {**cfg, 'sourceAdapter': 'Foxcode'}}).status_code == 422
    assert client.post(BASE + row['id'] + '/actions/delete/', json={}).status_code == 409
    with SessionLocal() as db:
        role = db.get(Role, 'super')
        role.permissions = [p for p in role.permissions if p != 'platform.station-source-accounts.edit']
        db.commit()
    assert client.post(base + tid + '/actions/run/', json={}).status_code == 403


def test_station_metadata_parsers_preserve_attribution_and_stale_status():
    class Fixture:
        def get(self, path):
            if path.endswith('/announcements'):
                return [{'id': 8, 'title': '维护', 'content': '<p>计划维护</p><script>bad()</script>', 'created_at': '2026-01-01T12:00:00Z'}]
            return {'items': [{'name': 'Claude', 'provider': 'anthropic', 'primary_model': 'claude-opus', 'primary_status': 'operational',
                               'timeline': [{'checked_at': (now() - timedelta(hours=1)).isoformat() + 'Z'}], 'availability_7d': 99.8}]}
    cfg = {'sourceAdapter': 'Sub2API', 'statusAdapter': 'Sub2API 渠道监控', 'sourceBaseUrl': 'https://example.com', 'schedule': '每日定时', 'dailyTime': '04:00'}
    notices, warnings = notice_rows(Fixture(), cfg)
    assert notices[0]['body'] == '计划维护' and not warnings
    snapshot = channel_rows(Fixture(), cfg)
    assert snapshot['channels'][0]['status'] == '未核验' and snapshot['channels'][0]['reportedStatus'] == '正常'
    assert snapshot['channels'][0]['uptime7d'] == 99.8
    assert snapshot['expiresAt'] > (now() + timedelta(minutes=30)).isoformat()


def test_daily_queue_uses_persisted_login_and_imports_without_secret_leak(client, monkeypatch):
    row = account(client)
    cfg = {'name': '每日采集', 'station': row['station'], 'sourceBaseUrl': 'https://example.com', 'sourceAdapter': 'Sub2API',
           'sourceAccount': row['id'], 'datasets': ['站点公告'], 'schedule': '每日定时', 'dailyTime': '04:00', 'status': '启用'}
    response = client.post('/api/v1/admin/records/station-sync-tasks/', json={'values': cfg})
    assert response.status_code == 201
    tid = response.json()['id']
    with SessionLocal() as db:
        record = db.get(Record, row['id']); auth = load_auth(db, record)
        auth['session'] = {'accessToken': 'persisted-private-token'}; save_auth(db, record, auth)
        task = db.get(Record, tid); task.data = {**task.data, '_nextRun': (now() - timedelta(minutes=1)).isoformat()}; db.commit()
    calls = []
    def raw(self, method, path, body=None, authenticated=True):
        assert method == 'GET' and self.session['accessToken'] == 'persisted-private-token'
        calls.append(path)
        return {'code': 0, 'data': [{'id': 10, 'title': '新公告', 'content': '真实采集测试正文'}]}
    monkeypatch.setattr(ConsoleSession, 'request_raw', raw)
    assert sources.station_tick()
    assert calls == ['/api/v1/announcements']
    with SessionLocal() as db:
        task = db.get(Record, tid)
        assert task.data['lastResult'] == '已完成' and task.data['_nextRun'] > now().isoformat()
        assert db.scalar(select(Record).where(Record.module == 'station-notices', Record.data['body'].as_string() == '真实采集测试正文')).status == '草稿'
        jobs = list(db.scalars(select(Record).where(Record.module == 'station-sync-runs')))
        assert 'persisted-private-token' not in json.dumps([j.data for j in jobs])
