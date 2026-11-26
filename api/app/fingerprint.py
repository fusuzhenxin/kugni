"""Versioned numeric fingerprints with held-out calibration and unknown rejection."""
import math
import re
from datetime import timedelta
from statistics import mean

from fastapi import HTTPException
from sqlalchemy import select, update

from .db import SessionLocal
from .models import Credential, Record, now
from .security import decrypt

VERSION = 'digits-327-299-301-v1'
COUNTS = (327, 299, 301)


def sample_prompts():
    return [f'请独立生成 {n} 个 0 到 9 的数字，用英文逗号分隔。只输出数字序列，不要解释。' for n in COUNTS]


def features(samples):
    if len(samples) != 3:
        return None
    rows = []
    for sample, expected in zip(samples, COUNTS):
        if sample.get('distribution') is not None and not sample.get('text'):
            return None  # Histograms alone cannot reconstruct sequential features.
        digits = [int(v) for v in re.findall(r'(?<!\d)[0-9](?!\d)', sample.get('text', ''))]
        if not expected * .8 <= len(digits) <= expected * 1.2:
            return None
        n = len(digits)
        row = [digits.count(d) / n for d in range(10)]
        row += [sum(digits[i] == digits[i-lag] for i in range(lag, n)) / (n-lag) for lag in [1, 2, 3]]
        row += [sum((digits[i] - digits[i-1]) % 10 == 1 for i in range(1, n)) / (n-1)]
        rows.append(row)
    return [mean(row[i] for row in rows) for i in range(14)]


def distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)) / len(a))


def center(rows):
    return [mean(row[i] for row in rows) for i in range(14)]


def recalibrate(db):
    records = list(db.scalars(select(Record).where(Record.module == 'fingerprint-baselines')))
    candidates = [r for r in records if r.data.get('_training') and r.status != '停用' and r.data.get('versionTag') == VERSION]
    models = {r.data['model'] for r in candidates}
    for row in candidates:
        data = dict(row.data)
        own = data['_center']
        holdout = data['_holdout']
        others = [r for r in candidates if r.data['model'] != data['model'] and r.data.get('protocol') == data.get('protocol')]
        passed = sum(all(distance(v, own) * 1.2 < distance(v, other.data['_center']) for other in others) for v in holdout)
        ready = bool(others) and passed / len(holdout) >= .8
        data.update(validation='校准通过' if ready else '待补充对照或区分度不足', validationSamples=len(holdout), validationCorrect=passed if others else 0,
                    radius=max(.005, max(distance(v, own) for v in holdout) * 1.5), calibratedAt=now().isoformat())
        row.data = data


def match_fingerprint(db, samples, protocol=None):
    vector = features(samples)
    if vector is None:
        return {'version': VERSION, 'state': 'unknown', 'candidates': [], 'conclusion': '有效数字样本不足，无法进行指纹匹配。'}
    rows = list(db.scalars(select(Record).where(Record.module == 'fingerprint-baselines', Record.status == '启用')))
    rows = [r for r in rows if (protocol is None or r.data.get('protocol') == protocol) and r.data.get('versionTag') == VERSION and r.data.get('validation') == '校准通过']
    if len({r.data['model'] for r in rows}) < 2:
        return {'version': VERSION, 'state': 'uncalibrated', 'candidates': [], 'conclusion': '至少需要两种可信模型通过独立样本校准，当前指纹库尚不满足条件。'}
    scored = sorted([(distance(vector, r.data['_center']), r) for r in rows], key=lambda item: item[0])
    unique = []
    for dist, row in scored:
        if row.data['model'] not in {v[1].data['model'] for v in unique}:
            unique.append((dist, row))
    first, best = unique[0]
    radius = best.data['radius']
    accepted = first <= radius and (len(unique) < 2 or unique[1][0] >= max(first * 1.2, first + .001))
    return {'version': VERSION, 'state': 'matched' if accepted else 'unknown', 'matchedModel': best.data['model'] if accepted else None,
            'candidates': [{'model': row.data['model'], 'similarity': round(100 * math.exp(-dist / max(row.data['radius'], .001)), 1), 'distance': round(dist, 6), 'baselineId': row.id} for dist, row in unique[:8]],
            'conclusion': ('数字分布更接近 ' + best.data['model'] if accepted else '样本超出基线范围或多个候选过于接近，无法判断型号') + '。相似度不是模型身份概率，也不能作为官方身份认证。'}


def validate_baseline(db, data, row=None):
    key = db.get(Record, data.get('keyId'))
    if not key or key.module != 'test-keys' or key.status != '启用' or data.get('protocol') not in key.data.get('protocols', []):
        raise HTTPException(422, '请选择启用且支持对应协议的可信 Key')
    value = float(data.get('rounds') or 9)
    if not value.is_integer():
        raise HTTPException(422, '采样轮数需为整数')
    rounds = int(value)
    if not 6 <= rounds <= 30:
        raise HTTPException(422, '指纹基线需要 6–30 轮采样')
    data['rounds'] = rounds
    if row and any(data.get(k) != row.data.get(k) for k in ['keyId', 'protocol', 'model', 'sourceUrl']):
        for field in ['_training', '_holdout', '_center', 'radius', 'validation', 'versionTag']:
            data.pop(field, None)
        data['status'] = '待采集'
    if data.get('status') == '启用' and not data.get('_training'):
        raise HTTPException(422, '请先采集校准，再启用基线')


def queue_calibration(db, row):
    if row.data.get('calibrationState') in ['排队中', '执行中']:
        raise HTTPException(409, '该基线正在等待或执行采集')
    row.data = {**row.data, 'calibrationState': '排队中', 'calibrationError': ''}


def fingerprint_tick():
    with SessionLocal() as db:
        for stale in db.scalars(select(Record).where(Record.module == 'fingerprint-baselines', Record.data['calibrationState'].as_string() == '执行中', Record.updated_at < now() - timedelta(minutes=15))):
            stale.data = {**stale.data, 'calibrationState': '失败', 'calibrationError': '采集进程失联，请重试'}
            stale.version += 1
        db.commit()
        row = db.scalar(select(Record).where(Record.module == 'fingerprint-baselines', Record.data['calibrationState'].as_string() == '排队中').with_for_update(skip_locked=True).limit(1))
        if not row:
            return False
        version, rid, data = row.version, row.id, dict(row.data)
        claimed = db.execute(update(Record).where(Record.id == rid, Record.version == version).values(data={**data, 'calibrationState': '执行中'}, version=version+1))
        key = db.get(Record, data['keyId'])
        secret = db.get(Credential, key.id) if key else None
        base = key.data.get('baseUrl') if key else None
        credential = decrypt(secret.encrypted_secret) if secret else None
        db.commit()
        if claimed.rowcount != 1:
            return False
    try:
        from .testing import call_model
        if not key or key.status != '启用' or not credential:
            raise ValueError('missing key')
        vectors = []
        for round_index in range(data['rounds']):
            samples = [call_model(base, credential, data['protocol'], data['model'], prompt, 45, 1800) for prompt in sample_prompts()]
            vector = features(samples)
            if vector is None:
                raise ValueError('incomplete sample')
            vectors.append(vector)
            with SessionLocal() as db:
                current = db.get(Record, rid)
                if not current or current.version != version + 1:
                    return True  # An edited/deleted baseline cannot accept stale results.
                current.data = {**current.data, 'sampleCount': len(vectors)}
                db.commit()
        split = max(4, int(len(vectors) * .67))
        with SessionLocal() as db:
            row = db.get(Record, rid)
            if row and row.version == version + 1:
                row.data = {**row.data, '_training': vectors[:split], '_holdout': vectors[split:], '_center': center(vectors[:split]), 'sampleCount': len(vectors), 'versionTag': VERSION, 'calibrationState': '已完成', 'collectedAt': now().isoformat()}
                recalibrate(db)
                db.commit()
    except Exception:
        with SessionLocal() as db:
            row = db.get(Record, rid)
            if row and row.version == version + 1:
                row.data = {**row.data, 'calibrationState': '失败', 'calibrationError': '采样失败、凭证失效或数字样本不完整，请核对可信源后重试'}
                db.commit()
    return True
