"""Email-bound one-use challenges. SMTP failures never become sent codes."""
import hmac
import hashlib
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Record, User, now
from .security import hash_token, origin_guard, rate_limit, require_user

router = APIRouter(prefix='/auth', tags=['邮箱验证'])


def code_digest(email, code):
    return hmac.new(settings().secret_key.encode(), (email.lower() + ':' + code).encode(), hashlib.sha256).hexdigest()


def deliver_code(email, code):
    cfg = settings()
    if not cfg.smtp_host or not cfg.smtp_from:
        raise HTTPException(503, '邮件服务尚未配置，请管理员配置 SMTP 后再验证邮箱')
    message = EmailMessage()
    message['Subject'], message['From'], message['To'] = 'KUGNI 邮箱验证码', cfg.smtp_from, email
    message.set_content(f'你的邮箱验证码为：{code}\n10 分钟内有效，请勿向他人提供。若非本人操作，请忽略。')
    try:
        smtp_class = smtplib.SMTP_SSL if cfg.smtp_port == 465 else smtplib.SMTP
        with smtp_class(cfg.smtp_host, cfg.smtp_port, timeout=20) as server:
            if cfg.smtp_port != 465: server.starttls()
            if cfg.smtp_user:
                server.login(cfg.smtp_user, cfg.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException):
        raise HTTPException(503, '验证码邮件发送失败，请稍后重试或联系管理员')


class CodeRequest(BaseModel):
    email: EmailStr


@router.post('/email-code/')
def send_code(body: CodeRequest, request: Request, db: Session = Depends(get_db)):
    origin_guard(request)
    email = body.email.lower()
    rate_limit(db, 'email-ip:' + (request.client.host if request.client else ''), 10, 3600)
    rate_limit(db, 'email-address:' + hash_token(email), 1, 60)
    rate_limit(db, 'email-daily:' + hash_token(email), 12, 86400)
    key = hash_token(email)
    row = db.scalar(select(Record).where(Record.module == 'email-challenges', Record.slug == key).with_for_update())
    code = f'{secrets.randbelow(1000000):06d}'
    deliver_code(email, code)
    if not row:
        row = Record(module='email-challenges', slug=key, name='邮箱验证', status='pending')
        db.add(row)
    row.status = 'pending'
    row.data = {'digest': code_digest(email, code), 'expires': (now() + timedelta(minutes=10)).isoformat(), 'attempts': 0}
    db.commit()
    return {'ok': True, 'retryAfter': 60, 'message': '验证码已发送，请检查邮箱及垃圾邮件'}


def consume_code(db, email, code):
    row = db.scalar(select(Record).where(Record.module == 'email-challenges', Record.slug == hash_token(email.lower())).with_for_update())
    if not row or row.status != 'pending' or row.data.get('expires', '') < now().isoformat() or row.data.get('attempts', 0) >= 5:
        raise HTTPException(400, '验证码无效或已过期，请重新获取')
    if not hmac.compare_digest(row.data['digest'], code_digest(email, code)):
        row.data = {**row.data, 'attempts': row.data.get('attempts', 0) + 1}
        db.commit()  # Persist failed attempts even though the request is rejected.
        raise HTTPException(400, '验证码不正确')
    row.status = 'used'


class ConfirmCode(BaseModel):
    code: str = Field(pattern=r'^\d{6}$')


@router.post('/verify-email/')
def verify(body: ConfirmCode, user: User = Depends(require_user), db: Session = Depends(get_db)):
    consume_code(db, user.email, body.code)
    user.profile = {**user.profile, 'emailVerified': True, 'emailVerifiedAt': now().isoformat()}
    db.commit()
    return {'ok': True, 'message': '邮箱验证成功'}
