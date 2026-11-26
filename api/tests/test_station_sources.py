import copy
import json
import threading
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import station_sources as sources
from app.config import settings
from app.db import SessionLocal
from app.models import Record, Role, User, now
from .conftest import login

BASE = '/api/v1/admin/records/station-sync-tasks/'


class Source:
    def __init__(self, broken=()):
        self.broken = broken
        self.values = {
            '/api/notice': {'success': True, 'data': '<p>网站公告</p><script>secret()</script>'},
            '/api/status': {'success': True, 'data': {'announcements_enabled': True, 'announcements': json.dumps([
                {'id': 123, 'content': '<p>模型维护通知</p>', 'publishDate': '2026-01-01'},
                {'id': 124, 'content': '<p>网站公告</p>'},
            ])}},
            '/api/uptime/status': {'success': True, 'data': [
                {'categoryName': 'GPT', 'monitors': [{'name': 'GPT API', 'status': 1, 'uptime': 1}]}
            ]},
        }

    def get(self, url):
        path = urlparse(url).path
        if path in self.broken: raise ValueError('来源不可用')
        return copy.deepcopy(self.values[path])


def task(datasets=None, **extra):
    with SessionLocal() as db:
        station = db.scalar(select(Record).where(Record.module == 'stations'))
        cfg = {'name': '站点采集测试', 'station': station.id, 'sourceBaseUrl': 'https://example.com',
               'datasets': datasets or ['站点公告', '渠道状态'], 'statusAdapter': sources.ADAPTERS[0],
               'noticePolicy': '先保存草稿', 'schedule': '仅手动', 'interval': 30, 'status': '启用', **extra}
        row = Record(module='station-sync-tasks', name=cfg['name'], status=cfg['status'], owner_id='admin-root', data=cfg)
        db.add(row); db.commit()
        return row.id, station.id, station.slug


def run(tid, source):
    with SessionLocal() as db:
        job = sources.queue_sync(db, db.get(Record, tid))
        job.status = '采集中'; db.commit()
        jid = job.id
    sources.process_sync(jid, source)
    with SessionLocal() as db:
        return db.get(Record, jid)


def test_two_notice_interfaces_deduplicate_plain_text_and_drafts(client):
    tid, station, slug = task()
    result = run(tid, Source())
    assert result.status == '已完成' and result.data['noticeCount'] == 2
    run(tid, Source())
    with SessionLocal() as db:
        notices = list(db.scalars(select(Record).where(Record.module == 'station-notices', Record.data['stationId'].as_string() == station, Record.slug.is_not(None))))
        assert len(notices) == 2
        assert all(n.status == '草稿' and 'secret()' not in n.data['body'] for n in notices)
        assert not any(n.data.get('_stationSync') for n in client.get('/api/v1/public/stations/' + slug + '/').json()['notices'])


def test_auto_publish_preserves_actual_editorial_changes_and_deleted_notice(client):
    tid, station, slug = task(['站点公告'], noticePolicy='自动发布')
    run(tid, Source())
    login(client)
    with SessionLocal() as db:
        notice = db.scalar(select(Record).where(Record.module == 'station-notices', Record.data['stationId'].as_string() == station, Record.slug.is_not(None)))
        nid = notice.id
    path = '/api/v1/admin/records/station-notices/' + nid + '/'
    row = client.get(path).json()
    form = {key: row.get(key) for key in ['name', 'stationId', 'type', 'body', 'pinned', 'start', 'end', 'status', 'sourceUrl']}
    form.update(name='人工标题', body='人工正文', status='草稿')
    assert client.patch(path, json={'values': form}).status_code == 200
    run(tid, Source())
    current = client.get(path).json()
    assert (current['name'], current['body'], current['status']) == ('人工标题', '人工正文', '草稿')
    with SessionLocal() as db:
        assert set(db.get(Record, nid).data['_manualFields']) == {'name', 'body', 'status'}
        translations = list(db.scalars(select(Record).where(Record.module == 'translations')))
        assert any(t.data.get('recordId') == nid for t in translations)
    assert client.post(path + 'actions/delete/', json={}).status_code == 200
    run(tid, Source())
    assert client.get(path).status_code == 404
    assert all(n['id'] != nid for n in client.get('/api/v1/public/stations/' + slug + '/').json()['notices'])


def test_partial_failure_keeps_snapshot_and_failed_import_keeps_old_notices(client):
    tid, station, slug = task(noticePolicy='自动发布')
    run(tid, Source())
    before = client.get('/api/v1/public/stations/' + slug + '/').json()
    result = run(tid, Source(['/api/notice', '/api/status']))
    assert result.status == '部分成功'
    after = client.get('/api/v1/public/stations/' + slug + '/').json()
    assert after['notices'] == before['notices']
    result = run(tid, Source(['/api/notice', '/api/status', '/api/uptime/status']))
    assert result.status == '失败'
    after2 = client.get('/api/v1/public/stations/' + slug + '/').json()
    assert after2['channelSnapshot'] == after['channelSnapshot']
    source = Source(['/api/notice'])
    partial = run(tid, source)
    assert partial.data['warnings'] and partial.status == '部分成功'


def test_empty_channels_and_timestamp_free_proxy_never_imply_verified_health(client):
    tid, station, slug = task(['渠道状态'])
    run(tid, Source())
    row = client.get('/api/v1/public/stations/' + slug + '/').json()
    snapshot = row['channelSnapshot']
    assert snapshot['channels'][0]['status'] == '未核验'
    assert snapshot['channels'][0]['reportedStatus'] == '正常'
    source = Source()
    source.values['/api/uptime/status']['data'] = []
    run(tid, source)
    empty = client.get('/api/v1/public/stations/' + slug + '/').json()
    assert empty['channelSnapshot']['channels'] == []
    assert empty['serviceStatus'] == row['serviceStatus']
    assert '_channelSnapshot' not in client.get('/api/v1/public/stations/').text


def test_public_channel_names_enter_translation_without_private_source_config(client):
    tid, station, slug = task(['渠道状态'])
    source = Source()
    source.values['/api/uptime/status']['data'][0]['monitors'][0]['name'] = '中文渠道'
    run(tid, source)
    with SessionLocal() as db:
        labels = [r for r in db.scalars(select(Record).where(Record.module == 'translations')) if r.data.get('recordId') == station and r.data.get('field', '').startswith('channelLabels/')]
        assert len(labels) == 1 and labels[0].data['source'] == '中文渠道'
        assert labels[0].status == '待翻译'
        assert 'https://' not in str([r.data for r in labels])


def test_kuma_latest_heartbeat_missing_ratio_and_expiration(monkeypatch):
    current = now()
    class Kuma:
        def get(self, url):
            if '/heartbeat/' not in url:
                return {'publicGroupList': [{'name': 'API', 'monitorList': [{'id': 1, 'name': 'GPT'}, {'id': 2, 'name': 'Claude'}]}]}
            return {'heartbeatList': {'1': [
                {'time': current.isoformat(), 'status': 1},
                {'time': (current - timedelta(hours=1)).isoformat(), 'status': 0},
            ]}, 'uptimeList': {'1_24': .987}}
    snapshot = sources.channels(Kuma(), {'statusAdapter': 'Uptime Kuma', 'statusPageUrl': 'https://example.com/status/api', 'interval': 60})
    assert snapshot['channels'][0]['status'] == '正常' and snapshot['channels'][0]['uptime24h'] == 98.7
    assert snapshot['channels'][1]['status'] == '未核验' and snapshot['channels'][1]['uptime24h'] is None
    station = Record(data={'_channelSnapshot': snapshot})
    monkeypatch.setattr(sources, 'now', lambda: current + timedelta(minutes=16))
    assert sources.public_snapshot(station)['channels'][0]['status'] == '未核验'
    monkeypatch.setattr(sources, 'now', lambda: current + timedelta(hours=3))
    assert sources.public_snapshot(station)['stale'] is True


def test_statuspage_uses_component_state_without_treating_updated_at_as_heartbeat():
    class Statuspage:
        def get(self, url):
            assert url.endswith('/api/v2/summary.json')
            return {'components': [{'name': 'API', 'status': 'operational', 'updated_at': '2020-01-01'}, {'name': 'group', 'group': True}]}
    snapshot = sources.channels(Statuspage(), {'statusAdapter': 'Statuspage', 'statusPageUrl': 'https://example.com'})
    assert len(snapshot['channels']) == 1 and snapshot['channels'][0]['status'] == '正常'
    assert snapshot['channels'][0]['heartbeatAt'] == ''


def test_config_validation_schedule_rbac_and_active_job_guards(client, monkeypatch):
    tid, station, slug = task()
    monkeypatch.setattr(sources, 'validate_target', lambda url: (urlparse(url), '8.8.8.8'))
    login(client)
    for values in [{'interval': 10}, {'dailyTime': '25:00', 'schedule': '每日定时'}, {'statusAdapter': 'Uptime Kuma', 'statusPageUrl': 'https://example.com/wrong'}]:
        assert client.patch(BASE + tid + '/', json={'values': values}).status_code == 422
    response = client.patch(BASE + tid + '/', json={'values': {'schedule': '每日定时', 'dailyTime': '03:30'}})
    assert response.status_code == 200 and response.json()['nextRun'].endswith('03:30')
    assert client.post(BASE + tid + '/actions/run/', json={}).status_code == 200
    assert client.post(BASE + tid + '/actions/run/', json={}).status_code == 409
    assert client.patch(BASE + tid + '/', json={'values': {'status': '停用'}}).status_code == 409
    assert client.post(BASE + tid + '/actions/delete/', json={}).status_code == 409
    assert client.post('/api/v1/admin/records/stations/' + station + '/actions/delete/', json={}).status_code == 409
    jobs = client.get('/api/v1/admin/records/station-sync-runs/').json()
    assert '_config' not in str(jobs) and '_nextRun' not in response.text


def test_run_requires_related_write_permissions(client):
    tid, station, slug = task()
    with SessionLocal() as db:
        db.add(Role(id='collector', name='仅采集', code='collector', surface='platform', permissions=['platform.station-sync-tasks.read', 'platform.station-sync-tasks.run']))
        db.get(User, 'local-reviewer').role_id = 'collector'; db.commit()
    login(client, 'local-reviewer@kugni.com')
    assert client.post(BASE + tid + '/actions/run/', json={}).status_code == 403
    with SessionLocal() as db:
        role = db.get(Role, 'collector'); role.permissions = [*role.permissions, 'platform.stations.edit']
        db.commit()
    assert client.post(BASE + tid + '/actions/run/', json={}).status_code == 403  # notice permissions still missing


def test_disabled_task_does_not_fetch_and_worker_rechecks_revoked_permissions(monkeypatch):
    tid, station, slug = task()
    with SessionLocal() as db:
        row = db.get(Record, tid)
        job = sources.queue_sync(db, row); jid = job.id
        row.status = '停用'; db.commit()
    monkeypatch.setattr(sources.PublicSource, 'get', lambda *a: pytest.fail('disabled task fetched external source'))
    assert sources.station_tick()
    with SessionLocal() as db:
        assert db.get(Record, jid).status == '已取消'
        db.get(Record, tid).status = '启用'; db.commit()
        job = sources.queue_sync(db, db.get(Record, tid)); jid = job.id
        db.get(Role, 'super').permissions = []; db.commit()
    assert sources.station_tick()
    with SessionLocal() as db:
        result = db.get(Record, jid)
        assert result.status == '失败' and '权限' in result.data['errors']['执行']


def test_due_schedule_runs_once_and_stale_job_recovery(monkeypatch):
    tid, station, slug = task(['渠道状态'], schedule='间隔执行', interval=30, _nextRun=(now() - timedelta(minutes=1)).isoformat())
    monkeypatch.setattr(sources.PublicSource, 'get', Source().get)
    assert sources.station_tick() is True
    assert sources.station_tick() is False
    with SessionLocal() as db:
        row = db.get(Record, tid)
        assert row.data['_nextRun'] > now().isoformat()
        assert row.data['lastResult'] == '已完成'
        job = sources.queue_sync(db, row)
        job.status = '采集中'; job.updated_at = now() - timedelta(minutes=11)
        jid = job.id; db.commit()
    sources.station_tick()
    with SessionLocal() as db:
        job = db.get(Record, jid)
        assert job.status == '失败' and job.slug is None and '_config' not in job.data


def test_http_reader_pins_host_and_rejects_private_redirect(monkeypatch):
    seen = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            seen.append(self.headers.get('Host'))
            self.send_response(302); self.send_header('Location', 'http://127.0.0.1/private'); self.end_headers()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    original = sources.validate_target
    def validate(url):
        if url.startswith('http://source.example:'):
            return urlparse(url), '127.0.0.1'
        return original(url)
    monkeypatch.setattr(sources, 'validate_target', validate)
    monkeypatch.setattr(settings(), 'allow_private_targets', False)
    try:
        with pytest.raises(HTTPException): sources.PublicSource().get('http://source.example:' + str(server.server_port))
        assert seen == ['source.example:' + str(server.server_port)]
    finally:
        server.shutdown(); server.server_close(); thread.join()
