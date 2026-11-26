"""New API / One API account synchronization. No browser scripting or guessed keys."""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update

from .db import SessionLocal
from .models import Credential, Record, now, uid
from .security import decrypt, encrypt
from .testing import discover_models, safe_error, validate_target


class AccountClient:
    def __init__(self, base, auth, remote_id=None, adapter="New API"):
        self.base, self.auth = base.rstrip('/'), auth
        self.adapter = adapter
        self.headers = {}
        if auth.get('managementToken'):
            self.headers['Authorization'] = 'Bearer ' + auth['managementToken']
        if remote_id:
            self.headers['New-Api-User'] = str(int(remote_id))
        self.cookies = {}

    def request(self, method, path, body=None, allow_failure=False):
        url = self.base + path
        # Query parameters here are fixed adapter pagination, not user URLs.
        parsed, ip = validate_target(url.split('?', 1)[0])
        target = httpx.URL(url).copy_with(host=ip)
        host = parsed.hostname + (':' + str(parsed.port) if parsed.port else '')
        with httpx.Client(timeout=25, follow_redirects=False, trust_env=False, cookies=self.cookies) as client:
            response = client.request(method, target, json=body, headers={**self.headers, 'Host': host}, extensions={'sni_hostname': parsed.hostname})
            response.raise_for_status()
            if len(response.content) > 2_000_000:
                raise ValueError('response too large')
            self.cookies.update(dict(response.cookies))
            data = response.json()
        if not isinstance(data, dict):
            raise ValueError('invalid account response')
        if data.get('success') is False and not allow_failure:
            # Remote error text may echo credentials; never persist or return it.
            raise HTTPException(409, '账户接口拒绝操作；请检查权限、二次验证、签到支持及系统版本')
        return data

    def login(self):
        if self.auth.get('managementToken'):
            return
        data = self.request('POST', '/api/user/login', {'username': self.auth['account'], 'password': self.auth['password']})
        user = data.get('data') or {}
        if not self.cookies or user.get('two_factor') or user.get('require_2fa'):
            raise HTTPException(409, '登录未取得会话或需要二次验证，请改用管理访问令牌')
        if user.get('id'):
            self.headers['New-Api-User'] = str(user['id'])

    def tokens(self):
        result = []
        seen = set()
        for offset in range(100):
            page = offset + 1 if self.adapter == 'New API' else offset
            data = self.request('GET', f'/api/token/?p={page}&page_size=100&size=100').get('data', [])
            items = data.get('items', data.get('data', [])) if isinstance(data, dict) else data
            if not isinstance(items, list):
                raise ValueError('invalid token list')
            if not items:
                return result
            identities = {str(t.get('id')) for t in items}
            if identities <= seen:
                raise HTTPException(409, '远端接口没有正确翻页，请核对账户系统版本')
            seen.update(identities)
            result.extend(items)
            if isinstance(data, dict) and isinstance(data.get('total'), int) and len(result) >= data['total']:
                return result
        raise HTTPException(409, '令牌数量超出安全分页上限，请在服务商端整理后重试')

    def api_key(self, name):
        tokens = [t for t in self.tokens() if t.get('name') == name]
        if not tokens:
            self.request('POST', '/api/token/', {'name': name, 'unlimited_quota': True, 'remain_quota': 0, 'expired_time': -1, 'model_limits_enabled': False, 'model_limits': '', 'allow_ips': ''})
            tokens = [t for t in self.tokens() if t.get('name') == name]
        if len(tokens) != 1:
            raise HTTPException(409, '未找到唯一的同名 API Key，请核对远端令牌列表')
        token = tokens[0]
        if token.get('status', 1) != 1 or (token.get('expired_time', -1) > 0 and token['expired_time'] < now().timestamp()):
            raise HTTPException(409, '远端 Key 已停用或过期，请在服务商后台处理')
        secret = token.get('key', '')
        if not secret or '*' in secret or '•' in secret:
            revealed = self.request('POST', f'/api/token/{int(token["id"])}/key').get('data')
            secret = revealed.get('key', '') if isinstance(revealed, dict) else revealed
        if not isinstance(secret, str) or len(secret) < 8 or '*' in secret or '•' in secret:
            raise HTTPException(409, '接口没有提供完整 Key，请核对令牌读取权限')
        return (secret if secret.startswith('sk-') else 'sk-' + secret), token['id']


def validate_account(db, data, values, row):
    station = db.get(Record, data.get('station'))
    if not station or station.module != 'stations':
        raise HTTPException(422, '请选择有效中转站')
    validate_target(data['baseUrl'])
    if data.get('apiBaseUrl'):
        validate_target(data['apiBaseUrl'])
    interval_value = float(data.get('syncInterval') or 0)
    if not interval_value.is_integer():
        raise HTTPException(422, '自动同步间隔需为整数分钟')
    interval = int(interval_value)
    if interval and not 15 <= interval <= 10080:
        raise HTTPException(422, '自动同步间隔需为 15–10080 分钟，0 为仅手动')
    quota = float(data.get('quotaPerUnit') or 500000)
    if quota <= 0 or quota > 1e12:
        raise HTTPException(422, 'Quota 换算比例无效')
    reference = data.get('credentialRef')
    if reference:
        key = db.get(Record, reference)
        if not key or key.module != 'test-keys' or key.data.get('station') != station.id:
            raise HTTPException(422, '同步目标 Key 不属于所选站点')
    old = db.get(Credential, row.id) if row else None
    auth = json.loads(decrypt(old.encrypted_secret)) if old else {}
    for name in ['password', 'managementToken']:
        if values.get(name):
            auth[name] = values[name]
    auth['account'] = data.get('account', '')
    if not auth.get('managementToken') and not (auth.get('account') and auth.get('password')):
        raise HTTPException(422, '请填写用户名和密码，或填写管理访问令牌')
    if auth.get('managementToken') and not data.get('remoteUserId'):
        raise HTTPException(422, '管理访问令牌需配套填写远端用户 ID')
    remote_id = data.get('remoteUserId')
    if remote_id not in [None, ''] and (not float(remote_id).is_integer() or float(remote_id) <= 0):
        raise HTTPException(422, '远端用户 ID 需为正整数')
    if remote_id not in [None, '']: data['remoteUserId'] = int(float(remote_id))
    data.update(syncInterval=interval, quotaPerUnit=quota)
    return auth


def queue_sync(db, account):
    active = db.scalar(select(Record.id).where(Record.module == 'account-sync-runs', Record.slug == account.id))
    if active:
        raise HTTPException(409, '该账户已有排队或执行中的同步')
    db.add(Record(module='account-sync-runs', slug=account.id, name=account.name, owner_id=account.owner_id, status='排队中', data={'accountId': account.id}))
    account.data = {**account.data, 'syncState': '排队中'}
    if account.data.get('syncInterval'):
        account.data = {**account.data, '_nextSync': (now() + timedelta(minutes=int(account.data['syncInterval']))).isoformat()}


def sync_account(db, account):
    auth = db.get(Credential, account.id)
    if not auth:
        raise HTTPException(409, '账户登录凭证尚未配置')
    data = dict(account.data)
    remote = AccountClient(data['baseUrl'], json.loads(decrypt(auth.encrypted_secret)), data.get('remoteUserId'), data.get('adapter', 'New API'))
    remote.login()
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
    if data.get('checkin') == '每日签到' and data.get('_lastCheckinDay') != today:
        try:
            result = remote.request('POST', '/api/user/checkin', allow_failure=True)
            message = str(result.get('message', ''))
            if result.get('success') or any(word in message.lower() for word in ['already', '已签到', '重复签到']):
                data.update(_lastCheckinDay=today, checkinResult='今日已签到')
            else:
                data['checkinResult'] = '签到未成功，请核对站点支持和权限'
        except (httpx.HTTPError, ValueError, HTTPException):
            data['checkinResult'] = '签到接口不可用，其他同步继续'
    profile = remote.request('GET', '/api/user/self').get('data') or {}
    quota = profile.get('quota')
    if not isinstance(quota, (int, float)) or isinstance(quota, bool) or quota < 0:
        raise HTTPException(409, '账户接口未返回有效余额')
    secret, token_id = remote.api_key(data.get('tokenName') or 'KUGNI-' + account.id[:12])
    key = db.get(Record, data.get('credentialRef')) if data.get('credentialRef') else None
    if key and (key.module != 'test-keys' or key.data.get('station') != data['station']):
        raise HTTPException(409, '目标凭证归属已经变化，请重新选择')
    if not key:
        key = Record(id=uid(), module='test-keys', name=account.name + ' · 自动 Key', owner_id=account.owner_id, status='启用')
        db.add(key)
        db.flush()
    key.data = {**key.data, 'station': data['station'], 'baseUrl': data.get('apiBaseUrl') or data['baseUrl'], 'protocols': data['protocols'], 'managedAccountId': account.id}
    credential = db.get(Credential, key.id)
    if not credential:
        credential = Credential(id=key.id, encrypted_secret=encrypt(secret), fingerprint='••••' + secret[-4:])
        db.add(credential)
    else:
        credential.encrypted_secret, credential.fingerprint = encrypt(secret), '••••' + secret[-4:]
    db.flush()
    discover_models(db, key)
    balance = round(quota / float(data.get('quotaPerUnit') or 500000), 6)
    data.update(credentialRef=key.id, balance=balance, quota=quota, remoteTokenId=token_id, lastSyncedAt=now().isoformat(), syncState='同步成功', syncError='')
    threshold = float(data.get('balanceThreshold') or 0)
    low = threshold > 0 and balance < threshold
    if low and not data.get('_balanceLow'):
        db.add(Record(module='messages', owner_id=account.owner_id, name='探测账户余额不足', status='未读', data={'body': f'{account.name} 余额 {balance} {data.get("currency", "单位")}，低于阈值 {threshold:g}。', 'accountId': account.id}))
    data['_balanceLow'] = low
    account.data = data
    return data


def account_tick():
    with SessionLocal() as db:
        for job in db.scalars(select(Record).where(Record.module == 'account-sync-runs', Record.status == '执行中', Record.updated_at < now() - timedelta(minutes=15))):
            job.status, job.slug = '失败', None
            job.data = {**job.data, 'error': '同步进程失联，请核对远端 Key 状态后重试'}
            account = db.get(Record, job.data['accountId'])
            if account: account.data = {**account.data, 'syncState': '失败', 'syncError': '同步进程失联'}
        for account in db.scalars(select(Record).where(Record.module == 'probe-accounts', Record.status == '启用').with_for_update(skip_locked=True)):
            interval = int(account.data.get('syncInterval') or 0)
            due = account.data.get('_nextSync', '')
            if interval and (not due or due <= now().isoformat()) and not db.scalar(select(Record.id).where(Record.module == 'account-sync-runs', Record.slug == account.id)):
                queue_sync(db, account)
                account.data = {**account.data, '_nextSync': (now() + timedelta(minutes=interval)).isoformat()}
        db.commit()
        job = db.scalar(select(Record).where(Record.module == 'account-sync-runs', Record.status == '排队中').order_by(Record.created_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            return False
        claimed = db.execute(update(Record).where(Record.id == job.id, Record.status == '排队中').values(status='执行中'))
        jid = job.id
        db.commit()
        if claimed.rowcount != 1:
            return False
    try:
        with SessionLocal() as db:
            job = db.get(Record, jid)
            account = db.scalar(select(Record).where(Record.id == job.data['accountId'], Record.module == 'probe-accounts').with_for_update())
            if not account or account.status != '启用':
                raise HTTPException(409, '账户不存在或已暂停')
            result = sync_account(db, account)
            job.status, job.slug = '已完成', None
            job.data = {**job.data, **{k: result.get(k) for k in ['balance', 'checkinResult', 'credentialRef']}}
            db.commit()
    except Exception as exc:
        with SessionLocal() as db:
            job = db.get(Record, jid)
            error = safe_error(exc) if isinstance(exc, (HTTPException, httpx.HTTPError)) else '账户同步异常，请核对账户系统与配置'
            job.status, job.slug, job.data = '失败', None, {**job.data, 'error': error}
            account = db.get(Record, job.data['accountId'])
            if account:
                account.data = {**account.data, 'syncState': '失败', 'syncError': error}
            db.commit()
    return True
