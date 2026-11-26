"""Site-specific public metadata. No account/admin data or remote code execution."""
import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
from xml.etree import ElementTree

from bs4 import BeautifulSoup

from .channel_history import observation
from .models import now

NOTICE_ADAPTERS = ['RightCode', 'PackyCode 公告', '犀速 AI 公告页', 'OnlineOrNot', '302.AI']
STATUS_ADAPTERS = ['RightCode 模型可用性', 'OnlineOrNot']


def epoch(value):
    try:
        if type(value) not in [int, float] or not 0 < value < 32503680000: return ''
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError): return ''


def notice(identity, title, body, source, published=''):
    from .station_sources import plain
    body = plain(body)
    if not body: return None
    title = plain(title or body.splitlines()[0])[:80]
    return {'identity': str(identity), 'name': title, 'body': body, 'sourceUrl': source, 'publishedAt': published}


def public_notices(client, cfg):
    adapter, base = cfg['sourceAdapter'], cfg['sourceBaseUrl']
    output = []
    if adapter == 'RightCode':
        raw = client.get(base + '/configs').get('public.notice')
        if not isinstance(raw, str): raise ValueError('RightCode 公告配置格式已变化')
        data = json.loads(raw) if raw else {}
        # These are roles in a publicly exposed config, not administrator APIs.
        for audience, items in data.items():
            if not isinstance(items, list) or len(items) > 500: raise ValueError('RightCode 公告列表格式无效')
            for item in items:
                if not isinstance(item, dict) or not item.get('id'): raise ValueError('公告缺少来源标识')
                output.append(notice('right:' + str(item['id']), '', item.get('description') or '', base + '/configs', epoch(item.get('created_time'))))
    elif adapter == 'PackyCode 公告':
        from .station_sources import success
        items = success(client.get(base + '/api/announcements'))
        if not isinstance(items, list) or len(items) > 500: raise ValueError('PackyCode 公告列表格式无效')
        for item in items:
            if not isinstance(item, dict) or not item.get('id'): raise ValueError('公告缺少来源标识')
            output.append(notice('packy:' + str(item['id']), item.get('title'), item.get('content') or '', base + '/api/announcements', str(item.get('publishDate') or '')))
    elif adapter == '犀速 AI 公告页':
        url = base + '/resources/announcements'
        soup = BeautifulSoup(client.text(url), 'html.parser')
        if not soup.find('link', rel='canonical') or not soup.select('h1'): raise ValueError('犀速公告页结构无效或遇到访问验证')
        articles = soup.select('article[id^="notice-"]')
        if len(articles) > 500: raise ValueError('公告数量超过限制')
        if not articles and not any(t in soup.get_text() for t in ['暂无公告', '官方公告']): raise ValueError('未找到公告列表')
        for article in articles:
            title, body = article.find('h2'), article.select_one('.whitespace-pre-line')
            if not title or not body: raise ValueError('犀速公告正文结构已变化')
            parts = article.find('div').find_all('p', recursive=False)
            published = ''
            if len(parts) == 2:
                day, month = [p.get_text(strip=True) for p in parts]
                if re.fullmatch(r'\d{2}', day) and re.fullmatch(r'\d{4}-\d{2}', month): published = month + '-' + day
            output.append(notice('xisu:' + article['id'], title.get_text(), str(body), url + '#' + article['id'], published))
    elif adapter == 'OnlineOrNot':
        url = base + '/incidents.rss'
        raw = client.text(url)
        if re.search(r'<!\s*(?:DOCTYPE|ENTITY)', raw, re.I): raise ValueError('状态页 RSS 含不支持的 XML 声明')
        try: feed = ElementTree.fromstring(raw)
        except ElementTree.ParseError: raise ValueError('状态页 RSS XML 无效')
        if feed.tag != 'rss': raise ValueError('状态页 RSS 格式已变化')
        for item in feed.findall('./channel/item')[:500]:
            link = item.findtext('link') or url
            if urlparse(link).netloc != urlparse(base).netloc: link = url
            date = item.findtext('pubDate') or ''
            try: date = parsedate_to_datetime(date).astimezone(timezone.utc).isoformat()
            except (ValueError, TypeError): date = ''
            identity = item.findtext('guid') or link
            output.append(notice('incident:' + identity, item.findtext('title'), item.findtext('description') or '', link, date))
    elif adapter == '302.AI':
        data = client.get(base + '/proxy/announcements')
        if data.get('code') != 0: raise ValueError('302.AI 公告接口未确认成功')
        item = data.get('data')
        if item:
            if not isinstance(item, dict) or not item.get('id'): raise ValueError('302.AI 公告格式无效')
            output.append(notice('302:' + str(item['id']), item.get('title'), item.get('content') or '', base + '/proxy/announcements', epoch(item.get('modified_on'))))
    else: raise ValueError('不支持该公开公告来源')
    unique = {}
    for item in output:
        if item: unique.setdefault(item['identity'], item)
    return list(unique.values()), []


def snapshot(cfg, rows, models=None):
    from .station_source_adapters import expiry
    return {'sourceType': cfg['statusAdapter'], 'sourceUrl': cfg.get('statusPageUrl') or cfg['sourceBaseUrl'],
            'channels': rows, 'modelChannels': models or [], 'collectedAt': now().isoformat(), 'expiresAt': expiry(cfg)}


def public_channels(client, cfg):
    if cfg['statusAdapter'] == 'RightCode 模型可用性': return right_channels(client, cfg)
    base = cfg.get('statusPageUrl') or cfg['sourceBaseUrl']
    raw = client.text(base)
    # Read the literal public component records only; never eval SSR scripts.
    match = re.search(r'components:\$R\[\d+\]=\[(.*?)\]\}', raw, re.S)
    if not match: raise ValueError('OnlineOrNot 公开组件结构已变化')
    quoted = r'("(?:\\.|[^"\\])*")'
    values = re.findall(r'\{id:' + quoted + r',name:' + quoted + r',status:' + quoted, match[1])
    if not values or len(values) > 200: raise ValueError('OnlineOrNot 公开组件数量无效')
    states = {'OPERATIONAL': '正常', 'DEGRADED_PERFORMANCE': '性能下降', 'PARTIAL_OUTAGE': '部分故障',
              'MAJOR_OUTAGE': '异常', 'UNDER_MAINTENANCE': '维护中'}
    rows = []
    for identity, name, status in values:
        state = states.get(json.loads(status), '未知')
        rows.append({'id': 'onlineornot:' + json.loads(identity), 'name': json.loads(name), 'group': '公开组件',
                     'status': state, 'reportedStatus': state, 'heartbeatAt': '',
                     'note': '公开状态页快照，来源未提供心跳时间'})
    return snapshot(cfg, rows)


def right_channels(client, cfg):
    from .station_source_adapters import number
    from .station_sources import plain, stamp
    base = cfg['sourceBaseUrl']
    data, upstreams = client.get(base + '/models/availability/all'), client.get(base + '/upstreams/public')
    items, meta = data.get('upstreams'), upstreams.get('upstreams')
    if not isinstance(items, list) or len(items) > 200 or not isinstance(meta, list): raise ValueError('RightCode 可用性格式已变化')
    names = {item['id']: plain(str(item.get('name') or item.get('prefix') or item['id']), 180) for item in meta}
    groups, models = [], []
    ranks = {'未知': 0, '正常': 1, '性能下降': 2, '异常': 3}
    for upstream in items:
        identity = upstream.get('upstream_id')
        group = names.get(identity) or plain(str(upstream.get('upstream_prefix') or identity), 180)
        collected = {}
        for window in ['24h', '7d', '30d']:
            entries = upstream.get('windows', {}).get(window, [])
            if not isinstance(entries, list) or len(entries) > 500: raise ValueError('RightCode 模型数量无效')
            for entry in entries:
                model = plain(str(entry.get('model') or ''), 180)
                if not model: continue
                row = collected.setdefault(model, {'id': f'right:{identity}:{model}', 'name': group, 'group': group, 'modelIds': [model], 'windows': {}})
                points, latest = [], None
                for value in entry.get('points', [])[:1000]:
                    availability = number(value.get('availability'), high=100)
                    valid = value.get('no_sample') is False and availability is not None
                    state = ('正常' if availability == 100 else '异常' if availability == 0 else '性能下降') if valid else '未知'
                    start, end = epoch(value.get('start_at')), epoch(value.get('end_at'))
                    if not start or not end: continue
                    seconds = (stamp(end) - stamp(start)).total_seconds()
                    if not 0 < seconds <= 86400 * 2: continue
                    point = observation(start, state, seconds=seconds)
                    if point: points.append(point)
                    if valid and (latest is None or end > latest['at']): latest = {'at': end, 'value': availability, 'status': state}
                row['windows'][window] = {'history': points, 'latestAvailability': latest['value'] if latest else None,
                                           'heartbeatAt': latest['at'] if latest else ''}
                if window == '24h':
                    at = stamp(latest['at']) if latest else None
                    fresh = at is not None and -60 <= (now().replace(tzinfo=timezone.utc) - at).total_seconds() <= 900
                    row.update(heartbeatAt=latest['at'] if latest else '', reportedStatus=latest['status'] if latest else '未知',
                               status=latest['status'] if fresh else '未核验', note='来源模型可用性；百分比为最近有效时段')
        group_row = {'id': 'right-group:' + str(identity), 'name': group, 'group': group, 'modelIds': [], 'windows': {},
                     'status': '未核验', 'heartbeatAt': '', 'note': '按模型采样汇总，同一时段取最差已知状态'}
        group_row['heartbeatAt'] = max((r.get('heartbeatAt', '') for r in collected.values()), default='')
        for window in ['24h', '7d', '30d']:
            points = {}
            for row in collected.values():
                for point in row['windows'].get(window, {}).get('history', []):
                    old = points.get(point['at'])
                    if not old or ranks[point['status']] > ranks[old['status']]: points[point['at']] = point
            group_row['windows'][window] = {'history': sorted(points.values(), key=lambda p: p['at'])}
        groups.append(group_row)
        models.extend(collected.values())
    if len(models) > 1000: raise ValueError('RightCode 模型监控数量超过限制')
    result = snapshot(cfg, groups, models)
    result['sourceUrl'] = base + '/models/availability/all'
    result['heartbeatMaxAgeSeconds'] = 900
    return result
