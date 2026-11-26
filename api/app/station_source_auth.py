"""Encrypted console sessions for account-visible station metadata only."""
import json
from datetime import timedelta, timezone
from email.utils import parsedate_to_datetime
from http.cookies import SimpleCookie
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import Credential, Record, now
from .security import decrypt, encrypt
from .testing import validate_target
from .station_source_network import StationTLSContext, resolve_source_ip

ACCOUNT_MODULE = 'station-source-accounts'
ADAPTERS = ['Sub2API', 'Foxcode']


def root_url(value):
    value = str(value or '').rstrip('/')
    parsed, _ = validate_target(value)
    if parsed.path not in ['', '/'] or parsed.scheme != 'https' and not settings().allow_private_targets:
        raise HTTPException(422, '采集账号请填写 HTTPS 控制台根地址，不填 /v1 或页面路径')
    return value


def load_auth(db, row):
    credential = db.get(Credential, row.id)
    if not credential:
        raise HTTPException(409, '尚未保存采集登录凭证')
    return json.loads(decrypt(credential.encrypted_secret))


def save_auth(db, row, auth):
    encoded = encrypt(json.dumps(auth))
    credential = db.get(Credential, row.id)
    if credential:
        credential.encrypted_secret = encoded
    else:
        db.add(Credential(id=row.id, encrypted_secret=encoded, fingerprint='采集凭证已加密'))


def validate_account(db, data, values, row=None):
    station = db.get(Record, data.get('station'))
    if not station or station.module != 'stations': raise HTTPException(422, '请选择有效中转站')
    data['baseUrl'] = root_url(data.get('baseUrl'))
    if data.get('adapter') not in ADAPTERS: raise HTTPException(422, '不支持该采集账号系统')
    if data.get('connection', '直连') not in ['直连', '配置的采集代理']: raise HTTPException(422, '采集连接方式无效')
    if data.get('connection') == '配置的采集代理' and not settings().station_source_proxy_url:
        raise HTTPException(422, '服务器尚未配置采集代理')
    if row:
        bound = list(db.scalars(select(Record).where(Record.module == 'station-sync-tasks', Record.data['sourceAccount'].as_string() == row.id)))
        for task in bound:
            if any(data.get(k) != row.data.get(k) for k in ['station', 'baseUrl', 'adapter']):
                raise HTTPException(409, '账号已关联采集任务，更换站点或系统前请先解除关联')
            if db.scalar(select(Record.id).where(Record.module == 'station-sync-runs', Record.data['taskId'].as_string() == task.id, Record.status.in_(['排队中', '采集中']))):
                raise HTTPException(409, '账号正在用于采集，请完成后再编辑')
    auth = load_auth(db, row) if row else {}
    account = str(data.get('account') or '').strip()
    if not account: raise HTTPException(422, '请填写登录邮箱或用户名')
    changed = not row or account != auth.get('account') or bool(values.get('password')) or any(data.get(k) != row.data.get(k) for k in ['baseUrl', 'adapter'])
    if values.get('password'): auth['password'] = values['password']
    if not auth.get('password'): raise HTTPException(422, '首次保存需要填写登录密码')
    auth['account'] = account
    data['account'] = account
    if changed:
        auth.pop('session', None)
        auth.pop('blocked', None)
        data.update(authState='待登录', sessionExpiresAt='', lastAuthError='')
    return auth


class ConsoleSession:
    def __init__(self, row, auth, persist=None, transport=None):
        self.base = root_url(row.data['baseUrl'])
        self.adapter, self.auth = row.data['adapter'], auth
        self.session = auth.setdefault('session', {})
        self.persist = persist or (lambda state, error='': None)
        self.transport = transport
        self.login_error = None
        self.recovery_attempted = False
        self.proxy = settings().station_source_proxy_url if row.data.get('connection') == '配置的采集代理' else None
        self.pinned_ip = None

    def resolve_ip(self, parsed, system_ip):
        if self.pinned_ip: return self.pinned_ip
        self.pinned_ip = resolve_source_ip(parsed, system_ip, self.proxy, self.transport)
        return self.pinned_ip

    def remember(self, state='已登录', error=''):
        self.persist(state, error)

    def request_raw(self, method, path, body=None, authenticated=True):
        if not path.startswith('/') or path.startswith('//') or '/admin/' in path or path.startswith('/api/admin'):
            raise ValueError('采集仅允许固定的用户可见接口')
        url = self.base + path
        parsed, ip = validate_target(url.split('?', 1)[0])
        ip = self.resolve_ip(parsed, ip)
        headers = {'Host': parsed.netloc, 'Accept': 'application/json', 'User-Agent': 'KugniStationMetadata/1.0',
                   'Origin': self.base, 'Referer': self.base + '/'}
        if authenticated and self.session.get('accessToken'):
            headers['Authorization'] = 'Bearer ' + self.session['accessToken']
        cookies = [c for c in self.session.get('cookies', []) if not c.get('expires') or c['expires'] > now().replace(tzinfo=timezone.utc).timestamp()]
        # Cookies never leave this origin; destinations cannot be supplied by a response.
        if cookies: headers['Cookie'] = '; '.join(c['name'] + '=' + c['value'] for c in cookies if parsed.path.startswith(c.get('path') or '/'))
        target = httpx.URL(url).copy_with(host=ip)
        # httpcore's CONNECT path does not apply the sni_hostname extension. The
        # dedicated context keeps hostname verification enabled for the real host.
        tls = StationTLSContext(parsed.hostname) if self.proxy else True
        with httpx.Client(timeout=20, trust_env=False, follow_redirects=False, proxy=self.proxy, transport=self.transport, verify=tls) as client:
            with client.stream(method, target, json=body, headers=headers, extensions={'sni_hostname': parsed.hostname}) as response:
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > 3_000_000: raise ValueError('采集响应超过大小限制')
                # Do not store cookie values or remote messages in logs or record JSON.
                for cookie_line in response.headers.get_list('set-cookie'):
                    parsed_cookie = SimpleCookie()
                    try: parsed_cookie.load(cookie_line)
                    except Exception: continue
                    for name, morsel in parsed_cookie.items():
                        domain = morsel['domain'].lstrip('.').lower()
                        if domain and parsed.hostname != domain and not parsed.hostname.endswith('.' + domain): continue
                        path_value = morsel['path'] or '/'
                        cookies = [c for c in cookies if (c['name'], c.get('path', '/')) != (name, path_value)]
                        expiry = None
                        try:
                            if morsel['max-age']: expiry = now().replace(tzinfo=timezone.utc).timestamp() + int(morsel['max-age'])
                            elif morsel['expires']: expiry = parsedate_to_datetime(morsel['expires']).timestamp()
                        except (ValueError, TypeError, OverflowError): continue
                        if morsel.value and (not expiry or expiry > now().replace(tzinfo=timezone.utc).timestamp()):
                            cookies.append({'name': name, 'value': morsel.value, 'path': path_value, 'expires': expiry})
                self.session['cookies'] = cookies
                if response.status_code >= 400 or response.is_redirect:
                    if method == 'POST' and path.endswith('/auth/login'):
                        try:
                            failure = json.loads(raw)
                            message = str(failure.get('message') or failure.get('statusMessage') or failure.get('code') or '').lower()
                        except (ValueError, AttributeError): message = ''
                        if any(s in message for s in ['turnstile', 'captcha', '验证码', '安全验证']):
                            raise HTTPException(409, '登录需要完成验证码或访问验证，请人工重新授权')
                        if any(s in message for s in ['2fa', 'two_factor', 'totp', '二次验证']):
                            raise HTTPException(409, '登录需要二次验证，请人工重新授权')
                        if response.status_code == 401 or any(s in message for s in ['invalid credentials', 'invalid email or password', '账号或密码', '密码错误']):
                            raise HTTPException(401, '登录账号或密码不正确，请修改保存的采集凭证')
                    # New exception contains no response body, cookies, or credentials.
                    raise HTTPException(response.status_code if response.status_code >= 400 else 409, '远端登录或采集接口返回 HTTP ' + str(response.status_code))
                try: data = json.loads(raw)
                except (ValueError, UnicodeDecodeError): raise ValueError('远端未返回有效 JSON；可能需要完成访问验证')
        if not isinstance(data, (dict, list)): raise ValueError('远端数据格式无效')
        return data

    def unpack(self, data):
        if self.adapter == 'Sub2API':
            if not isinstance(data, dict) or data.get('code') != 0:
                if isinstance(data, dict) and data.get('code') in ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'REFRESH_TOKEN_INVALID', 'REFRESH_TOKEN_EXPIRED', 'REFRESH_TOKEN_REUSED', 'INVALID_REFRESH_TOKEN', 'TOKEN_REVOKED']:
                    raise HTTPException(401, '远端登录会话已过期')
                raise HTTPException(409, '远端拒绝请求，请核对账号权限或二次验证要求')
            return data.get('data')
        if not isinstance(data, dict) or data.get('success') is False:
            raise HTTPException(409, '远端拒绝请求，请核对账号权限或访问验证要求')
        return data.get('data', data)

    def accept_session(self, data):
        if not isinstance(data, dict): raise ValueError('登录响应格式无效')
        if any(data.get(k) for k in ['requires_2fa', 'requires_totp', 'require_2fa', 'temp_token']):
            raise HTTPException(409, '该账号需要二次验证，请人工重新授权')
        if self.adapter == 'Sub2API':
            token = data.get('access_token')
            if not isinstance(token, str) or not token: raise HTTPException(409, '登录未获得访问令牌，可能需要验证码或二次验证')
            self.session['accessToken'] = token
            if data.get('refresh_token'): self.session['refreshToken'] = data['refresh_token']
            seconds = data.get('expires_in')
            self.session['expiresAt'] = (now() + timedelta(seconds=seconds)).isoformat() if type(seconds) in [int, float] and 0 < seconds < 31536000 else ''
        elif not self.session.get('cookies'):
            raise HTTPException(409, '登录未获得会话 Cookie，可能需要验证码或二次验证')

    def login(self):
        if self.login_error: raise self.login_error
        if self.auth.get('blocked'): raise HTTPException(409, '采集账号需要处理，请核对登录凭证或完成额外验证后重新保存密码')
        self.session.clear()
        path = '/api/v1/auth/login' if self.adapter == 'Sub2API' else '/api/auth/login'
        try:
            data = self.unpack(self.request_raw('POST', path, {'email': self.auth['account'], 'password': self.auth['password']}, False))
            self.accept_session(data)
            self.session['lastLoginAt'] = now().isoformat()
            self.remember()
        except (HTTPException, httpx.HTTPError, ValueError) as exc:
            self.login_error = exc
            if isinstance(exc, HTTPException) and exc.status_code in [400, 401, 403, 409]:
                self.auth['blocked'] = True
                self.remember('需要处理', exc.detail)
            raise

    def renew(self):
        if self.adapter == 'Sub2API' and not self.session.get('refreshToken'): return False
        path = '/api/v1/auth/refresh' if self.adapter == 'Sub2API' else '/api/auth/refresh'
        body = {'refresh_token': self.session['refreshToken']} if self.adapter == 'Sub2API' else None
        try:
            data = self.unpack(self.request_raw('POST', path, body, False))
            self.accept_session(data)
            self.session['lastRefreshedAt'] = now().isoformat()
            self.remember()
            return True
        except HTTPException as exc:
            if exc.status_code not in [400, 401]: raise
            return False

    def get(self, path):
        if self.auth.get('blocked'): raise HTTPException(409, '采集账号需要处理，请核对凭证或完成额外验证后重新保存密码')
        exists = bool(self.session.get('accessToken') or self.session.get('cookies'))
        if not exists: self.login()
        try:
            data = self.unpack(self.request_raw('GET', path))
        except HTTPException as exc:
            if exc.status_code != 401: raise
            # Exactly one refresh/re-login and one retry. A 403 never triggers login.
            if self.recovery_attempted: raise HTTPException(409, '会话续期后仍被拒绝，请核对账号权限或额外验证')
            self.recovery_attempted = True
            if not self.renew(): self.login()
            try: data = self.unpack(self.request_raw('GET', path))
            except HTTPException as retry:
                if retry.status_code == 401:
                    self.auth['blocked'] = True
                    self.remember('需要处理', '重新授权后仍被拒绝，请核对账号权限或额外验证')
                raise
        self.remember()
        return data


def account_client(account_id):
    with SessionLocal() as db:
        row = db.get(Record, account_id)
        if not row or row.module != ACCOUNT_MODULE or row.status != '启用': raise HTTPException(409, '采集账号不存在或已停用')
        auth = load_auth(db, row)
        version = row.version

    def persist(state, error=''):
        with SessionLocal() as db:
            current = db.get(Record, account_id)
            if not current or current.status != '启用' or current.version != version: raise HTTPException(409, '采集账号配置已变化，请重试')
            save_auth(db, current, auth)
            current.data = {**current.data, 'authState': state, 'lastAuthError': error,
                            'sessionExpiresAt': auth.get('session', {}).get('expiresAt', ''),
                            'lastLoginAt': auth.get('session', {}).get('lastLoginAt', ''), 'lastUsedAt': now().isoformat()}
            db.commit()

    return ConsoleSession(row, auth, persist)
