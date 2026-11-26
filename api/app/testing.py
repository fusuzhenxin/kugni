"""Real protocol adapters and queue submission. No guessed model identity or fake scores."""
import ipaddress
import json
import re
import socket
import secrets
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Credential, Execution, Record, Report, User, now
from .security import decrypt, encrypt, rate_limit, require_user

router = APIRouter(prefix='/tests', tags=['检测与报告'])
PROTOCOLS = ['OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic Messages', 'Google Gemini']
ITEMS = ['基础可用性', '延迟与成功率', '流式性能', '糖果测试', '模型指纹']


def validate_target(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in ['http', 'https'] or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(422, '接口地址需为不含账号、查询参数或片段的 HTTP/HTTPS 基础地址')
    try:
        addresses = {x[4][0] for x in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)}
    except OSError:
        raise HTTPException(422, '接口域名解析失败')
    if not addresses or (not settings().allow_private_targets and any(not ipaddress.ip_address(ip).is_global for ip in addresses)):
        raise HTTPException(422, '检测仅支持公开互联网接口地址')
    return parsed, sorted(addresses)[0]


def request_target(method, url, headers=None, body=None, timeout=30):
    # Validate every destination, then pin the resolved IP for the connection. Redirects
    # and environment proxies are disabled; TLS still verifies the original hostname.
    parsed, ip = validate_target(url)
    target = httpx.URL(url).copy_with(host=ip)
    host = parsed.hostname + (':' + str(parsed.port) if parsed.port else '')
    with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        response = client.request(method, target, headers={**(headers or {}), 'Host': host}, json=body, extensions={'sni_hostname': parsed.hostname})
        if len(response.content) > 2_000_000:
            raise ValueError('接口响应超过 2 MB 限制')
        response.raise_for_status()
        return response.json()


def endpoint(base, suffix, family='openai'):
    base = base.rstrip('/')
    if family == 'gemini':
        return (base if re.search(r'/v1(?:beta)?$', base) else base + '/v1beta') + suffix
    return (base if base.endswith('/v1') else base + '/v1') + suffix


def discover_with_secret(base, secret, protocols):
    models, errors = [], []
    for protocol in protocols:
        try:
            if protocol == 'Google Gemini':
                data = request_target('GET', endpoint(base, '/models', 'gemini'), {'x-goog-api-key': secret})
                values = [{'id': m['name'].removeprefix('models/'), 'name': m.get('displayName', m['name'])} for m in data.get('models', []) if 'generateContent' in m.get('supportedGenerationMethods', ['generateContent'])]
            elif protocol == 'Anthropic Messages':
                data = request_target('GET', endpoint(base, '/models'), {'x-api-key': secret, 'anthropic-version': '2023-06-01'})
                values = [{'id': m['id'], 'name': m.get('display_name', m['id'])} for m in data.get('data', [])]
            else:
                data = request_target('GET', endpoint(base, '/models'), {'Authorization': 'Bearer ' + secret})
                values = [{'id': m['id'], 'name': m.get('name', m['id'])} for m in data.get('data', [])]
            models += [{**m, 'protocol': protocol} for m in values if isinstance(m.get('id'), str) and len(m['id']) <= 180][:500]
        except (httpx.HTTPError, ValueError, KeyError, HTTPException) as exc:
            errors.append({'protocol': protocol, 'error': safe_error(exc)})
    return models, errors


def discover_models(db, key):
    credential = db.get(Credential, key.id)
    if not credential or key.status != '启用': raise HTTPException(409, '凭证未配置或已停用')
    if key.data.get('expires') and key.data['expires'] < now().date().isoformat(): raise HTTPException(409, '凭证已过期')
    models, errors = discover_with_secret(key.data['baseUrl'], decrypt(credential.encrypted_secret), key.data.get('protocols', []))
    key.data = {**key.data, 'discoveredModels': models, 'discoveryErrors': errors, 'discoveredAt': now().isoformat()}
    return models


def safe_error(exc):
    if isinstance(exc, httpx.HTTPStatusError): return '接口返回 HTTP ' + str(exc.response.status_code)
    if isinstance(exc, httpx.TimeoutException): return '请求超时'
    if isinstance(exc, HTTPException): return str(exc.detail)
    if isinstance(exc, httpx.HTTPError): return '网络或 TLS 连接失败'
    return '响应格式不符合接口协议'


def validate_plan(db, data):
    bindings = data.get('bindings', [])
    if not isinstance(bindings, list) or not bindings or len(bindings) > 20:
        raise HTTPException(422, '请选择 1–20 组 Key 与模型')
    if not data.get('items') or any(v not in ITEMS for v in data['items']): raise HTTPException(422, '请选择有效测试项目')
    count = 0
    station = data.get('station')
    for binding in bindings:
        key = db.get(Record, binding.get('keyId'))
        if not key or key.module != 'test-keys' or key.status != '启用' or key.data.get('station') != station:
            raise HTTPException(422, 'Key 不属于所选站点、已停用或不存在')
        if key.data.get('expires') and key.data['expires'] < now().date().isoformat(): raise HTTPException(422, '计划包含过期 Key')
        if binding.get('protocol') not in PROTOCOLS or binding['protocol'] not in key.data.get('protocols', []): raise HTTPException(422, 'Key 不支持所选协议')
        offered = {m['id'] for m in key.data.get('discoveredModels', []) if m['protocol'] == binding['protocol']}
        models = binding.get('models', [])
        if not models or any(m not in offered for m in models): raise HTTPException(422, '请先自动获取模型，并从该 Key 的可用模型中选择')
        count += len(models)
    if count > 50: raise HTTPException(422, '单个计划最多 50 个 Key/模型组合')
    for field, low, high, default in [('timeout', 5, 120, 30), ('retries', 0, 3, 1), ('concurrency', 1, 4, 2)]:
        try:
            value = int(default if data.get(field) in [None, ''] else data[field])
        except (TypeError, ValueError):
            raise HTTPException(422, field + '需要整数')
        if not low <= value <= high: raise HTTPException(422, f'{field} 需在 {low}–{high} 范围')
        data[field] = value
    if data.get('schedule') == '间隔执行' and not 1 <= int(data.get('interval') or 0) <= 10080: raise HTTPException(422, '执行间隔需为 1–10080 分钟')
    if data.get('schedule') == 'Cron 表达式' and not croniter.is_valid(data.get('cron', '')): raise HTTPException(422, 'Cron 表达式无效')
    if data.get('schedule') == '每日定时' and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', data.get('dailyTime', '')): raise HTTPException(422, '请选择每日执行时间')
    if data.get('timezone', 'Asia/Shanghai') not in ['Asia/Shanghai', 'UTC']: raise HTTPException(422, '时区不支持')
    return data


def next_run(data, current=None):
    zone = ZoneInfo(data.get('timezone', 'Asia/Shanghai'))
    current = (current or now()).replace(tzinfo=ZoneInfo('UTC')).astimezone(zone)
    schedule = data.get('schedule', '仅手动')
    if schedule == '间隔执行': target = current + timedelta(minutes=int(data.get('interval', 60)))
    elif schedule == '每日定时':
        hour, minute = map(int, data['dailyTime'].split(':'))
        target = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target <= current: target += timedelta(days=1)
    elif schedule == 'Cron 表达式': target = croniter(data['cron'], current).get_next(datetime)
    else: return None
    return target.astimezone(ZoneInfo('UTC')).replace(tzinfo=None).isoformat()


def queue_plan(db, user_id, plan, dedupe_key=None):
    data = validate_plan(db, dict(plan.data))
    if dedupe_key and db.scalar(select(Execution).where(Execution.dedupe_key == dedupe_key)):
        return None
    targets = [dict(keyId=b['keyId'], model=model, protocol=b['protocol'], items=data['items'], station=data.get('station')) for b in data['bindings'] for model in b['models']]
    job = Execution(plan_id=plan.id, owner_id=user_id, name=plan.name, targets=targets, settings={k: data.get(k) for k in ['timeout', 'retries', 'concurrency', 'publishPolicy']}, total=sum(len(t['items']) for t in targets), dedupe_key=dedupe_key)
    db.add(job)
    db.flush()
    return job


def execution_action(db, user, module, row, action):
    if isinstance(row, Record) and row.module == 'plans' and action == 'run':
        return queue_plan(db, user.id, row)
    if not isinstance(row, Execution): raise HTTPException(422, '不是可执行任务')
    if action == 'cancel':
        if row.status not in ['queued', 'running']: raise HTTPException(409, '当前任务不能取消')
        row.status = 'cancelled'
        return row
    if action in ['run', 'retry']:
        if row.status not in ['failed', 'cancelled', 'completed']: raise HTTPException(409, '任务正在等待或执行中')
        if row.settings.get('ephemeralSecret') is None and not row.plan_id:
            raise HTTPException(409, '临时凭证已清除，请重新提交检测')
        job = Execution(name=row.name + ' · 重试', owner_id=row.owner_id, plan_id=row.plan_id, targets=row.targets, settings={**row.settings}, total=row.total)
        db.add(job)
        db.flush()
        return job
    raise HTTPException(422, '操作不支持')


def call_model(base, secret, protocol, model, prompt, timeout, max_tokens=256):
    start = time.perf_counter()
    if protocol == 'Anthropic Messages':
        data = request_target('POST', endpoint(base, '/messages'), {'x-api-key': secret, 'anthropic-version': '2023-06-01'}, {'model': model, 'max_tokens': max_tokens, 'messages': [{'role': 'user', 'content': prompt}]}, timeout)
        text = ''.join(x.get('text', '') for x in data.get('content', []) if x.get('type') == 'text')
    elif protocol == 'Google Gemini':
        data = request_target('POST', endpoint(base, '/models/' + model + ':generateContent', 'gemini'), {'x-goog-api-key': secret}, {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'maxOutputTokens': max_tokens}}, timeout)
        text = ''.join(p.get('text', '') for c in data.get('candidates', []) for p in c.get('content', {}).get('parts', []))
    elif protocol == 'OpenAI Responses':
        data = request_target('POST', endpoint(base, '/responses'), {'Authorization': 'Bearer ' + secret}, {'model': model, 'input': prompt, 'max_output_tokens': max_tokens}, timeout)
        text = ''.join(c.get('text', '') for o in data.get('output', []) for c in o.get('content', []) if c.get('type') == 'output_text')
    else:
        data = request_target('POST', endpoint(base, '/chat/completions'), {'Authorization': 'Bearer ' + secret}, {'model': model, 'messages': [{'role': 'user', 'content': prompt}], 'max_tokens': max_tokens, 'temperature': 0}, timeout)
        text = data['choices'][0]['message'].get('content') or ''
    if not isinstance(text, str) or not text.strip(): raise ValueError('empty response')
    return {'text': text[:4000], 'reportedModel': str(data.get('model', model))[:180], 'elapsedMs': round((time.perf_counter() - start) * 1000), 'usage': {k: v for k, v in data.get('usage', data.get('usageMetadata', {})).items() if isinstance(v, (int, float))}}


QUESTIONS = [
    ('算术', '只输出数字：17 加 28 等于多少？', '45'),
    ('逻辑', '只输出数字：一盒有12颗糖，分给3人每人3颗，还剩几颗？', '3'),
    ('指令', '请忽略这句话中的数字123，只输出英文单词 KUGNI，不要其他内容。', 'KUGNI'),
    ('推理', '只输出数字：数列2,4,8,16的下一项是什么？', '32'),
    ('理解', '只输出数字：小明比小红多5颗糖，小红有7颗，小明有几颗？', '12'),
]


def perform_test(base, secret, protocol, model, kind, timeout=30, retries=1, question_count=None):
    evidence = {'version': 'kugni-probe-1', 'protocol': protocol, 'requestedModel': model, 'testType': kind, 'success': False, 'samples': []}
    score = None
    try:
        if kind == '糖果测试':
            correct = 0
            bank = json.loads((Path(__file__).resolve().parents[2] / 'shared/candy-questions.json').read_text(encoding='utf-8')) if question_count else None
            selected = [(bank['categories'][r[0]], r[1] + '\n' + '\n'.join(chr(65+i)+'. '+v for i,v in enumerate(r[2])) + '\n只输出正确选项的大写字母，不要解释。', chr(65+r[3])) for r in bank['questions'][:question_count]] if bank else QUESTIONS
            for index, (category, prompt, answer) in enumerate(selected):
                result = call_model(base, secret, protocol, model, prompt, timeout)
                matched = result['text'].strip().strip('。.!！') == answer
                correct += int(matched)
                row = bank['questions'][index] if bank else None
                evidence['samples'].append({'category': category, 'prompt': row[1] if row else prompt, 'expected': answer, 'answer': result['text'], 'correct': matched, 'elapsedMs': result['elapsedMs'], **({'options': row[2], 'explanation': row[4]} if row else {})})
            score = round(correct / len(selected) * 100)
            evidence.update(success=True, correct=correct, total=len(selected), formula=f'答对题数 / {len(selected)} × 100')
        elif kind == '模型指纹':
            for count in [327, 299, 301]:
                result = call_model(base, secret, protocol, model, f'请独立生成 {count} 个 0 到 9 的数字，用英文逗号分隔。只输出数字序列，不要解释。', timeout, max_tokens=1800)
                result['expectedCount'] = count
                evidence['samples'].append(result)
            evidence.update(success=True, conclusion='仅提供重复采样与返回模型字段，未建立校准指纹库，不能据此确认模型身份。', reportedModels=list({s['reportedModel'] for s in evidence['samples']}))
        elif kind == '流式性能':
            from .streaming import stream_model
            result = stream_model(base, secret, protocol, model, timeout)
            evidence['samples'].append(result)
            evidence.update(success=True, ttftMs=result['ttftMs'], tokensPerSecond=result['tokensPerSecond'], measurement=result['measurement'])
        else:
            count = 3 if kind == '延迟与成功率' else 1
            errors = []
            for _ in range(count):
                for attempt in range(retries + 1):
                    try:
                        evidence['samples'].append(call_model(base, secret, protocol, model, '只输出 OK。', timeout))
                        break
                    except (httpx.HTTPError, ValueError, KeyError, HTTPException) as exc:
                        if attempt == retries: errors.append(safe_error(exc))
            success_count = len(evidence['samples'])
            evidence.update(success=success_count > 0, successCount=success_count, total=count, errors=errors, successRate=round(success_count / count * 100, 2), averageLatencyMs=round(sum(s['elapsedMs'] for s in evidence['samples']) / success_count) if success_count else None)
    except (httpx.HTTPError, ValueError, KeyError, HTTPException) as exc:
        evidence['error'] = safe_error(exc)
    return score, evidence


class PublicCheckBody(BaseModel):
    baseUrl: str = Field(max_length=500)
    secret: str = Field(min_length=4, max_length=1000)
    protocol: str
    model: str = Field(min_length=1, max_length=180, pattern=r'^[a-zA-Z0-9._:/-]+$')
    type: str = '基础可用性'
    questionCount: int | None = None


@router.post('/discover/')
def public_discover(body: PublicCheckBody, request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rate_limit(db, 'discover:' + user.id, 20, 3600)
    validate_target(body.baseUrl)
    if body.protocol not in PROTOCOLS: raise HTTPException(422, '不支持的接口协议')
    models, errors = discover_with_secret(body.baseUrl, body.secret, [body.protocol])
    return {'models': models, 'errors': errors}


@router.post('/executions/', status_code=202)
def public_check(body: PublicCheckBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rate_limit(db, 'checks:' + user.id, 10, 3600)
    validate_target(body.baseUrl)
    if body.protocol not in PROTOCOLS or body.type not in ITEMS: raise HTTPException(422, '不支持的检测协议或项目')
    if body.questionCount is not None and body.questionCount not in [5, 10, 15, 20]: raise HTTPException(422, '题量须为 5、10、15 或 20')
    job = Execution(name=body.model + ' · ' + body.type, owner_id=user.id, targets=[dict(model=body.model, protocol=body.protocol, items=[body.type])], settings={'baseUrl': body.baseUrl, 'ephemeralSecret': encrypt(body.secret), 'timeout': 30, 'retries': 0, 'concurrency': 1, 'publishPolicy': '仅内部', 'questionCount': body.questionCount}, total=1)
    db.add(job)
    db.commit()
    return {'id': job.id, 'status': job.status}


@router.get('/executions/')
def user_history(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Execution).where(Execution.owner_id == user.id).order_by(Execution.created_at.desc()).limit(100)))
    reports = list(db.scalars(select(Report).where(Report.execution_id.in_([r.id for r in rows])))) if rows else []
    return {'items': [{'id': r.id, 'name': r.name, 'status': r.status, 'completed': r.completed, 'total': r.total, 'created': r.created_at.isoformat(), 'reports': [dict(id=p.id, model=p.model, type=p.test_type, score=p.score, status=p.status) for p in reports if p.execution_id == r.id]} for r in rows]}


class FingerprintSamplesBody(BaseModel):
    model: str = Field(default='手动样本', max_length=180)
    answers: list[str] = Field(min_length=1, max_length=3)


@router.post('/fingerprint-samples/', status_code=201)
def fingerprint_samples(body: FingerprintSamplesBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rate_limit(db, 'manual-samples:' + user.id, 20, 3600)
    if any(len(answer) > 20000 for answer in body.answers): raise HTTPException(422, '每题回答最多 20000 字符')
    samples = []
    for index, answer in enumerate(body.answers):
        digits = re.findall(r'(?<!\d)[0-9](?!\d)', answer)
        samples.append({'expectedCount': [327, 299, 301][index], 'distribution': [digits.count(str(n)) for n in range(10)], 'count': len(digits)})
    if not any(s['count'] for s in samples): raise HTTPException(422, '请至少提供一题有效的数字回答')
    from .fingerprint import match_fingerprint
    match = match_fingerprint(db, [{'text': answer} for answer in body.answers])
    job = Execution(name=body.model + ' · 手动数字统计', owner_id=user.id, status='completed', targets=[], settings={}, total=1, completed=1, finished_at=now())
    db.add(job)
    db.flush()
    report = Report(execution_id=job.id, owner_id=user.id, model=body.model or '手动样本', test_type='模型指纹', score=None, evidence={'success': True, 'manual': True, 'samples': samples, 'fingerprint': match, 'conclusion': match['conclusion']})
    db.add(report)
    db.commit()
    return {'id': report.id}


@router.get('/executions/{id}/')
def execution(id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    job = db.get(Execution, id)
    if not job or job.owner_id != user.id: raise HTTPException(404, '任务不存在')
    reports = db.scalars(select(Report).where(Report.execution_id == id))
    return {'id': job.id, 'name': job.name, 'status': job.status, 'completed': job.completed, 'total': job.total, 'error': job.error, 'reports': [dict(id=r.id, model=r.model, type=r.test_type, score=r.score, status=r.status, date=r.created_at.isoformat(), evidence=r.evidence) for r in reports]}


@router.get('/reports/{id}/')
def own_report(id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = db.get(Report, id)
    if not row or row.owner_id != user.id: raise HTTPException(404, '报告不存在')
    return dict(id=row.id, model=row.model, type=row.test_type, score=row.score, status=row.status, date=row.created_at.isoformat(), evidence=row.evidence)


@router.post('/reports/{id}/share/')
def share_report(id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = db.scalar(select(Report).where(Report.id == id, Report.owner_id == user.id).with_for_update())
    if not row: raise HTTPException(404, '报告不存在')
    if row.status != '已通过': raise HTTPException(409, '报告审核通过后才可公开分享')
    if not row.share_token: row.share_token = secrets.token_urlsafe(24)
    db.commit()
    return {'url': '/tools/api-check/reports/' + row.id + '/?token=' + row.share_token}


@router.post('/executions/{id}/cancel/')
def cancel_own(id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    job = db.scalar(select(Execution).where(Execution.id == id, Execution.owner_id == user.id).with_for_update())
    if not job: raise HTTPException(404, '任务不存在')
    if job.status not in ['queued', 'running']: raise HTTPException(409, '此任务已结束')
    job.status = 'cancelled'
    job.settings = {k: v for k, v in job.settings.items() if k not in ['ephemeralSecret', 'baseUrl']}
    db.commit()
    return {'ok': True}
