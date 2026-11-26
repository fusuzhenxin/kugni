"""FluxLane official homepage weekly, site-wide statistics, not upstream groups."""
from datetime import datetime, timedelta, timezone

from .channel_history import observation
from .models import now
from .station_source_adapters import number

ADAPTER = 'FluxLane 公开调用表现'


def fluxlane_channels(client, cfg):
    from .station_public_adapters import snapshot
    from .station_sources import plain
    data = client.get(cfg['sourceBaseUrl'] + '/fluxlane-home/success-week.json')
    days, models = data.get('days'), data.get('models')
    if not isinstance(days, list) or len(days) != 7 or not isinstance(models, list) or len(models) > 3:
        raise ValueError('FluxLane 公开周报结构无效')
    if type(data.get('model_count')) is not int or data['model_count'] < len(models):
        raise ValueError('FluxLane 型号数量无效')
    points, previous = [], None
    for day in days:
        date = datetime.strptime(day['date'], '%Y-%m-%d').replace(tzinfo=timezone(timedelta(hours=8)))
        if previous and date - previous != timedelta(days=1): raise ValueError('FluxLane 按日记录不连续')
        previous = date
        rate = number(day.get('success_rate'), high=100)
        # Official page uses Beijing calendar dates. Current/future days cannot
        # become completed observations; null is an explicit sampling gap.
        if date.astimezone(timezone.utc).replace(tzinfo=None) + timedelta(days=1) > now(): continue
        state = '未知' if rate is None else '正常' if rate >= 90 else '性能下降' if rate >= 70 else '异常'
        point = observation(date.isoformat(), state, seconds=86400, successRate=rate)
        if point: points.append(point)
    group = {'id': 'fluxlane:site', 'name': '全站调用表现', 'group': '全站调用表现', 'modelIds': [],
        'status': '未核验', 'heartbeatAt': '', 'windows': {'7d': {'history': points, 'successRate': number(data.get('success_rate'), high=100)}},
        'note': '来源官网全站按日调用成功率（北京时间），不是具体上游分组；灰色表示没有样本'}
    rows, seen = [], set()
    for model in models:
        name = plain(model.get('name', ''), 180)
        if not name or name in seen: raise ValueError('FluxLane 型号缺失或重复')
        seen.add(name)
        rows.append({'id': 'fluxlane:model:' + name, 'name': '全站型号汇总', 'group': '全站型号汇总', 'modelIds': [name],
            'status': '未核验', 'heartbeatAt': '', 'windows': {'7d': {'history': [], 'successRate': number(model.get('success_rate'), high=100)}},
            'note': '来源全站该型号周汇总，不区分上游分组；来源没有提供该型号按日历史'})
    result = snapshot(cfg, [group], rows)
    result.update(sourceUrl=cfg['sourceBaseUrl'] + '/#homeMetrics', supportedRanges=['7d'], historyScope='site-wide',
                  historyWarnings=[], sourceModelCount=data['model_count'])
    return result
