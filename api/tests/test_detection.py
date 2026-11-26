import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pytest
from sqlalchemy import select
from app.config import settings
from app.db import SessionLocal
from app.models import Credential, Execution, Record, Report, now
from app.testing import next_run
from app.worker import claim_job, run_job, schedule_due, scrub
from app.alerts import evaluate_alerts
from .conftest import login
from .test_flows import create, API


@pytest.fixture
def protocol_server(monkeypatch):
    monkeypatch.setattr(settings(), 'allow_private_targets', True)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def respond(self, data):
            body = json.dumps(data).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        def do_GET(self):
            if self.path.startswith('/v1beta'): self.respond({'models': [{'name': 'models/gemini-test', 'supportedGenerationMethods': ['generateContent']}]})
            else: self.respond({'data': [{'id': 'gpt-test'}, {'id': 'claude-test'}]})
        def do_POST(self):
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if 'contents' in data: prompt = data['contents'][0]['parts'][0]['text']
            elif 'input' in data: prompt = data['input']
            else: prompt = data['messages'][0]['content']
            answer = next((value for key, value in [('17', '45'), ('一盒', '3'), ('123', 'KUGNI'), ('数列', '32'), ('小明', '12')] if key in prompt), 'OK')
            model = data.get('model', 'gemini-test')
            if self.path.endswith('/messages'): self.respond({'model': model, 'content': [{'type': 'text', 'text': answer}], 'usage': {'input_tokens': 12, 'output_tokens': 1}})
            elif self.path.endswith('/responses'): self.respond({'model': model, 'output': [{'content': [{'type': 'output_text', 'text': answer}]}]})
            elif ':generateContent' in self.path: self.respond({'candidates': [{'content': {'parts': [{'text': answer}]}}]})
            else: self.respond({'model': model, 'choices': [{'message': {'content': answer}}]})
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown(); server.server_close(); thread.join(timeout=2)


def test_multi_key_protocols_discovery_queue_reports_and_alert(client, protocol_server):
    login(client)
    station = client.get(API + '/admin/records/stations/').json()['items'][0]
    bindings = []
    for i, protocol in enumerate(['OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic Messages', 'Google Gemini']):
        key = create(client, 'test-keys', {'name': f'加密 Key {i}', 'station': station['id'], 'baseUrl': protocol_server, 'secret': 'test-secret-123', 'protocols': [protocol], 'status': '启用'})
        assert 'test-secret-123' not in json.dumps(key)
        response = client.post(f'{API}/admin/records/test-keys/{key["id"]}/actions/discover/', json={})
        assert response.status_code == 200, response.text
        discovered = response.json()['item']['discoveredModels']
        assert discovered and all(m['protocol'] == protocol for m in discovered)
        bindings.append({'keyId': key['id'], 'protocol': protocol, 'models': [discovered[0]['id']]})
        with SessionLocal() as db:
            assert 'test-secret-123' not in db.get(Credential, key['id']).encrypted_secret
            assert 'secret' not in db.get(Record, key['id']).data
    plan = create(client, 'plans', {'name': '四协议检测计划', 'station': station['id'], 'bindings': bindings, 'items': ['基础可用性', '糖果测试', '模型指纹'], 'schedule': '间隔执行', 'interval': 5, 'timezone': 'Asia/Shanghai', 'timeout': 5, 'retries': 0, 'concurrency': 2, 'publishPolicy': '审核后公开', 'status': '启用'})
    assert plan['retries'] == 0
    response = client.post(f'{API}/admin/records/plans/{plan["id"]}/actions/run/', json={})
    assert response.status_code == 200, response.text
    jid = response.json()['item']['id']
    assert claim_job() == jid
    run_job(jid)
    with SessionLocal() as db:
        job = db.get(Execution, jid)
        reports = list(db.scalars(select(Report).where(Report.execution_id == jid)))
        assert job.status == 'completed' and job.completed == job.total == 12
        assert len(reports) == 12 and all(r.evidence['success'] for r in reports)
        assert all(r.score == 100 for r in reports if r.test_type == '糖果测试')
        assert all(r.score is None for r in reports if r.test_type == '模型指纹')
        assert all(r.status == '待审核' for r in reports)
        planrow = db.get(Record, plan['id']); planrow.data = {**planrow.data, '_nextRun': '2020-01-01T00:00:00'}; db.commit()
    schedule_due(); schedule_due()
    with SessionLocal() as db:
        queued = list(db.scalars(select(Execution).where(Execution.status == 'queued')))
        assert len(queued) == 1
    rule = create(client, 'test-alerts', {'name': '分数规则', 'station': station['id'], 'metric': '评分低于', 'threshold': 101, 'window': 60, 'cooldown': 30, 'channel': '站内通知', 'status': '启用'})
    evaluate_alerts(); evaluate_alerts()
    with SessionLocal() as db:
        assert db.get(Record, rule['id']).data['eventStatus'] == '待处理'
        assert len([r for r in db.scalars(select(Record).where(Record.module == 'messages')) if r.data.get('ruleId') == rule['id']]) == 1


def test_ephemeral_key_purged_and_cancel(client, protocol_server):
    login(client)
    values = {'baseUrl': protocol_server, 'secret': 'temp-test-key', 'protocol': 'OpenAI Responses', 'model': 'gpt-test', 'type': '基础可用性'}
    response = client.post(API + '/tests/executions/', json=values)
    assert response.status_code == 202
    jid = response.json()['id']; assert claim_job() == jid; run_job(jid)
    with SessionLocal() as db: assert 'ephemeralSecret' not in db.get(Execution, jid).settings
    response = client.post(API + '/tests/executions/', json=values); jid = response.json()['id']
    assert client.post(f'{API}/tests/executions/{jid}/cancel/').status_code == 200
    with SessionLocal() as db:
        assert db.get(Execution, jid).status == 'cancelled'
        assert 'ephemeralSecret' not in db.get(Execution, jid).settings


def test_scrub_escaped_secret_and_timezone():
    secret = 'abc"\\xyz'
    assert scrub({'answer': 'prefix ' + secret, 'samples': [secret]}, secret) == {'answer': 'prefix [REDACTED]', 'samples': ['[REDACTED]']}
    value = next_run({'schedule': '每日定时', 'dailyTime': '09:00', 'timezone': 'Asia/Shanghai'})
    assert value.endswith('01:00:00')


def test_public_question_count_and_manual_samples(client, protocol_server):
    login(client)
    values = {'baseUrl': protocol_server, 'secret': 'temp-test-key', 'protocol': 'OpenAI Responses', 'model': 'gpt-test', 'type': '糖果测试', 'questionCount': 20}
    assert client.post(API + '/tests/executions/', json={**values, 'questionCount': 7}).status_code == 422
    response = client.post(API + '/tests/executions/', json=values)
    assert response.status_code == 202
    jid = response.json()['id']
    assert claim_job() == jid
    run_job(jid)
    detail = client.get(f'{API}/tests/executions/{jid}/').json()
    report = detail['reports'][0]
    assert report['evidence']['total'] == 20
    assert len(report['evidence']['samples']) == 20
    assert len(report['evidence']['samples'][0]['options']) == 4
    assert report['evidence']['samples'][0]['answer'] == 'OK'
    assert report['score'] == 0  # The fixture answered OK; never fabricate correct answers.
    assert client.post(API + '/tests/fingerprint-samples/', json={'model': '手动验证', 'answers': ['没有数字']}).status_code == 422
    result = client.post(API + '/tests/fingerprint-samples/', json={'model': '手动验证', 'answers': ['0,1,2,2,9', '', '3 3']})
    assert result.status_code == 201
    saved = client.get(f'{API}/tests/reports/{result.json()["id"]}/').json()
    assert saved['evidence']['manual'] is True
    assert saved['evidence']['samples'][0]['distribution'] == [1, 1, 2, 0, 0, 0, 0, 0, 0, 1]
    assert 'text' not in saved['evidence']['samples'][0]
    assert saved['score'] is None
    assert client.post(f'{API}/tests/reports/{saved["id"]}/share/').status_code == 409
    history = client.get(API + '/tests/executions/').json()['items']
    assert any(any(p['id'] == saved['id'] for p in row['reports']) for row in history)
