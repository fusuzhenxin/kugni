import hashlib
import hmac
import secrets
from datetime import timedelta

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import LoginSession, RateBucket, Role, User, now


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f'scrypt${salt}${digest}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, salt, expected = encoded.split('$')
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(expected, actual)
    except (ValueError, TypeError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def encrypt(value: str) -> str:
    return Fernet(settings().encryption_key.encode()).encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return Fernet(settings().encryption_key.encode()).decrypt(value.encode()).decode()


def origin_guard(request: Request) -> None:
    origin = request.headers.get('origin')
    if origin and origin.rstrip('/') not in {settings().browser_origin.rstrip('/'), settings().site_url.rstrip('/')}:
        raise HTTPException(403, '请求来源不受信任')


def session_user(request: Request, db: Session, required: bool = True) -> User | None:
    token = request.cookies.get('kugni_session', '')
    session = db.get(LoginSession, hash_token(token)) if token else None
    user = db.get(User, session.user_id) if session and session.expires_at > now() else None
    role = db.get(Role, user.role_id) if user else None
    if not user or not user.enabled or not role or not role.enabled:
        if required:
            raise HTTPException(401, '请先登录')
        return None
    request.state.session = session
    request.state.role = role
    return user


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = session_user(request, db)
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        origin_guard(request)
        if not hmac.compare_digest(request.headers.get('x-csrf-token', ''), request.state.session.csrf):
            raise HTTPException(403, '会话校验失败，请刷新后重试')
    return user


def check_permission(db: Session, user: User, module: dict, action: str) -> Role:
    role = db.get(Role, user.role_id)
    if not role or not role.enabled or role.surface != module['surface'] or f"{module['permission']}.{action}" not in role.permissions:
        raise HTTPException(403, '没有此项操作权限')
    return role


def rate_limit(db: Session, key: str, limit: int, seconds: int) -> None:
    bucket = db.scalar(select(RateBucket).where(RateBucket.key == key).with_for_update())
    if not bucket:
        bucket = RateBucket(key=key, count=0, expires_at=now() + timedelta(seconds=seconds))
        db.add(bucket)
    elif bucket.expires_at < now():
        bucket.count = 0
        bucket.expires_at = now() + timedelta(seconds=seconds)
    bucket.count += 1
    db.commit()
    if bucket.count > limit:
        raise HTTPException(429, '操作太频繁，请稍后再试', headers={'Retry-After': str(seconds)})
