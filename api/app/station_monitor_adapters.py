"""Source-specific read-only monitor data, with exact model/group associations."""
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

from .channel_history import observation
from .models import now

ADAPTERS = ['兔子API 模型性能', 'Better Stack 状态页']


def aggregate_groups(models):
    """Worst known sampled model state per bucket, never an invented group rate."""
    groups = {}
    ranks = {'未知': 0, '正常': 1, '性能下降': 2, '异常': 3}
    for row in models:
        group = groups.setdefault(row['group'], {'id': 'tuzi-group:' + row['group'],
            'name': row['group'], 'group': row['group'], 'modelIds': [], 'history': [],
            'status': '未核验', 'heartbeatAt': '',
            'note': '按本站展示型号的来源采样汇总，同一时段取最差已知状态；不是全部渠道的成功率'})
        group['heartbeatAt'] = max(group['heartbeatAt'], row.get('heartbeatAt', ''))
        group['history'] += row['windows']['24h']['history']
    for group in groups.values():
        points = {}
        for point in group['history']:
            previous = points.get(point['at'])
            if not previous or ranks[point['status']] > ranks[previous['status']]: points[point['at']] = point
        group['history'] = [points[t] for t in sorted(points)]
    return list(groups.values())


def tuzi_channels(client, cfg):
    from .station_public_adapters import epoch, snapshot
    from .station_source_adapters import number
    from .station_sources import plain, stamp, success
    models = cfg.get('_monitorModelIds', [])
    if not models: raise ValueError('请先同步该站的模型报价，以确定需要监测的准确型号')
    pricing = success(client.get(cfg['sourceBaseUrl'] + '/api/pricing'))
    if not isinstance(pricing, list) or len(pricing) > 2000: raise ValueError('兔子公开型号目录无效')
    supported = {row.get('model_name') for row in pricing if isinstance(row, dict)}
    missing = [model for model in models if model not in supported]
    models = [model for model in models if model in supported]
    output, warnings, received = [], (['本站报价中有 ' + str(len(missing)) + ' 款型号已不在来源最新目录，未赋予状态'] if missing else []), 0
    for model in models:
        url = cfg['sourceBaseUrl'] + '/api/perf-metrics?' + urlencode({'model': model, 'hours': 24, 'resolution': 'hour'})
        try:
            data = success(client.get(url))
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404: raise
            # Source returns 404 for untracked model IDs, not a healthy result.
            warnings.append('未提供该型号监测：' + model)
            continue
        if not isinstance(data, dict) or data.get('model_name') != model: raise ValueError('兔子模型监测响应型号不匹配')
        groups = data.get('groups')
        if not isinstance(groups, list) or len(groups) > 100: raise ValueError('兔子模型分组格式无效')
        received += 1
        for item in groups:
            group = plain(str(item.get('group') or ''), 180)
            if not group: raise ValueError('兔子模型监测缺少分组标识')
            points = []
            values = item.get('hourly_series', [])
            if not isinstance(values, list) or len(values) > 48: raise ValueError('兔子小时监测数量无效')
            for value in values:
                at, rate = epoch(value.get('ts')), number(value.get('success_rate'), high=100)
                state = ('正常' if rate == 100 else '异常' if rate == 0 else '性能下降') if value.get('has_samples') is True and rate is not None else '未知'
                # The source gives actual hourly buckets. Future portion of the
                # current bucket is not represented as an observed duration.
                instant = stamp(at)
                seconds = min(3600, max(0, (now().replace(tzinfo=timezone.utc) - instant).total_seconds())) if instant else 0
                point = observation(at, state, seconds=seconds) if seconds else None
                if point: points.append(point)
            rate = number(item.get('success_rate'), high=100) if item.get('has_samples') is True else None
            at = epoch(item.get('latest_sample_ts')) if item.get('has_samples') is True else ''
            reported = ('正常' if rate == 100 else '异常' if rate == 0 else '性能下降') if rate is not None else '未知'
            fresh = bool(at) and -60 <= (now().replace(tzinfo=timezone.utc) - stamp(at)).total_seconds() <= 900
            output.append({'id': 'tuzi:' + model + ':' + group, 'name': group, 'group': group, 'modelIds': [model],
                'status': reported if fresh else '未核验', 'reportedStatus': reported, 'heartbeatAt': at,
                'windows': {'24h': {'history': points, 'successRate': rate}},
                'note': '来源近24小时成功率及真实小时统计；仅对应此型号与分组，无样本时段保留未知'})
    if not received: raise ValueError('本站展示型号均未获得来源监测，保留上次资料')
    result = snapshot(cfg, aggregate_groups(output), output)
    result['sourceUrl'] = cfg['sourceBaseUrl'] + '/pricing/status'
    result['historyWarnings'] = warnings
    result['heartbeatMaxAgeSeconds'] = 900
    result['historyCoverage'] = '24h'
    return result


def betterstack_channels(client, cfg):
    from .station_public_adapters import snapshot
    base = cfg['statusPageUrl']
    soup = BeautifulSoup(client.text(base), 'html.parser')
    if not soup.select('.section[id] .tick[data-tooltip-interval]'): raise ValueError('Better Stack 状态页结构无效或没有公开日历史')
    states = {'operational': '正常', 'degraded': '性能下降', 'downtime': '异常',
              'unavailable': '异常', 'maintenance': '维护中', 'unknown': '未知'}
    rows, seen = [], set()
    for tick in soup.select('.section[id] .tick[data-tooltip-interval]'):
        card = tick.parent.parent
        if id(card) in seen: continue
        seen.add(id(card))
        icon = card.select_one('svg[aria-label]')
        name = icon.find_next_sibling('div') if icon else None
        if name is None: raise ValueError('Better Stack 监测名称结构已变化')
        name = name.get_text(' ', strip=True)
        points = []
        for day in card.select('.tick[data-tooltip-interval]'):
            try: instant = datetime.strptime(day['data-tooltip-interval'], '%b %d, %Y').replace(tzinfo=timezone.utc)
            except ValueError: raise ValueError('Better Stack 日历史日期格式已变化')
            state = states.get(day.get('data-html-tooltip-template', '').removeprefix('tick-tooltip-'), '未知')
            seconds = min(86400, max(0, (now().replace(tzinfo=timezone.utc) - instant).total_seconds()))
            point = observation(instant.isoformat(), state, seconds=seconds) if seconds else None
            if point: points.append(point)
        reported = states.get(icon.get('aria-label', '').lower(), '未知')
        rows.append({'id': 'betterstack:' + hashlib.sha256(name.encode()).hexdigest()[:20], 'name': name,
            'group': '公开服务组件', 'status': reported, 'reportedStatus': reported, 'heartbeatAt': '', 'history': points,
            'note': '官网公开服务组件，不代表具体模型渠道；来源按日聚合，按公开日期的 UTC 日绘制，无实时心跳'})
    if len(rows) > 200: raise ValueError('Better Stack 公开组件超过数量限制')
    return snapshot(cfg, rows)
