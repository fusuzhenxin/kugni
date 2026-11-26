"""Local GeoIP, live sessions, ordered paths and conversion cohorts."""
from collections import Counter, defaultdict
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
import ipaddress

from fastapi import HTTPException
from sqlalchemy import select

from .config import settings
from .models import Record, VisitorSession, now


@lru_cache(maxsize=2)
def geo_reader(path, modified):
    import maxminddb
    return maxminddb.open_database(path)


def geo_configured():
    path = settings().geoip_database
    try:
        if not path: return False
        geo_reader(path, Path(path).stat().st_mtime_ns)
        return True
    except (OSError, ValueError, ImportError):
        return False


def locate(request):
    path = settings().geoip_database
    if not path:
        return '未知', '未知'
    try:
        address = request.client.host
        if not ipaddress.ip_address(address).is_global:
            return '未知', '内网'
        info = geo_reader(path, Path(path).stat().st_mtime_ns).get(address) or {}
        country = info.get('country', {}).get('names', {})
        regions = info.get('subdivisions') or []
        region = (regions[0].get('names') or {}) if regions else {}
        return country.get('zh-CN') or country.get('en') or '未知', region.get('zh-CN') or region.get('en') or '未知'
    except (OSError, ValueError, ImportError, AttributeError):
        return '未知', '未知'


def validate_funnel(data):
    lines = [line.strip() for line in str(data.get('steps', '')).splitlines() if line.strip()]
    if not 2 <= len(lines) <= 8:
        raise HTTPException(422, '漏斗需要 2–8 个有序步骤')
    for line in lines:
        parts = line.split('|')
        if len(parts) != 3 or parts[0] not in ['pageview', 'outbound', 'impression', 'adclick'] or not parts[1].startswith('/') or len(parts[1]) > 500 or not parts[2].strip():
            raise HTTPException(422, '步骤格式为 kind|/路径前缀|名称，路径不能包含查询参数')
        if '?' in parts[1] or '#' in parts[1]:
            raise HTTPException(422, '漏斗路径不能包含查询参数或片段')
    data['steps'] = '\n'.join(lines)


def funnel_counts(rows, steps):
    grouped = defaultdict(list)
    for row in rows:
        if row.session_id:
            grouped[row.session_id].append(row)
    counts = [0] * len(steps)
    for events in grouped.values():
        position = 0
        for event in sorted(events, key=lambda r: (r.created_at, r.id)):
            kind, path, _ = steps[position]
            if event.kind == kind and event.path.startswith(path):
                counts[position] += 1
                position += 1
                if position == len(steps):
                    break
    return [{'name': label, 'count': counts[i], 'rate': round(counts[i] / counts[0] * 100, 2) if counts[0] else 0,
             'stepRate': round(counts[i] / counts[i-1] * 100, 2) if i and counts[i-1] else (100 if counts[i] else 0)} for i, (_, _, label) in enumerate(steps)]


def details(db, rows, own=False):
    cutoff = now() - timedelta(seconds=90)
    active = select(VisitorSession).where(VisitorSession.last_seen >= cutoff)
    if own:
        # Only campaign events visible to this advertiser count as live activity.
        ids = {r.session_id for r in rows if r.created_at >= cutoff and r.session_id}
        active = active.where(VisitorSession.id.in_(ids))
    sessions = list(db.scalars(active))
    countries = Counter(r.country + ' / ' + r.region for r in rows if r.kind in (['impression', 'adclick'] if own else ['pageview']))
    transitions = Counter((r.previous_path, r.path) for r in rows if r.kind == 'pageview' and r.previous_path)
    configurations = [] if own else list(db.scalars(select(Record).where(Record.module == 'analytics-funnels', Record.status == '启用')))
    definitions = [(r.name, [line.split('|') for line in r.data['steps'].splitlines()]) for r in configurations]
    if not definitions:
        definitions = [('广告转化' if own else '站点访问转化', [['impression', '/', '看到广告'], ['adclick', '/', '点击广告']] if own else [['pageview', '/', '访问网站'], ['pageview', '/stations/', '浏览服务商'], ['outbound', '/', '前往官网']])]
    return {'online': len({s.visitor for s in sessions}), 'onlineWindow': 90,
            'regions': [{'name': k, 'value': v} for k, v in countries.most_common(20)],
            'paths': [{'from': a, 'to': b, 'count': n} for (a, b), n in transitions.most_common(30)],
            'funnels': [{'name': name, 'steps': funnel_counts(rows, steps)} for name, steps in definitions],
            'geoConfigured': geo_configured(),
            'livePages': [] if own else [{'name': k, 'value': v} for k, v in Counter(s.last_path for s in sessions).most_common(15)]}
