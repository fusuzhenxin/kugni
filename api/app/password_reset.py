import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import LoginSession, Record, User, now
from .security import hash_token, origin_guard, password_hash, rate_limit

router = APIRouter(prefix='/auth', tags=['找回密码'])


class ResetRequest(BaseModel):
    email: EmailStr


def deliver_reset(email, token):
    cfg = settings()
    msg = EmailMessage()
    msg['Subject'], msg['From'], msg['To'] = '重置 KUGNI 登录密码', cfg.smtp_from, email
    msg.set_content('你申请了重置 KUGNI 密码。请在 30 分钟内打开：\n' + cfg.site_url + '/auth/password-reset/?token=' + token + '\n若非本人申请，请忽略此邮件。')
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as server:
        server.starttls()
        if cfg.smtp_user: server.login(cfg.smtp_user, cfg.smtp_password)
        server.send_message(msg)


@router.post('/password-reset/request/')
def request_reset(body: ResetRequest, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    origin_guard(request)
    if not settings().smtp_host or not settings().smtp_from: raise HTTPException(503, '邮件服务尚未配置，请联系管理员处理账户恢复')
    rate_limit(db, 'reset:' + (request.client.host if request.client else ''), 5, 3600)
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.enabled.is_(True)))
    if user:
        token = secrets.token_urlsafe(40)
        db.add(Record(module='password-reset', name='密码重置', slug=hash_token(token), owner_id=user.id, status='pending', data={'expires': (now() + timedelta(minutes=30)).isoformat()}))
        db.commit()
        background.add_task(deliver_reset, user.email, token)
    return {'ok': True, 'message': '若邮箱对应有效账户，将收到重置邮件'}


class ResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=150)
    password: str = Field(min_length=10, max_length=128)


@router.post('/password-reset/confirm/')
def confirm_reset(body: ResetConfirm, request: Request, db: Session = Depends(get_db)):
    origin_guard(request)
    row = db.scalar(select(Record).where(Record.module == 'password-reset', Record.slug == hash_token(body.token), Record.status == 'pending').with_for_update())
    if not row or row.data['expires'] < now().isoformat(): raise HTTPException(400, '重置链接无效或已过期')
    user = db.get(User, row.owner_id)
    user.password_hash = password_hash(body.password)
    row.status = 'used'
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    return {'ok': True}
