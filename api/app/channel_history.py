"""Bounded, timestamped source observations; never interpolate missing checks."""
from datetime import timedelta, timezone

from .models import now

STATES = {'operational': '正常', 'healthy': '正常', 'error': '异常', 'critical': '异常',
          'warning': '性能下降', 'degraded': '性能下降', 'pending': '等待中', 'unknown': '未知'}


def observation(at, status, **values):
    from .station_sources import stamp
    instant = stamp(at)
    current = now().replace(tzinfo=timezone.utc)
    if not instant or not current - timedelta(days=30) <= instant <= current + timedelta(minutes=1):
        return None
    return {'at': instant.isoformat(), 'status': STATES.get(status, status if status in STATES.values() else '未知'),
            **{k: v for k, v in values.items() if v is not None}}


def merge_snapshot(previous, incoming):
    """Accumulate actual legacy/Kuma checks, retaining gaps and source identities."""
    if not previous or any(previous.get(k) != incoming.get(k) for k in ['sourceType', 'sourceUrl']):
        previous = {}
    old = {r.get('id') or (r.get('name'), r.get('group')): r for r in previous.get('channels', [])}
    cutoff = (now().replace(tzinfo=timezone.utc) - timedelta(days=30)).isoformat()
    rows = []
    for item in incoming.get('channels', []):
        row = dict(item)
        key = row.get('id') or (row.get('name'), row.get('group'))
        if 'history' in row:
            points = {p['at']: p for p in old.get(key, {}).get('history', []) + row['history']
                      if p.get('at', '') >= cutoff}
            row['history'] = [points[t] for t in sorted(points)][-2000:]
        rows.append(row)
    return {**incoming, 'channels': rows}
