from datetime import timedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .admin_service import audit
from .cache import enqueue_invalidation, flush_invalidations
from .catalog import module
from .db import get_db
from .models import Record, Role, User, now, uid
from .security import check_permission, require_user
from .serialization import record_json

router = APIRouter(tags=['广告订单'])


@router.post('/publisher/campaigns/{id}/order/')
def request_order(id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    check_permission(db, user, module('p-campaigns'), 'read')
    campaign = db.scalar(select(Record).where(Record.id == id, Record.module == 'campaigns', Record.owner_id == user.id).with_for_update())
    if not campaign or campaign.status != '已通过': raise HTTPException(409, '请选择审核通过的本人广告')
    for order in db.scalars(select(Record).where(Record.module == 'orders', Record.owner_id == user.id)):
        if order.data.get('campaignId') == id and order.status != '已关闭': return record_json(order)
    placement = db.get(Record, campaign.data.get('placement', ''))
    if not placement or placement.module != 'placements' or placement.status != '可投放': raise HTTPException(409, '广告位暂不可用')
    amount = float(placement.data.get('price', 0))
    if amount <= 0: raise HTTPException(409, '广告位未配置价格')
    order = Record(module='orders', name='KG' + now().strftime('%Y%m%d') + uid()[:10].upper(), owner_id=user.id, status='待付款', data=dict(campaignId=id, campaignName=campaign.name, placement=placement.name, placementId=placement.id, amount=amount, advertiser=user.name, payment='线下核对', note='刊例价按一个展示周期计算，具体排期由平台确认。'))
    db.add(order)
    db.commit()
    return record_json(order)


class ConfirmPayment(BaseModel):
    reference: str


@router.post('/admin/orders/{id}/confirm-payment/')
def confirm_payment(id: str, body: ConfirmPayment, background: BackgroundTasks, user: User = Depends(require_user), db: Session = Depends(get_db)):
    # Payment confirmation is a distinct backend permission, not arbitrary order editing.
    check_permission(db, user, module('orders'), 'confirmPayment')
    order = db.scalar(select(Record).where(Record.id == id, Record.module == 'orders').with_for_update())
    if not order or order.status != '待付款': raise HTTPException(409, '订单不存在或已处理')
    if len(body.reference.strip()) < 6 or len(body.reference) > 200: raise HTTPException(422, '请填写可核对的付款流水或凭证编号')
    campaign = db.get(Record, order.data['campaignId'])
    if not campaign or campaign.status != '已通过': raise HTTPException(409, '广告未处于审核通过状态')
    placement = db.scalar(select(Record).where(Record.id == order.data['placementId']).with_for_update())
    active = [r for r in db.scalars(select(Record).where(Record.module == 'campaigns', Record.status == '投放中')) if r.data.get('placement') == placement.id and r.data.get('end', '') >= now().date().isoformat()]
    if len(active) >= int(placement.data.get('capacity') or 1): raise HTTPException(409, '此广告位当前排期已满')
    order.status = '已支付'
    order.data = {**order.data, 'paymentReference': body.reference, 'confirmedBy': user.id, 'paidAt': now().isoformat()}
    campaign.status = '投放中'
    db.add(Record(module='messages', name='广告已安排投放', owner_id=order.owner_id, status='未读', data=dict(body=campaign.name + ' 的付款已核对，将按审核排期展示。')))
    audit(db, user, 'confirmPayment', module('orders'), id, {'reference': body.reference})
    enqueue_invalidation(db, 'campaigns')
    db.commit()
    background.add_task(flush_invalidations)
    return record_json(order)
