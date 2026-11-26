"""Encrypted code inventory, claimed inside the points transaction."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select, update

from .models import Credential, Record, RewardCodeDigest
from .security import decrypt, encrypt, hash_token


def import_codes(db, reward_id, text, row, expires=''):
    reward = db.scalar(select(Record).where(Record.id == reward_id, Record.module == 'rewards').with_for_update())
    if not reward:
        raise HTTPException(422, '请选择有效权益')
    values = [s.strip() for s in text.splitlines() if s.strip()]
    if not values or len(values) > 100 or any(len(v) > 1000 for v in values):
        raise HTTPException(422, '每批需要 1–100 行，每行最多 1000 字符')
    digests = [hash_token(v) for v in values]
    if len(set(digests)) != len(values):
        raise HTTPException(409, '批次内存在重复兑换码')
    if db.scalar(select(RewardCodeDigest.digest).where(RewardCodeDigest.digest.in_(digests))):
        raise HTTPException(409, '兑换码已存在于其他批次')
    for digest in digests:
        db.add(RewardCodeDigest(digest=digest, batch_id=row.id))
    if expires and expires < datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat():
        raise HTTPException(422, '不能导入已过期的兑换码')
    db.add(Credential(id=row.id, encrypted_secret=encrypt(json.dumps(values, ensure_ascii=False)), fingerprint=f'{len(values)} 份'))
    reward.data = {**reward.data, 'stock': int(reward.data.get('stock') or 0) + len(values)}
    reward.version += 1
    return {'rewardId': reward_id, 'available': len(values), 'delivered': 0, 'expires': expires, '_digests': digests}


def claim_code(db, reward, redemption):
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
    batches = db.scalars(select(Record).where(Record.module == 'reward-codes').order_by(Record.created_at).with_for_update())
    for batch in batches:
        data = batch.data
        if data.get('rewardId') != reward.id or not data.get('available') or (data.get('expires') and data['expires'] < today):
            continue
        index = int(data.get('delivered') or 0)
        credential = db.get(Credential, batch.id)
        codes = json.loads(decrypt(credential.encrypted_secret))
        updated = db.execute(update(Record).where(Record.id == batch.id, Record.version == batch.version).values(data={**data, 'available': data['available'] - 1, 'delivered': index + 1}, version=batch.version + 1))
        if updated.rowcount != 1:
            raise HTTPException(409, '库存正在更新，请重试')
        db.add(Credential(id=redemption.id, encrypted_secret=encrypt(codes[index]), fingerprint='已加密发放'))
        redemption.status = '已发放'
        redemption.data = {**redemption.data, 'deliveryMode': '自动发码', 'batchId': batch.id, 'expires': data.get('expires', '')}
        return
    raise HTTPException(409, '暂无未过期的可用兑换码，本次不会扣除积分')


def member_redemption(db, row):
    from .serialization import record_json
    result = record_json(row)
    if row.data.get('deliveryMode') == '自动发码':
        credential = db.get(Credential, row.id)
        result['fulfillment'] = decrypt(credential.encrypted_secret) if credential else '权益凭证暂不可读取，请联系平台'
    return result


def delete_batch(db, row):
    if row.data.get('delivered'):
        raise HTTPException(409, '批次已有发放记录，不可删除')
    reward = db.scalar(select(Record).where(Record.id == row.data.get('rewardId')).with_for_update())
    if reward:
        reward.data = {**reward.data, 'stock': max(0, int(reward.data.get('stock') or 0) - int(row.data.get('available') or 0))}
        reward.version += 1
