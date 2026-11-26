"""Public monitoring fields from authorized Sub2API user endpoints."""
import httpx
from datetime import timezone
from fastapi import HTTPException

from .channel_history import STATES, observation
from .models import now


def aggregate_window(item, coverage):
    from .station_source_adapters import number
    metrics, health = item.get('metrics') or {}, item.get('health') or {}
    state = STATES.get(health.get('overall'), '未知')
    success = number(metrics.get('success_rate'), high=1)
    if state == '未知' and not metrics.get('request_count') and success == 0:
        success = None
    points = []
    seconds = number(coverage.get('bucket_seconds'), low=1, high=86400)
    for bucket in item.get('buckets', [])[:1000]:
        point = observation(bucket.get('bucket_start'), (bucket.get('health') or {}).get('overall'), seconds=seconds)
        if point: points.append(point)
    return {'history': points, 'successRate': round(success * 100, 2) if success is not None else None,
            'reportedStatus': state, 'heartbeatAt': str(coverage.get('data_through') or ''),
            'ttftP50Ms': number((metrics.get('ttft') or {}).get('p50_ms'))}


def aggregate_rows(data):
    from .station_sources import plain
    items = data.get('items') if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) > 500:
        raise ValueError('渠道监控列表格式无效或数量超过上限')
    coverage = data.get('coverage') or {}
    output = []
    for item in items:
        if not isinstance(item, dict): raise ValueError('渠道监控项格式无效')
        platform = plain(str(item.get('platform') or ''), 180)
        group = plain(str(item.get('group_name') or platform or '未命名渠道'), 180)
        model = plain(str(item.get('model') or ''), 180)
        key = f"v2:{platform}:{item.get('group_id', group)}:{model}"
        output.append({'id': key, 'name': group, 'group': group, 'platform': platform,
                       'modelIds': [model] if model else [], 'window': aggregate_window(item, coverage)})
    return output


def channel_rows(remote, cfg):
    from .station_source_adapters import expiry, number
    from .station_sources import plain, stamp
    adapter = cfg['statusAdapter']
    warnings = []
    if adapter == 'Sub2API 聚合监控':
        windows = {}
        for window in ['24h', '7d', '30d']:
            try:
                data = remote.get('/api/v1/channel-monitor-v2/matrix?range=' + window + '&group_by=platform_group')
                for item in aggregate_rows(data):
                    row = windows.setdefault(item['id'], {k: v for k, v in item.items() if k != 'window'})
                    row.setdefault('windows', {})[window] = item['window']
            except (HTTPException, httpx.HTTPError, ValueError):
                if window == '24h': raise
                warnings.append(window + '历史暂不可用')
        output, model_channels = list(windows.values()), []
        # Model matrices for longer ranges can exceed the existing 3 MB cap.
        # Keep the exact model/group matrix separate from group-wide metrics.
        try:
            data = remote.get('/api/v1/channel-monitor-v2/matrix?range=24h&group_by=platform_group_model')
            for item in aggregate_rows(data):
                row = {k: v for k, v in item.items() if k != 'window'}
                row['windows'] = {'24h': item['window']}
                model_channels.append(row)
        except (HTTPException, httpx.HTTPError, ValueError):
            warnings.append('模型级监控暂不可用')
        for row in output + model_channels:
            latest = row['windows'].get('24h') or next(iter(row['windows'].values()))
            row.update(heartbeatAt=latest['heartbeatAt'], reportedStatus=latest['reportedStatus'],
                       status=latest['reportedStatus'], note='站方聚合监控')
    else:
        data = remote.get('/api/v1/channel-monitors')
        items = data.get('items') if isinstance(data, dict) else None
        if not isinstance(items, list) or len(items) > 200: raise ValueError('渠道监控列表格式无效或数量超过上限')
        output, model_channels = [], []
        for item in items:
            if not isinstance(item, dict): raise ValueError('渠道监控项格式无效')
            points = [p for t in item.get('timeline', [])[:2000] if isinstance(t, dict)
                      if (p := observation(t.get('checked_at'), t.get('status'), latencyMs=number(t.get('latency_ms'))))]
            at = max((p['at'] for p in points), default='')
            model = plain(str(item.get('primary_model') or ''), 180)
            group = plain(str(item.get('name') or '未命名渠道'), 180)
            output.append({'id': 'legacy:' + str(item.get('id', group)), 'name': group, 'group': group,
                           'platform': plain(str(item.get('provider') or ''), 180), 'modelIds': [model] if model else [],
                           'reportedStatus': STATES.get(item.get('primary_status'), '未知'), 'heartbeatAt': at,
                           'latencyMs': number(item.get('primary_latency_ms')), 'uptime7d': number(item.get('availability_7d'), high=100),
                           'history': sorted(points, key=lambda p: p['at']), 'note': '站方监控'})
    for row in output + model_channels:
        at = stamp(row.get('heartbeatAt'))
        fresh = at is not None and -60 <= now().replace(tzinfo=timezone.utc).timestamp() - at.timestamp() <= 900
        row['status'] = row['reportedStatus'] if fresh and row['reportedStatus'] != '未知' else '未核验'
    return {'sourceType': adapter, 'sourceUrl': cfg['sourceBaseUrl'] + '/monitor', 'channels': output,
            'modelChannels': model_channels, 'collectedAt': now().isoformat(), 'expiresAt': expiry(cfg),
            'heartbeatMaxAgeSeconds': 900, 'historyWarnings': warnings}
