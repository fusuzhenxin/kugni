import json
import threading
import time
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import AnalyticsEvent, Credential, Record, VisitorSession, Wallet, now
from app.security import decrypt
from app.account_connector import account_tick
from app.fingerprint import fingerprint_tick, match_fingerprint, VERSION
from app.testing import perform_test
from .conftest import MAILBOX, login, register
from .test_flows import create, API


def test_email_code_required_bound_single_use_and_attempt_limit(client):
    body = {'name': '邮箱用户', 'email': 'code@example.com', 'password': 'KugniTest!2026'}
    assert client.post(API+'/auth/register/', json=body).status_code == 422
    sent = client.post(API+'/auth/email-code/', json={'email': body['email']})
    assert sent.status_code == 200 and 'code' not in sent.json()
    assert client.post(API+'/auth/email-code/', json={'email': body['email']}).status_code == 429
    code = MAILBOX[body['email']]
    wrong = '000000' if code != '000000' else '111111'
    assert client.post(API+'/auth/register/', json={**body, 'email': 'other@example.com', 'code': code}).status_code == 400
    for _ in range(5):
        assert client.post(API+'/auth/register/', json={**body, 'code': wrong}).status_code == 400
    assert client.post(API+'/auth/register/', json={**body, 'code': code}).status_code == 400
    user = register(client, email='valid@example.com')
    assert user['profile']['emailVerified'] is True
    assert client.post(API+'/auth/verify-email/', json={'code': MAILBOX['valid@example.com']}).status_code == 400


def test_smtp_failure_does_not_create_sent_challenge(client, monkeypatch):
    def fail(*args): raise HTTPException(503, 'SMTP 不可用')
    monkeypatch.setattr('app.email_verification.deliver_code', fail)
    assert client.post(API+'/auth/email-code/', json={'email':'fail@example.com'}).status_code == 503
    with SessionLocal() as db:
        assert not db.scalar(select(Record.id).where(Record.module == 'email-challenges'))


@pytest.fixture
def account_server(monkeypatch):
    monkeypatch.setattr(settings(), 'allow_private_targets', True)
    state = {'tokens': [], 'created': 0, 'signed': 0, 'quota': 500000}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def send(self, obj, cookie=False):
            body=json.dumps(obj).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)))
            if cookie:self.send_header('Set-Cookie','session=account-session; HttpOnly; Path=/')
            self.end_headers();self.wfile.write(body)
        def do_POST(self):
            body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}')
            if self.path == '/api/user/login':
                assert body['password']=='account-password'
                return self.send({'success':True,'data':{'id':42}},True)
            assert self.headers.get('New-Api-User')=='42'
            assert 'session=account-session' in self.headers.get('Cookie','')
            if self.path=='/api/user/checkin':
                state['signed']+=1;return self.send({'success':True})
            if self.path=='/api/token/':
                state['created']+=1;state['tokens'].append({'id':1,'name':body['name'],'key':'remote-***-secret','status':1});return self.send({'success':True})
            if self.path=='/api/token/1/key':
                state['revealed']=state.get('revealed',0)+1;return self.send({'success':True,'data':{'key':'remote-real-test-secret'}})
            self.send({'success':False})
        def do_GET(self):
            if self.path=='/v1/models':return self.send({'data':[{'id':'gpt-test'}]})
            if self.path=='/api/user/self':return self.send({'success':True,'data':{'quota':state['quota']}})
            if self.path.startswith('/api/token/?'):
                from urllib.parse import parse_qs, urlparse
                page=int(parse_qs(urlparse(self.path).query)['p'][0]);assert page>=1
                return self.send({'success':True,'data':{'items':state['tokens'] if page==1 else [],'total':len(state['tokens'])}})
            self.send({'success':False})
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    yield f'http://127.0.0.1:{server.server_port}',state
    server.shutdown();server.server_close();thread.join(2)


def test_account_auto_key_sync_checkin_balance_schedule_and_rbac(client, account_server):
    base,state=account_server;login(client)
    station=client.get(API+'/admin/records/stations/').json()['items'][0]
    account=create(client,'probe-accounts',{'name':'自动账户','station':station['id'],'adapter':'New API','baseUrl':base,'account':'test','password':'account-password','protocols':['OpenAI Chat Completions'],'checkin':'每日签到','balanceThreshold':2,'quotaPerUnit':500000,'currency':'USD','syncInterval':15,'status':'启用'})
    assert 'account-password' not in json.dumps(account) and account['authConfigured']
    action=API+'/admin/records/probe-accounts/'+account['id']+'/actions/sync/'
    assert client.post(action,json={}).status_code==200
    assert client.post(action,json={}).status_code==409
    assert account_tick()
    result=client.get(API+'/admin/records/probe-accounts/'+account['id']+'/').json()
    assert result['balance']==1 and result['syncState']=='同步成功'
    kid=result['credentialRef'];key=client.get(API+'/admin/records/test-keys/'+kid+'/').json()
    assert key['discoveredModels'][0]['id']=='gpt-test'
    assert 'remote-real-test-secret' not in json.dumps(key)
    with SessionLocal() as db:
        assert decrypt(db.get(Credential,kid).encrypted_secret)=='sk-remote-real-test-secret'
        assert 'account-password' not in db.get(Record,account['id']).data.values()
    assert client.post(action,json={}).status_code==200;assert account_tick()
    assert state['created']==state['signed']==1 and state['revealed']==2
    with SessionLocal() as db:
        assert len([r for r in db.scalars(select(Record).where(Record.module=='messages')) if r.data.get('accountId')==account['id']])==1
    login(client,'local-reviewer@kugni.com')
    assert client.post(action,json={}).status_code==403


def test_automatic_reward_delivery_encrypted_unique_and_rollback(client):
    login(client)
    reward=create(client,'rewards',{'name':'自动权益','cost':10,'stock':0,'dailyLimit':2,'deliveryMode':'自动发码','status':'启用'})
    batch=create(client,'reward-codes',{'name':'第一批','rewardId':reward['id'],'codes':'secret-code-A\nsecret-code-B'})
    assert 'secret-code' not in json.dumps(batch)
    assert client.post(API+'/admin/records/reward-codes/',json={'values':{'name':'重复','rewardId':reward['id'],'codes':'secret-code-A'}}).status_code==409
    user=register(client)
    with SessionLocal() as db:
        db.get(Wallet,user['id']).balance=100;db.commit()
    redeem=API+'/member/points/redeem/'+reward['id']+'/'
    assert client.post(redeem).status_code==200
    assert client.post(redeem).status_code==200
    assert client.post(redeem).status_code==409
    points=client.get(API+'/member/points/').json()
    assert points['balance']==80
    assert {r['fulfillment'] for r in points['redemptions']}=={'secret-code-A','secret-code-B'}
    assert all(r['status']=='已发放' for r in points['redemptions'])
    another=register(client,email='another@example.com')
    assert client.get(API+'/member/points/').json()['redemptions']==[]
    login(client)
    assert client.post(API+'/admin/records/reward-codes/'+batch['id']+'/actions/delete/',json={}).status_code==409
    # An advertised stock number cannot cause charges without usable codes.
    empty=create(client,'rewards',{'name':'空库存','cost':10,'stock':0,'deliveryMode':'自动发码','status':'启用'})
    with SessionLocal() as db:
        row=db.get(Record,empty['id']);row.data={**row.data,'stock':1};db.commit()
    login(client,'member@example.com')
    assert client.post(API+'/member/points/redeem/'+empty['id']+'/').status_code==409
    assert client.get(API+'/member/points/').json()['balance']==80


def test_fingerprint_independent_calibration_matching_and_unknown(client, monkeypatch):
    login(client)
    monkeypatch.setattr(settings(),'allow_private_targets',True)
    station=client.get(API+'/admin/records/stations/').json()['items'][0]
    key=create(client,'test-keys',{'name':'可信源','station':station['id'],'baseUrl':'http://127.0.0.1','secret':'trusted-test-key','protocols':['OpenAI Chat Completions'],'status':'启用'})
    def call(base,secret,protocol,model,prompt,*args):
        count=int(prompt.split('生成 ')[1].split(' ')[0])
        return {'text':','.join(str((i%3) if model=='model-a' else (7+i%3)) for i in range(count))}
    monkeypatch.setattr('app.testing.call_model',call)
    for model in ['model-a','model-b']:
        row=create(client,'fingerprint-baselines',{'name':model,'keyId':key['id'],'model':model,'protocol':'OpenAI Chat Completions','sourceUrl':'https://official.example.com','rounds':6,'status':'待采集'})
        assert client.post(API+'/admin/records/fingerprint-baselines/'+row['id']+'/actions/calibrate/',json={}).status_code==200
        assert fingerprint_tick()
        assert client.patch(API+'/admin/records/fingerprint-baselines/'+row['id']+'/',json={'values':{'status':'启用'}}).status_code==200
    with SessionLocal() as db:
        samples=[{'text':','.join(str(i%3) for i in range(n))} for n in [327,299,301]]
        match=match_fingerprint(db,samples)
        assert match['state']=='matched' and match['matchedModel']=='model-a'
        assert match_fingerprint(db, samples, 'Anthropic Messages')['state'] == 'uncalibrated'
        assert match_fingerprint(db,[{'text':','.join('5' for _ in range(n))} for n in [327,299,301]])['state']=='unknown'
        assert match_fingerprint(db,[{'text':'1,2'}])['state']=='unknown'
        rows=list(db.scalars(select(Record).where(Record.module=='fingerprint-baselines')))
        assert all(r.data['versionTag']==VERSION and r.data['validationSamples']==2 for r in rows)
    result=client.post(API+'/tests/fingerprint-samples/',json={'model':'claimed','answers':[s['text'] for s in samples]})
    report=client.get(API+'/tests/reports/'+result.json()['id']+'/').json()
    assert report['evidence']['fingerprint']['matchedModel']=='model-a'
    assert all('text' not in s for s in report['evidence']['samples'])


@pytest.fixture
def sse_server(monkeypatch):
    monkeypatch.setattr(settings(),'allow_private_targets',True)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if self.path.endswith('/messages'):
                events=[{'type':'message_start','message':{'model':'claude-test','usage':{'input_tokens':10}}},{'type':'content_block_delta','delta':{'text':'你'}},{'type':'content_block_delta','delta':{'text':'好'}},{'type':'message_delta','usage':{'output_tokens':2}},{'type':'message_stop'}]
            elif self.path.endswith('/responses'):
                events=[{'type':'response.output_text.delta','delta':'你'},{'type':'response.output_text.delta','delta':'好'},{'type':'response.completed','response':{'model':'gpt-test','usage':{'output_tokens':2}}}]
            elif ':streamGenerateContent' in self.path:
                events=[{'candidates':[{'content':{'parts':[{'text':'你'}]}}]},{'candidates':[{'content':{'parts':[{'text':'好'}]},'finishReason':'STOP'}],'usageMetadata':{'candidatesTokenCount':2}}]
            else:
                events=[{'model':'gpt-test','choices':[{'delta':{'content':'你'}}]},{'choices':[{'delta':{'content':'好'},'finish_reason':'stop'}]},{'usage':{'completion_tokens':2},'choices':[]}]
            self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
            for event in events:
                time.sleep(.02);self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode());self.wfile.flush()
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown();server.server_close();thread.join(2)


@pytest.mark.parametrize('protocol',['OpenAI Chat Completions','OpenAI Responses','Anthropic Messages','Google Gemini'])
def test_four_stream_protocols_real_timing(sse_server,protocol):
    score,evidence=perform_test(sse_server,'local-test-secret',protocol,'model-test','流式性能',5)
    assert score is None and evidence['success'],evidence
    row=evidence['samples'][0]
    assert row['ttftMs']>0 and row['elapsedMs']>=row['ttftMs']
    assert row['outputTokens']==2 and row['tokensPerSecond']>0 and row['textChunks']==2
    assert row['text']=='你好'


def test_live_sessions_regions_ordered_funnels_and_private_pages(client,monkeypatch):
    monkeypatch.setattr('app.analytics_details.locate',lambda request:('中国','广东'))
    visitor='visitor-session-test-0001';session='session-test-000000001'
    def event(kind,path,index):
        return client.post(API+'/track/events/',json={'id':f'analytics-test-event-{index:04d}','visitor':visitor,'session':session,'kind':kind,'path':path})
    assert event('pageview','/',1).status_code==200
    assert event('outbound','/',2).status_code==200 # Before station detail: cannot convert.
    assert event('pageview','/stations/test/',3).status_code==200
    login(client)
    data=client.get(API+'/admin/analytics/traffic/').json()
    assert data['online']==1 and data['regions'][0]['name']=='中国 / 广东'
    assert data['funnels'][0]['steps'][-1]['count']==0
    assert data['paths'][0]['from']=='/' and data['paths'][0]['to']=='/stations/test/'
    assert event('outbound','/stations/test/',4).status_code==200
    assert event('heartbeat','/stations/test/',5).status_code==200
    data=client.get(API+'/admin/analytics/traffic/').json()
    assert data['pv']==2 and data['funnels'][0]['steps'][-1]['count']==1
    assert event('pageview','/en/account/settings/',6).json()['ignored']
    with SessionLocal() as db:
        for row in db.scalars(select(VisitorSession)):row.last_seen=now()-timedelta(minutes=2)
        db.commit()
    assert client.get(API+'/admin/analytics/traffic/').json()['online']==0
    login(client,'local-publisher@kugni.com')
    data=client.get(API+'/admin/analytics/p-overview/').json()
    if 'online' in data:
        assert data['online']==0 and data['paths']==[] and data['regions']==[]


def test_account_one_api_paginates_short_pages_and_management_auth(client, monkeypatch):
    from app.account_connector import AccountClient
    remote = AccountClient('https://example.com', {'managementToken': 'management-secret'}, 42, 'One API')
    calls = []
    def request(method, path, body=None, **kwargs):
        calls.append((method, path))
        assert remote.headers['Authorization'] == 'Bearer management-secret'
        if 'p=0&' in path: return {'data': [{'id': 1, 'name': 'other'}]}
        if 'p=1&' in path: return {'data': [{'id': 2, 'name': 'wanted', 'key': 'complete-existing-key'}]}
        return {'data': []}
    monkeypatch.setattr(remote, 'request', request)
    remote.login()
    assert remote.api_key('wanted') == ('sk-complete-existing-key', 2)
    assert len(calls) == 3 and all(method == 'GET' for method, _ in calls)


def test_account_two_factor_and_broken_pagination_fail_explicitly(client, monkeypatch):
    from app.account_connector import AccountClient
    remote = AccountClient('https://example.com', {'account': 'test', 'password': 'secret'})
    remote.cookies = {'session': 'pending'}
    monkeypatch.setattr(remote, 'request', lambda *args, **kwargs: {'data': {'require_2fa': True}})
    with pytest.raises(HTTPException) as exc: remote.login()
    assert exc.value.status_code == 409
    monkeypatch.setattr(remote, 'request', lambda *args, **kwargs: {'data': [{'id': 1}]})
    with pytest.raises(HTTPException) as exc: remote.tokens()
    assert exc.value.status_code == 409


def test_existing_member_can_verify_email_and_expired_code_fails(client):
    login(client)
    email = 'admin@kugni.com'
    assert client.post(API+'/auth/email-code/',json={'email': email}).status_code == 200
    with SessionLocal() as db:
        row = db.scalar(select(Record).where(Record.module == 'email-challenges'))
        row.data = {**row.data, 'expires': (now()-timedelta(seconds=1)).isoformat()}; db.commit()
    assert client.post(API+'/auth/verify-email/',json={'code': MAILBOX[email]}).status_code == 400
    with SessionLocal() as db:
        row = db.scalar(select(Record).where(Record.module == 'email-challenges'))
        row.data = {**row.data, 'expires': (now()+timedelta(minutes=1)).isoformat()}; db.commit()
    assert client.post(API+'/auth/verify-email/',json={'code': MAILBOX[email]}).status_code == 200
    assert client.get(API+'/auth/session/').json()['user']['profile']['emailVerified']
    assert client.post(API+'/auth/verify-email/',json={'code': MAILBOX[email]}).status_code == 400


def test_notifications_access_and_read_state(client):
    login(client)
    with SessionLocal() as db:
        notice = Record(module='messages', name='余额提醒', owner_id='admin-root', status='未读', data={'body': '余额低于阈值'})
        db.add(notice);db.commit();nid=notice.id
    assert client.get(API+'/admin/records/messages/').status_code == 200
    assert client.get(API+'/admin/records/messages/'+nid+'/').json()['status'] == '已读'
    login(client, 'local-publisher@kugni.com')
    assert client.get(API+'/admin/records/messages/').status_code == 403
    assert all(r['id'] != nid for r in client.get(API+'/admin/records/p-messages/').json()['items'])
