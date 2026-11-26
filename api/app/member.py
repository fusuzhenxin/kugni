import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .db import get_db
from .models import Evidence, Favorite, Ledger, Record, Report, User, Wallet, now, uid
from .serialization import record_json
from .security import require_user

router = APIRouter(prefix='/member', tags=['个人中心与积分'])
TASKS = [
    dict(id='checkin', name='每日签到', group='daily', points=5, description='每天签到，领取今天的小奖励', href=None),
    dict(id='daily-check', name='每日检测', group='daily', points=3, description='完成一次真实的基础检测', href='/tools/api-check/'),
    dict(id='browse-benefits', name='浏览福利', group='daily', points=2, description='看看有哪些开发者福利', href='/benefits/'),
    dict(id='profile', name='完善资料', group='basic', points=5, description='设置昵称、头像与个人简介', href='/account/settings/'),
    dict(id='first-saved', name='首次收藏', group='basic', points=3, description='收藏一家你感兴趣的服务商', href='/stations/'),
    dict(id='first-check', name='首次检测', group='basic', points=5, description='开启第一次真实接口检测', href='/tools/api-check/'),
    dict(id='review', name='发表点评', group='advanced', points=8, description='真实点评审核通过后自动发放', href='/stations/'),
    dict(id='contribute', name='贡献站点', group='advanced', points=20, description='完整资料收录通过后自动发放', href='/submit-station/'),
    dict(id='invite', name='邀请好友', group='advanced', points=50, description='好友完成注册并经核验后发放', href='/account/invitations/'),
]


def today() -> str:
    return datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()


def award(db: Session, user_id: str, event_key: str, title: str, amount: int):
    if db.scalar(select(Ledger.id).where(Ledger.user_id == user_id, Ledger.event_key == event_key)):
        return False
    result = db.execute(update(Wallet).where(Wallet.user_id == user_id, Wallet.balance >= max(0, -amount)).values(balance=Wallet.balance + amount))
    if result.rowcount != 1:
        raise HTTPException(409, '积分不足或账户不存在')
    balance = db.scalar(select(Wallet.balance).where(Wallet.user_id == user_id))
    db.add(Ledger(user_id=user_id, event_key=event_key, title=title, amount=amount, balance_after=balance))
    db.flush()
    return True


def task_states(db, user):
    ledger = list(db.scalars(select(Ledger).where(Ledger.user_id == user.id)))
    evidence = list(db.scalars(select(Evidence).where(Evidence.user_id == user.id)))
    completed_checks = list(db.scalars(select(Report).where(Report.owner_id == user.id)))
    successful = [r for r in completed_checks if r.evidence.get('success')]
    has_saved = bool(db.scalar(select(Favorite).where(Favorite.user_id == user.id)))
    ready = {'checkin': True, 'daily-check': any(r.created_at.replace(tzinfo=UTC).astimezone(ZoneInfo('Asia/Shanghai')).date().isoformat() == today() for r in successful), 'browse-benefits': any(e.kind == 'benefits' and e.day == today() for e in evidence), 'profile': bool(user.name.strip() and user.profile.get('avatar') and user.profile.get('bio')), 'first-saved': has_saved, 'first-check': bool(successful)}
    return [{**t, 'status': 'done' if any((e.event_key.startswith({'contribute': 'contribution', 'review': 'review', 'invite': 'invite'}[t['id']] + ':') if t['group'] == 'advanced' else e.event_key == t['id'] + (':' + today() if t['group'] == 'daily' else '')) for e in ledger) else 'verify' if t['group'] == 'advanced' else 'claim' if ready.get(t['id']) else 'go'} for t in TASKS]


@router.get('/overview/')
def overview(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return {'favorites': db.scalar(select(func.count()).select_from(Favorite).where(Favorite.user_id == user.id)), 'balance': db.get(Wallet, user.id).balance, 'submissions': db.scalar(select(func.count()).select_from(Record).where(Record.module == 'submissions', Record.owner_id == user.id)), 'invitations': db.scalar(select(func.count()).select_from(User).where(User.invited_by == user.id))}


@router.get('/points/')
def points(user: User = Depends(require_user), db: Session = Depends(get_db)):
    from .reward_delivery import member_redemption
    ledger = list(db.scalars(select(Ledger).where(Ledger.user_id == user.id).order_by(Ledger.created_at.desc()).limit(300)))
    return {'balance': db.get(Wallet, user.id).balance, 'tasks': task_states(db, user), 'records': [dict(id=r.id, title=r.title, amount=r.amount, balance=r.balance_after, date=r.created_at.isoformat()) for r in ledger], 'rewards': [record_json(r) for r in db.scalars(select(Record).where(Record.module == 'rewards'))], 'redemptions': [member_redemption(db, r) for r in db.scalars(select(Record).where(Record.module == 'redemptions', Record.owner_id == user.id))]}


@router.post('/points/claim/{task_id}/')
def claim(task_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    task = next((t for t in task_states(db, user) if t['id'] == task_id), None)
    if not task or task['status'] != 'claim':
        raise HTTPException(409, '任务尚未完成、已领取，或需要审核后发放')
    award(db, user.id, task_id + (':' + today() if task['group'] == 'daily' else ''), task['name'], task['points'])
    db.commit()
    return {'ok': True, 'balance': db.get(Wallet, user.id).balance}


@router.post('/evidence/benefits/')
def benefits_evidence(user: User = Depends(require_user), db: Session = Depends(get_db)):
    if not db.scalar(select(Evidence).where(Evidence.user_id == user.id, Evidence.kind == 'benefits', Evidence.day == today())):
        db.add(Evidence(user_id=user.id, kind='benefits', day=today()))
        db.commit()
    return {'ok': True}


@router.post('/points/redeem/{reward_id}/')
def redeem(reward_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    reward = db.scalar(select(Record).where(Record.id == reward_id, Record.module == 'rewards').with_for_update())
    if not reward or reward.status != '启用' or reward.data.get('stock', 0) < 1:
        raise HTTPException(409, '此权益暂不可兑换')
    cost = int(reward.data.get('cost', 0))
    if cost <= 0:
        raise HTTPException(409, '权益积分配置不正确')
    db.scalar(select(Wallet).where(Wallet.user_id == user.id).with_for_update())
    count = sum(r.data.get('rewardId') == reward.id and r.data.get('day') == today() for r in db.scalars(select(Record).where(Record.module == 'redemptions', Record.owner_id == user.id)))
    if count >= int(reward.data.get('dailyLimit') or 1):
        raise HTTPException(409, '这份权益已达到今日限兑次数')
    redemption = Record(id=uid(), module='redemptions', name=reward.name, owner_id=user.id, status='待处理', data=dict(rewardId=reward.id, cost=cost, day=today()))
    db.add(redemption)
    db.flush()
    if reward.data.get('deliveryMode') == '自动发码':
        from .reward_delivery import claim_code
        claim_code(db, reward, redemption)
    award(db, user.id, 'redeem:' + redemption.id, '兑换：' + reward.name, -cost)
    updated = db.execute(update(Record).where(Record.id == reward.id, Record.version == reward.version).values(data={**reward.data, 'stock': reward.data['stock'] - 1}, version=reward.version + 1))
    if updated.rowcount != 1:
        raise HTTPException(409, '库存已变化，请重试')
    db.commit()
    return {'ok': True, 'message': '权益已自动发放，请在兑换记录查看' if redemption.status == '已发放' else '兑换申请已提交，可在兑换记录查看发放进度', 'id': redemption.id}


@router.get('/favorites/')
def favorites(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Record).join(Favorite, Favorite.station_id == Record.id).where(Favorite.user_id == user.id, Record.status == '已收录'))
    return {'items': [record_json(r) for r in rows]}


@router.put('/favorites/{station_id}/')
def save(station_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    station = db.get(Record, station_id)
    if not station or station.module != 'stations' or station.status != '已收录':
        raise HTTPException(404, '站点不存在')
    if not db.get(Favorite, (user.id, station_id)):
        db.add(Favorite(user_id=user.id, station_id=station_id))
        db.commit()
    return {'ok': True}


@router.delete('/favorites/{station_id}/')
def unsave(station_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    item = db.get(Favorite, (user.id, station_id))
    if item:
        db.delete(item)
        db.commit()
    return {'ok': True}


class SubmissionBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    domain: HttpUrl
    category: str
    summary: str = Field(min_length=20, max_length=3000)
    contact: str = Field(min_length=3, max_length=240)
    models: list[str] = Field(default_factory=list, max_length=20)
    payments: list[str] = Field(default_factory=list, max_length=20)
    invoice: str = '未确认'
    refund: str = Field(default='未确认', max_length=100)
    promo: str = Field(default='', max_length=200)
    minRecharge: str = Field(default='', max_length=200)
    policyNotes: str = Field(default='', max_length=1000)
    notes: str = Field(default='', max_length=1500)
    email: str = Field(default='', max_length=200)
    socialLinks: list[dict[str, str]] = Field(default_factory=list, max_length=5)


@router.get('/submissions/')
def submissions(user: User = Depends(require_user), db: Session = Depends(get_db)):
    return {'items': [record_json(r) for r in db.scalars(select(Record).where(Record.module == 'submissions', Record.owner_id == user.id).order_by(Record.created_at.desc()))]}


@router.post('/submissions/', status_code=201)
def submit(body: SubmissionBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if not db.scalar(select(Record).where(Record.module == 'categories', Record.slug == body.category, Record.status == '启用')):
        raise HTTPException(422, '请选择现有分类')
    r = Record(module='submissions', name=body.name, owner_id=user.id, status='待审核', data=body.model_dump(mode='json'))
    db.add(r)
    db.commit()
    return record_json(r)


class ReviewBody(BaseModel):
    body: str = Field(min_length=10, max_length=1500)
    rating: int = Field(ge=1, le=5)


@router.post('/reviews/{station_id}/', status_code=201)
def review(station_id: str, body: ReviewBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    station = db.get(Record, station_id)
    if not station or station.module != 'stations' or station.status != '已收录':
        raise HTTPException(404, '站点不存在')
    if db.scalar(select(Record).where(Record.module == 'reviews', Record.owner_id == user.id, Record.slug == user.id + '-' + station_id)):
        raise HTTPException(409, '你已提交该站点评价，请等待审核')
    row = Record(module='reviews', name=station.name, slug=user.id + '-' + station_id, owner_id=user.id, status='待审核', data={**body.model_dump(), 'stationId': station_id, 'author': user.name})
    db.add(row)
    db.commit()
    return {'ok': True, 'message': '评价已提交审核'}


class FeedbackBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    body: str = Field(min_length=10, max_length=3000)
    path: str = Field(default='', max_length=500)


@router.post('/feedback/', status_code=201)
def feedback(body: FeedbackBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = Record(module='feedback', name=body.name, status='待处理', owner_id=user.id, data=body.model_dump())
    db.add(row)
    db.commit()
    return {'ok': True}


@router.get('/invitations/')
def invitations(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.invited_by == user.id))
    return {'code': user.id, 'items': [{'name': u.name, 'date': u.created_at.isoformat(), 'status': '已核验' if u.profile.get('verified') else '待核验'} for u in rows]}
