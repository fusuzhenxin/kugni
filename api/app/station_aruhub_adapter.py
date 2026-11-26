"""AruHub public group statistics and ordered calls, which have no timestamps."""
import hashlib

import httpx
from fastapi import HTTPException

from .station_source_adapters import number

ADAPTER = 'AruHub 渠道状态'


def sampled(summary):
    if 'has_data' in summary: return summary['has_data'] is True
    return (number(summary.get('request_count')) or 0) > 0


def state(rate):
    # Match the thresholds explicitly displayed on AruHub's public page.
    return '未知' if rate is None else '正常' if rate >= 90 else '性能下降' if rate >= 80 else '异常'


def identity(group, model=''):
    return 'aruhub:' + hashlib.sha256((group + '\0' + model).encode()).hexdigest()[:24]


def parse_window(data, minutes):
    from .station_public_adapters import epoch
    from .station_sources import plain
    if not isinstance(data, dict) or data.get('window_minutes') != minutes:
        raise ValueError('AruHub 统计窗口与请求不一致')
    updated = epoch(data.get('updated_at'))
    groups = data.get('groups')
    if not updated or not isinstance(groups, list) or len(groups) > 200:
        raise ValueError('AruHub 分组统计格式或来源更新时间无效')
    output = {}
    for item in groups:
        name = plain(item.get('group', ''), 180)
        if not name or name in output: raise ValueError('AruHub 分组标识缺失或重复')
        summary, calls = item.get('summary'), item.get('recent_calls')
        if not isinstance(summary, dict) or not isinstance(calls, list) or len(calls) > 500:
            raise ValueError('AruHub 分组摘要或近期调用格式无效')
        recent = []
        for call in calls[-60:]:
            model = plain(call.get('model_name', ''), 180)
            if not model or type(call.get('success')) is not bool:
                raise ValueError('AruHub 调用型号或结果格式无效')
            recent.append({'modelId': model, 'success': call['success'],
                           'latencyMs': number(call.get('latency_ms'))})
        output[name] = {'sourceUpdatedAt': updated, 'recentCalls': recent,
                        'successRate': number(summary.get('success_rate'), high=100) if sampled(summary) else None}
    return output


def aruhub_channels(client, cfg):
    from .station_public_adapters import snapshot
    from .station_sources import error_text, success, plain
    base, windows, warnings = cfg['sourceBaseUrl'], {}, []
    for window, minutes in [('24h', 1440), ('7d', 10080)]:
        try:
            windows[window] = parse_window(success(client.get(base + '/api/channel-status?minutes=' + str(minutes))), minutes)
        except (httpx.HTTPError, HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
            if window == '24h':
                # The long query can time out while the official short query works.
                # Keep its actual window; never present 90 minutes as a whole day.
                warnings.append('24小时统计暂不可用，已回退90分钟：' + error_text(exc))
                windows['90m'] = parse_window(success(client.get(base + '/api/channel-status?minutes=90')), 90)
            else:
                warnings.append('7天统计暂不可用：' + error_text(exc))
    primary = '24h' if '24h' in windows else '90m'
    names = list(windows[primary])
    for values in windows.values():
        names += [name for name in values if name not in names]
    # The public page also lists configured groups that have no calls yet.
    try:
        pricing = client.get(base + '/api/pricing')
        groups = pricing.get('usable_group')
        if pricing.get('success') is not True or not isinstance(groups, dict) or len(groups) > 200:
            raise ValueError('公开分组目录无效')
        names += [plain(name, 180) for name in groups if name not in names]
    except (httpx.HTTPError, HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
        warnings.append('公开分组目录暂不可用：' + error_text(exc))
    channels, models = [], []
    for group in names:
        values = {key: rows[group] for key, rows in windows.items() if group in rows}
        reported = state(values.get(primary, {}).get('successRate'))
        channels.append({'id': identity(group), 'name': group, 'group': group, 'modelIds': [],
            'status': reported, 'reportedStatus': reported, 'heartbeatAt': '', 'windows': values,
            'note': '来源分组成功率；状态条按近期调用顺序展示，每条调用没有时间戳，不是时间轴'})
        model_ids = dict.fromkeys(c['modelId'] for value in values.values() for c in value['recentCalls'])
        for model in model_ids:
            samples = {}
            for key, value in values.items():
                calls = [c for c in value['recentCalls'] if c['modelId'] == model]
                samples[key] = {'sourceUpdatedAt': value['sourceUpdatedAt'], 'recentCalls': calls,
                    'sampleSuccessRate': sum(c['success'] for c in calls) / len(calls) * 100 if calls else None}
            models.append({'id': identity(group, model), 'name': group, 'group': group, 'modelIds': [model],
                'status': '未核验', 'heartbeatAt': '', 'windows': samples,
                'note': '仅统计该型号在此分组近期调用中的样本；不代表全量请求成功率，也不是时间轴'})
    if len(models) > 2000: raise ValueError('AruHub 型号与分组样本数量超过限制')
    result = snapshot(cfg, channels, models)
    result.update(sourceUrl=base + '/channel-status', supportedRanges=list(windows),
                  historyKind='ordered-calls', historyWarnings=warnings)
    return result
