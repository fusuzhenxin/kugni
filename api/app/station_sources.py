"""Public or authorized account-visible announcements and channel snapshots."""
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .cache import enqueue_invalidation
from .db import SessionLocal
from .localization import sync_record
from .models import Record, User, now
from .channel_history import merge_snapshot, observation
from .testing import next_run, safe_error, validate_target
from .station_public_adapters import NOTICE_ADAPTERS, STATUS_ADAPTERS, public_notices, public_channels
from .station_monitor_adapters import ADAPTERS as MONITOR_ADAPTERS, tuzi_channels, betterstack_channels
from .station_aruhub_adapter import ADAPTER as ARUHUB_ADAPTER, aruhub_channels
from .station_fluxlane_adapter import ADAPTER as FLUXLANE_ADAPTER, fluxlane_channels

DATASETS = ['站点公告', '渠道状态', '模型与报价']
ADAPTERS = ['New API 公开监测', 'Uptime Kuma', 'Statuspage', 'Sub2API 渠道监控', 'Sub2API 聚合监控', *STATUS_ADAPTERS, *MONITOR_ADAPTERS, ARUHUB_ADAPTER, FLUXLANE_ADAPTER]


def needs_account(cfg):
    return ('站点公告' in cfg.get('datasets', []) and cfg.get('sourceAdapter') in ['Sub2API', 'Foxcode']) or ('渠道状态' in cfg.get('datasets', []) and cfg.get('statusAdapter', '').startswith('Sub2API '))


def account_binding(db, cfg):
    from .station_source_auth import ACCOUNT_MODULE
    account = db.get(Record, cfg.get('sourceAccount')) if cfg.get('sourceAccount') else None
    if not account or account.module != ACCOUNT_MODULE or account.status != '启用': raise HTTPException(422, '请选择启用的采集登录账号')
    if account.data.get('station') != cfg['station'] or account.data.get('baseUrl') != cfg['sourceBaseUrl']:
        raise HTTPException(422, '采集账号的所属站点和控制台地址必须与任务一致')
    if '站点公告' in cfg['datasets'] and cfg.get('sourceAdapter') in ['Sub2API', 'Foxcode'] and account.data.get('adapter') != cfg['sourceAdapter']:
        raise HTTPException(422, '公告接口与采集账号系统不一致')
    if '渠道状态' in cfg['datasets'] and cfg.get('statusAdapter', '').startswith('Sub2API ') and account.data.get('adapter') != 'Sub2API':
        raise HTTPException(422, 'Sub2API 渠道监控需要对应系统的采集账号')
    return account


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ['script', 'style', 'iframe', 'object']: self.hidden += 1
        if tag in ['p', 'br', 'div', 'li', 'h1', 'h2', 'h3'] and not self.hidden: self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ['script', 'style', 'iframe', 'object']: self.hidden = max(0, self.hidden - 1)
        if tag in ['p', 'div', 'li'] and not self.hidden: self.parts.append('\n')

    def handle_data(self, value):
        if not self.hidden: self.parts.append(value)


def plain(value, limit=12000):
    if not isinstance(value, str): raise ValueError('来源正文格式无效')
    parser = TextOnly(); parser.feed(value)
    text = re.sub(r'\n[ \t]*\n+', '\n\n', ''.join(parser.parts)).strip()
    if len(text) > limit: raise ValueError('来源正文超过长度限制')
    return text


def stamp(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        # Kuma uses UTC timestamps, sometimes without an explicit offset.
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


class PublicSource:
    def __init__(self, connection='直连', transport=None):
        from .config import settings
        self.proxy = settings().station_source_proxy_url if connection == '配置的采集代理' else None
        if connection == '配置的采集代理' and not self.proxy: raise HTTPException(422, '服务器尚未配置采集代理')
        self.transport, self.addresses = transport, {}

    def read(self, url, accept):
        from .station_source_network import StationTLSContext, resolve_source_ip
        for _ in range(3):
            parsed, ip = validate_target(url.split('?', 1)[0])
            if self.proxy:
                if parsed.hostname not in self.addresses:
                    self.addresses[parsed.hostname] = resolve_source_ip(parsed, ip, self.proxy, self.transport)
                ip = self.addresses[parsed.hostname]
            target = httpx.URL(url).copy_with(host=ip)
            headers = {'Host': parsed.hostname + (':' + str(parsed.port) if parsed.port else ''),
                       'User-Agent': 'KugniPublicMetadata/1.0 (+https://www.kugni.com)', 'Accept': accept}
            tls = StationTLSContext(parsed.hostname) if self.proxy and parsed.scheme == 'https' else True
            with httpx.Client(timeout=15, trust_env=False, follow_redirects=False, proxy=self.proxy, transport=self.transport, verify=tls) as client:
                with client.stream('GET', target, headers=headers, extensions={'sni_hostname': parsed.hostname}) as response:
                    if response.is_redirect:
                        url = urljoin(url, response.headers['location'])
                        continue  # Resolve and validate every redirect, including cross-host redirects.
                    if response.headers.get('cf-mitigated') == 'challenge':
                        raise HTTPException(409, '来源要求完成访问验证，采集已停止，请使用站方允许的访问方式')
                    response.raise_for_status()
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body.extend(chunk)
                        if len(body) > 3_000_000: raise ValueError('来源响应超过大小限制')
                    return bytes(body)
        raise ValueError('来源重定向次数过多')

    def get(self, url):
        data = json.loads(self.read(url, 'application/json'))
        if not isinstance(data, dict): raise ValueError('来源不是有效 JSON 对象')
        return data

    def text(self, url):
        return self.read(url, 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.5').decode('utf-8')


def success(data):
    if data.get('success') is not True: raise ValueError('来源接口未确认成功')
    return data.get('data')


def announcements(client, base):
    sources, errors, received = [], [], 0
    for path in ['/api/notice', '/api/status']:
        try:
            data = success(client.get(base + path))
            if path == '/api/notice':
                if not isinstance(data, str): raise ValueError('公告接口格式无效')
                body = plain(data)
                sources += [{'identity': 'notice', 'body': body, 'name': '站点公告', 'sourceUrl': base + path}] if body else []
            else:
                if not isinstance(data, dict): raise ValueError('控制台接口格式无效')
                if data.get('announcements_enabled') is not False:
                    values = data.get('announcements', [])
                    if isinstance(values, str): values = json.loads(values)
                    if not isinstance(values, list) or len(values) > 500: raise ValueError('控制台公告数量或格式异常')
                    for item in values[:100]:
                        if not isinstance(item, dict): raise ValueError('控制台公告格式异常')
                        body = plain(item.get('content', ''))
                        if not body: continue
                        identity = str(item.get('id') or hashlib.sha256(body.encode()).hexdigest())
                        sources.append({'identity': 'console:' + identity, 'body': body,
                                        'name': plain(item.get('title') or body.splitlines()[0], 12000)[:80],
                                        'publishedAt': str(item.get('publishDate') or '')[:60], 'sourceUrl': base + path})
            received += 1
        except (httpx.HTTPError, HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
            errors.append(path + '：' + error_text(exc))
    if not received: raise ValueError('公告来源均不可用；' + '；'.join(errors))
    # Do not republish the same text if a site exposes it in both interfaces.
    unique = {}
    for row in sources: unique.setdefault(row['body'], row)
    return list(unique.values()), errors


def kuma_paths(url):
    parsed = urlparse(url)
    match = re.fullmatch(r'(.*)/status/([a-zA-Z0-9_-]+)/?', parsed.path)
    if not match: raise HTTPException(422, 'Uptime Kuma 需填写完整公开页面地址，例如 https://status.example.com/status/api')
    root = parsed._replace(path=match[1], params='', query='', fragment='').geturl().rstrip('/')
    return root + '/api/status-page/' + match[2], root + '/api/status-page/heartbeat/' + match[2]


def channels(client, cfg):
    adapter, page = cfg.get('statusAdapter', ADAPTERS[0]), cfg.get('statusPageUrl', '')
    if adapter == ARUHUB_ADAPTER: return aruhub_channels(client, cfg)
    if adapter == FLUXLANE_ADAPTER: return fluxlane_channels(client, cfg)
    if adapter == '兔子API 模型性能': return tuzi_channels(client, cfg)
    if adapter == 'Better Stack 状态页': return betterstack_channels(client, cfg)
    if adapter in STATUS_ADAPTERS: return public_channels(client, cfg)
    output = []
    if adapter == ADAPTERS[0]:
        data = success(client.get(cfg['sourceBaseUrl'] + '/api/uptime/status'))
        if not isinstance(data, list): raise ValueError('New API 公开监测格式异常')
        for group in data:
            for monitor in group.get('monitors', []):
                # New API's proxy omits heartbeat timestamps, and some versions choose
                # the oldest heartbeat. It cannot establish current channel health.
                reported = {0: '异常', 1: '正常', 2: '等待中', 3: '维护中'}.get(monitor.get('status'), '未知')
                output.append({'name': plain(monitor.get('name', ''), 180), 'group': plain(group.get('categoryName', ''), 180),
                               'status': '未核验', 'reportedStatus': reported, 'note': '来源未提供心跳时间', 'heartbeatAt': ''})
        source_url = cfg['sourceBaseUrl'] + '/api/uptime/status'
    elif adapter == 'Uptime Kuma':
        config_url, heartbeat_url = kuma_paths(page)
        config, heartbeats = client.get(config_url), client.get(heartbeat_url)
        groups, beats = config.get('publicGroupList'), heartbeats.get('heartbeatList')
        if not isinstance(groups, list) or not isinstance(beats, dict): raise ValueError('Uptime Kuma 公开数据格式异常')
        current = now().replace(tzinfo=timezone.utc)
        for group in groups:
            for monitor in group.get('monitorList', []):
                samples = [(stamp(b.get('time')), b) for b in beats.get(str(monitor.get('id')), []) if isinstance(b, dict)]
                samples = [(t, b) for t, b in samples if t]
                latest, beat = max(samples, key=lambda b: b[0]) if samples else (None, {})
                fresh = latest is not None and -60 <= (current - latest).total_seconds() <= 900
                state = {0: '异常', 1: '正常', 2: '等待中', 3: '维护中'}.get(beat.get('status'), '未核验') if fresh else '未核验'
                ratio = heartbeats.get('uptimeList', {}).get(str(monitor.get('id')) + '_24')
                output.append({'id': 'kuma:' + str(monitor.get('id')), 'name': plain(monitor.get('name', ''), 180), 'group': plain(group.get('name', ''), 180),
                               'status': state, 'heartbeatAt': latest.isoformat() if latest else '',
                               'history': [p for t, b in samples if (p := observation(t.isoformat(), {0: '异常', 1: '正常', 2: '等待中', 3: '维护中'}.get(b.get('status'), '未知')))],
                               'uptime24h': round(ratio * 100, 3) if type(ratio) in [int, float] and 0 <= ratio <= 1 else None,
                               'note': '' if fresh else '心跳缺失或超过 15 分钟'})
        source_url = page
    else:
        root = page.rstrip('/')
        data = client.get(root + '/api/v2/summary.json')
        values = data.get('components')
        if not isinstance(values, list): raise ValueError('Statuspage 组件格式异常')
        states = {'operational': '正常', 'degraded_performance': '性能下降', 'partial_outage': '部分故障',
                  'major_outage': '异常', 'under_maintenance': '维护中'}
        for component in values:
            if component.get('group'): continue
            output.append({'name': plain(component.get('name', ''), 180), 'group': '', 'heartbeatAt': '',
                           'status': states.get(component.get('status'), '未核验'), 'note': '状态页公开组件'})
        source_url = root
    if len(output) > 200: raise ValueError('渠道数量超过安全上限，请缩小公开监测范围')
    from .station_source_adapters import expiry
    return {'sourceType': adapter, 'sourceUrl': source_url, 'channels': output, 'collectedAt': now().isoformat(), 'expiresAt': expiry(cfg)}


def validate_task(db, data, row=None):
    station = db.get(Record, data.get('station'))
    if not station or station.module != 'stations': raise HTTPException(422, '请选择有效中转站')
    if not isinstance(data.get('datasets'), list) or not data['datasets'] or set(data['datasets']) - set(DATASETS):
        raise HTTPException(422, '请选择站点公告、渠道状态或模型与报价')
    if '模型与报价' in data['datasets']:
        from .station_pricing import validate_pricing
        validate_pricing(data)
    base = (data.get('sourceBaseUrl') or station.data.get('domain', '')).rstrip('/')
    validate_target(base)
    data['sourceBaseUrl'] = base
    if data.get('sourceAdapter', 'New API 公开接口') not in ['New API 公开接口', 'Sub2API', 'Foxcode', *NOTICE_ADAPTERS]:
        raise HTTPException(422, '不支持该公告采集接口')
    if '渠道状态' in data['datasets']:
        adapter = data.get('statusAdapter', ADAPTERS[0])
        if adapter not in ADAPTERS: raise HTTPException(422, '不支持该状态来源')
        if adapter in ['Uptime Kuma', 'Statuspage', 'OnlineOrNot', 'Better Stack 状态页']:
            validate_target(data.get('statusPageUrl') or '')
            if adapter == 'Uptime Kuma': kuma_paths(data['statusPageUrl'])
            elif adapter != 'Better Stack 状态页' and urlparse(data['statusPageUrl']).path not in ['', '/']: raise HTTPException(422, '请填写公开状态站根地址')
    if data.get('connection', '直连') not in ['直连', '配置的采集代理']: raise HTTPException(422, '采集连接方式无效')
    if data.get('connection') == '配置的采集代理':
        from .config import settings
        if not settings().station_source_proxy_url: raise HTTPException(422, '服务器尚未配置采集代理')
    if needs_account(data): account_binding(db, data)
    schedule = data.get('schedule', '仅手动')
    if schedule not in ['仅手动', '间隔执行', '每日定时']: raise HTTPException(422, '不支持的采集周期')
    try: interval = float(data.get('interval') or 30)
    except (ValueError, TypeError): raise HTTPException(422, '采集间隔需为 15–10080 分钟的整数')
    if not interval.is_integer() or not 15 <= interval <= 10080: raise HTTPException(422, '采集间隔需为 15–10080 分钟的整数')
    if schedule == '每日定时' and not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', data.get('dailyTime', '')):
        raise HTTPException(422, '请选择每日更新时间')
    if data.get('noticePolicy', '先保存草稿') not in ['先保存草稿', '自动发布']:
        raise HTTPException(422, '公告发布策略无效')
    if row and db.scalar(select(Record.id).where(Record.module == 'station-sync-runs', Record.data['taskId'].as_string() == row.id, Record.status.in_(['排队中', '采集中']))):
        raise HTTPException(409, '站点采集中，请完成后再编辑')
    data.update(interval=int(interval), timezone='Asia/Shanghai')
    data['_nextRun'] = next_run(data) if data.get('status') == '启用' else None


def authorize_sync(db, user, cfg):
    # Running this task writes related records; the task permission alone is insufficient.
    from .admin_service import get_entity
    from .catalog import MODULES
    from .security import check_permission
    if not user or not user.enabled: raise HTTPException(403, '采集配置所属用户不可用')
    check_permission(db, user, MODULES['station-sync-tasks'], 'run')
    get_entity(db, user, MODULES['stations'], cfg['station'], 'edit')
    if needs_account(cfg):
        account = account_binding(db, cfg)
        get_entity(db, user, MODULES['station-source-accounts'], account.id, 'edit')
    if '站点公告' in cfg['datasets']:
        for action in ['create', 'edit']:
            role = check_permission(db, user, MODULES['station-notices'], action)
            # Imported notices can be shared with other editors; own-only editors
            # cannot safely update source records owned by somebody else.
            if role.scope == 'own': raise HTTPException(403, '自动公告同步需要全部数据范围')


def queue_sync(db, task, actor=None):
    if task.status != '启用': raise HTTPException(409, '请先启用采集配置')
    actor = actor or db.get(User, task.owner_id)
    authorize_sync(db, actor, task.data)
    if db.scalar(select(Record.id).where(Record.module == 'station-sync-runs', Record.slug == task.data['station'])):
        raise HTTPException(409, '该站点已有采集任务排队或运行')
    job = Record(module='station-sync-runs', slug=task.data['station'], owner_id=actor.id, name=task.name,
                 status='排队中', data={'taskId': task.id, 'station': task.data['station'], '_config': dict(task.data)})
    try:
        with db.begin_nested():
            db.add(job)
            db.flush()
    except IntegrityError:
        raise HTTPException(409, '该站点已有采集任务排队或运行')
    return job


def import_notices(db, station, rows, cfg):
    changed = 0
    for item in rows:
        identity = hashlib.sha256((station.id + ':' + cfg['sourceBaseUrl'] + ':' + item['identity']).encode()).hexdigest()
        record = db.scalar(select(Record).where(Record.module == 'station-notices', Record.slug == identity))
        if not record:
            record = Record(module='station-notices', slug=identity, name=item['name'], status='草稿', data={})
            db.add(record)
            db.flush()
        old = record.data
        if old.get('_sourceDeleted'): continue
        manual = old.get('_manualFields', [])
        published = stamp(item.get('publishedAt', ''))
        values = {'name': item['name'], 'stationId': station.id, 'body': item['body'], 'type': '服务通知', 'pinned': '否',
                  'start': published.date().isoformat() if published else now().date().isoformat(), 'end': '',
                  'sourceUrl': item['sourceUrl'], 'sourcePublishedAt': item.get('publishedAt', ''), 'collectedAt': now().isoformat(),
                  '_stationSync': True, '_manualFields': manual}
        for key in manual:
            if key in old: values[key] = old[key]
        target = old.get('status', record.status) if 'status' in manual else ('已发布' if cfg.get('noticePolicy') == '自动发布' else record.status)
        content_changed = any(old.get(k) != values[k] for k in ['name', 'body', 'sourceUrl']) or record.status != target
        record.name, record.status = values['name'], target
        record.data = {**values, 'status': target}
        record.version = (record.version or 0) + 1
        if content_changed:
            sync_record(db, record)
            changed += 1
    return changed


def error_text(exc):
    return str(exc)[:240] if isinstance(exc, ValueError) else safe_error(exc)


def process_sync(job_id, client=None):
    with SessionLocal() as db:
        job = db.get(Record, job_id)
        if not job or job.status != '采集中': return
        cfg = dict(job.data['_config'])
        task = db.get(Record, job.data['taskId'])
        if not task or task.status != '启用':
            job.status, job.slug = '已取消', None
            job.data = {'taskId': job.data['taskId'], 'station': cfg['station'], 'errors': {'配置': '采集配置已停用或删除'}}
            db.commit()
            return
        authorize_sync(db, db.get(User, job.owner_id), cfg)
        if cfg.get('statusAdapter') == '兔子API 模型性能':
            station = db.get(Record, cfg['station'])
            pricing = db.scalar(select(Record).where(Record.module == 'source-pricing', Record.slug == station.slug))
            cfg['_monitorModelIds'] = list(dict.fromkeys(str(r['cells'][0]) for r in (pricing.data.get('rows', []) if pricing else []) if r.get('cells')))[:250]
    client = client or PublicSource(cfg.get('connection', '直连'))
    remote = None
    if needs_account(cfg):
        from .station_source_auth import account_client
        remote = account_client(cfg['sourceAccount'])
    fetched, errors = {}, {}
    for dataset in cfg['datasets']:
        try:
            if dataset == '站点公告' and cfg.get('sourceAdapter') in ['Sub2API', 'Foxcode']:
                from .station_source_adapters import notice_rows
                fetched[dataset] = notice_rows(remote, cfg)
            elif dataset == '渠道状态' and cfg.get('statusAdapter', '').startswith('Sub2API '):
                from .station_source_adapters import channel_rows
                fetched[dataset] = channel_rows(remote, cfg)
            elif dataset == '站点公告' and cfg.get('sourceAdapter') in NOTICE_ADAPTERS:
                fetched[dataset] = public_notices(client, cfg)
            elif dataset == '模型与报价':
                from .station_pricing import fetch_pricing
                fetched[dataset] = fetch_pricing(client, cfg)
            else:
                fetched[dataset] = announcements(client, cfg['sourceBaseUrl']) if dataset == '站点公告' else channels(client, cfg)
        except (httpx.HTTPError, HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
            errors[dataset] = error_text(exc)
    with SessionLocal() as db:
        job = db.get(Record, job_id)
        if not job or job.status != '采集中': return
        authorize_sync(db, db.get(User, job.owner_id), cfg)
        task = db.get(Record, job.data['taskId'])
        if not task or task.status != '启用':
            job.status, job.slug = '已取消', None
            job.data = {'taskId': job.data['taskId'], 'station': cfg['station'], 'errors': {'配置': '采集配置已停用或删除'}}
            db.commit()
            return
        station = db.scalar(select(Record).where(Record.id == cfg['station'], Record.module == 'stations').with_for_update())
        if not station:
            fetched, errors = {}, {'配置': '中转站已移除'}
        count, warnings = 0, []
        if '站点公告' in fetched:
            rows, warnings = fetched['站点公告']
            count = import_notices(db, station, rows, cfg)
        if '渠道状态' in fetched:
            station.data = {**station.data, '_channelSnapshot': merge_snapshot(station.data.get('_channelSnapshot'), fetched['渠道状态'])}
            warnings += fetched['渠道状态'].get('historyWarnings', [])
            sync_record(db, station)
        pricing_changes = {}
        if '模型与报价' in fetched:
            from .station_pricing import persist_pricing
            pricing_changes = persist_pricing(db, station, fetched['模型与报价'], task)
            warnings += fetched['模型与报价'].get('warnings', [])
            sync_record(db, station)
        state = '部分成功' if (errors or warnings) and fetched else '失败' if errors else '已完成'
        job.status, job.slug = state, None
        job.data = {'taskId': job.data['taskId'], 'station': cfg['station'], 'noticeCount': count,
                    'channelCount': len(fetched.get('渠道状态', {}).get('channels', [])),
                    'modelCount': fetched.get('模型与报价', {}).get('modelCount', 0),
                    'quoteCount': len(fetched.get('模型与报价', {}).get('rows', [])), 'pricingChanges': pricing_changes,
                    'warnings': warnings, 'errors': errors, 'finishedAt': now().isoformat()}
        task = db.get(Record, job.data['taskId'])
        if task: task.data = {**task.data, 'lastResult': state, 'lastRun': now().isoformat(), 'lastErrors': errors, 'lastWarnings': warnings}
        if fetched:
            enqueue_invalidation(db, 'station-notices')
        db.commit()


def station_tick():
    with SessionLocal() as db:
        for stale in db.scalars(select(Record).where(Record.module == 'station-sync-runs', Record.status == '采集中', Record.updated_at < now() - timedelta(minutes=10))):
            stale.status, stale.slug = '失败', None
            stale.data = {k: v for k, v in stale.data.items() if k != '_config'} | {'errors': {'执行': '采集进程失联，上次资料保留'}}
        for task in db.scalars(select(Record).where(Record.module == 'station-sync-tasks', Record.status == '启用').with_for_update(skip_locked=True)):
            due = task.data.get('_nextRun')
            if due and due <= now().isoformat():
                try: queue_sync(db, task)
                except HTTPException as exc:
                    task.data = {**task.data, '_nextRun': next_run(task.data), 'lastResult': '未执行', 'lastErrors': {'配置': safe_error(exc)}}
                    continue
                task.data = {**task.data, '_nextRun': next_run(task.data)}
        db.commit()
        job = db.scalar(select(Record).where(Record.module == 'station-sync-runs', Record.status == '排队中').order_by(Record.created_at).with_for_update(skip_locked=True).limit(1))
        if not job: return False
        jid = job.id
        claimed = db.execute(update(Record).where(Record.id == jid, Record.status == '排队中').values(status='采集中'))
        db.commit()
        if claimed.rowcount != 1: return False
    try:
        process_sync(jid)
    except Exception as exc:
        with SessionLocal() as db:
            job = db.get(Record, jid)
            if not job: return True
            job.status, job.slug = '失败', None
            job.data = {'taskId': job.data['taskId'], 'station': job.data['station'], 'errors': {'执行': safe_error(exc) if isinstance(exc, HTTPException) else '采集异常，上次资料保留'}, 'finishedAt': now().isoformat()}
            task = db.get(Record, job.data['taskId'])
            if task: task.data = {**task.data, 'lastResult': '失败', 'lastRun': now().isoformat(), 'lastErrors': job.data['errors']}
            db.commit()
    return True


def public_snapshot(station):
    snapshot = station.data.get('_channelSnapshot')
    if not snapshot: return None
    expired = snapshot.get('expiresAt', '') < now().isoformat()
    def public_channel(original):
        row = dict(original)
        beat = stamp(row.get('heartbeatAt'))
        max_age = snapshot.get('heartbeatMaxAgeSeconds', 900 if snapshot['sourceType'] == 'Uptime Kuma' else None)
        stale_beat = max_age is not None and (not beat or not -60 <= (now().replace(tzinfo=timezone.utc) - beat).total_seconds() <= max_age)
        if expired or stale_beat:
            row.update(status='未核验', note='采集结果已过期' if expired else '心跳缺失或超过 15 分钟')
        elif max_age is not None and row.get('reportedStatus') not in [None, '', '未知']:
            row['status'] = row['reportedStatus']
        return row
    return {**snapshot, 'stale': expired,
            'channels': [public_channel(row) for row in snapshot['channels']],
            'modelChannels': [public_channel(row) for row in snapshot.get('modelChannels', [])]}
