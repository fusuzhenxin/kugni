"""Parse account-visible metadata without importing console account information."""
import math
from datetime import timedelta

from fastapi import HTTPException

from .models import now


def expiry(cfg):
    from .testing import next_run
    due = next_run(cfg)
    if cfg.get('schedule') == '每日定时' and due:
        from datetime import datetime
        return (datetime.fromisoformat(due) + timedelta(hours=1)).isoformat()
    return (now() + timedelta(minutes=max(30, min(int(cfg.get('interval') or 30) * 2, 1440)))).isoformat()


def notice_rows(remote, cfg):
    from .station_sources import plain
    sub = cfg['sourceAdapter'] == 'Sub2API'
    path = '/api/v1/announcements' if sub else '/api/user/announcements/timeline'
    data = remote.get(path)
    items = data if sub else data.get('items') if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) > 500: raise ValueError('登录公告列表格式无效或数量超过上限')
    output = []
    for item in items:
        if not isinstance(item, dict) or not item.get('id'): raise ValueError('登录公告缺少有效标识')
        body = plain(item.get('content') or item.get('body') or '')
        if not body: continue
        output.append({'identity': cfg['sourceAdapter'] + ':' + str(item['id']),
                       'name': plain(item.get('title') or body.splitlines()[0])[:80], 'body': body,
                       'publishedAt': str(item.get('created_at') or item.get('createdAt') or '')[:60],
                       'sourceUrl': cfg['sourceBaseUrl'] + ('/dashboard' if sub else '/announcements')})
    return output, []


def number(value, low=0, high=1e12):
    return value if type(value) in [int, float] and math.isfinite(value) and low <= value <= high else None


from .station_channel_adapters import channel_rows
