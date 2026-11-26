"""Evaluate actual report evidence; notifications stay inside this service."""
from datetime import datetime, timedelta
from sqlalchemy import select
from .db import SessionLocal
from .models import Record, Report, now


def evaluate_alerts():
    with SessionLocal() as db:
        for rule in db.scalars(select(Record).where(Record.module == 'test-alerts', Record.status == '启用').with_for_update(skip_locked=True)):
            data = rule.data
            if data.get('_notifiedAt') and datetime.fromisoformat(data['_notifiedAt']) > now() - timedelta(minutes=int(data.get('cooldown') or 30)): continue
            rows = list(db.scalars(select(Report).where(Report.station_id == data.get('station'), Report.created_at >= now() - timedelta(minutes=int(data.get('window') or 60))).order_by(Report.created_at.desc())))
            metric, threshold = data.get('metric'), float(data.get('threshold') or 0)
            actual, matched = None, False
            if metric == '连续失败次数' and rows:
                actual = 0
                for row in rows:
                    if row.evidence.get('success'): break
                    actual += 1
                matched = actual >= max(1, threshold)
            elif metric == '成功率低于' and rows:
                actual = round(sum(bool(r.evidence.get('success')) for r in rows) / len(rows) * 100, 2)
                matched = actual < threshold
            elif metric == '评分低于':
                scored = [r.score for r in rows if r.score is not None]
                if scored: actual, matched = scored[0], scored[0] < threshold
            elif metric == 'Key 即将过期天数':
                remaining = [(datetime.fromisoformat(k.data['expires']).date() - now().date()).days for k in db.scalars(select(Record).where(Record.module == 'test-keys', Record.status == '启用')) if k.data.get('station') == data.get('station') and k.data.get('expires')]
                if remaining: actual, matched = min(remaining), min(remaining) <= threshold
            elif metric == '探测余额低于':
                balances = [float(a.data['balance']) for a in db.scalars(select(Record).where(Record.module == 'probe-accounts', Record.status == '启用')) if a.data.get('station') == data.get('station') and a.data.get('lastSyncedAt') and a.data.get('balance') is not None]
                if balances: actual, matched = min(balances), min(balances) < threshold
            if matched:
                message = f'{metric}：当前值 {actual}，阈值 {threshold:g}；窗口 {data.get("window", 60)} 分钟。'
                rule.data = {**data, 'lastEvent': now().isoformat(), 'eventStatus': '待处理', 'lastEvidence': message, '_notifiedAt': now().isoformat()}
                db.add(Record(module='messages', name='测试告警 · ' + rule.name, owner_id=rule.owner_id, status='未读', data={'body': message, 'ruleId': rule.id}))
        for campaign in db.scalars(select(Record).where(Record.module == 'campaigns', Record.status == '投放中')):
            if campaign.data.get('end') and campaign.data['end'] < now().date().isoformat(): campaign.status = '已结束'
        db.commit()
