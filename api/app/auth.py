import secrets
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import LoginSession, Role, User, Wallet, now
from .security import hash_token, origin_guard, password_hash, rate_limit, require_user, session_user, verify_password
from .serialization import user_json

router = APIRouter(prefix='/auth', tags=['账户认证'])


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    surface: Literal['platform', 'publisher'] | None = None


class RegisterBody(LoginBody):
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=40)
    invite: str = Field(default='', max_length=64)
    code: str = Field(pattern=r'^\d{6}$')


def establish(db: Session, user: User, response: Response) -> dict:
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    db.add(LoginSession(id=hash_token(token), user_id=user.id, csrf=csrf, expires_at=now() + timedelta(days=settings().session_days)))
    user.last_login = now()
    db.commit()
    response.set_cookie('kugni_session', token, httponly=True, secure=settings().cookie_secure, samesite='lax', max_age=settings().session_days * 86400, path='/')
    response.headers['Cache-Control'] = 'no-store'
    return {'user': user_json(user, db.get(Role, user.role_id)), 'csrf': csrf}


@router.get('/session/')
def current(request: Request, response: Response, db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    user = session_user(request, db, required=False)
    return {'user': user_json(user, request.state.role) if user else None, 'csrf': request.state.session.csrf if user else None}


@router.post('/login/')
def login(body: LoginBody, request: Request, response: Response, db: Session = Depends(get_db)):
    origin_guard(request)
    rate_limit(db, 'login:' + (request.client.host if request.client else 'unknown'), 30, 900)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash) or not user.enabled:
        raise HTTPException(401, '邮箱或密码不正确，或账户已停用')
    role = db.get(Role, user.role_id)
    if not role.enabled:
        raise HTTPException(403, '角色已停用，请联系管理员')
    if body.surface and role.surface != body.surface:
        raise HTTPException(403, '此账户无权登录该工作台，请使用具有对应角色的账户')
    return establish(db, user, response)


@router.post('/register/', status_code=201)
def register(body: RegisterBody, request: Request, response: Response, db: Session = Depends(get_db)):
    origin_guard(request)
    if len(body.name.strip()) < 2: raise HTTPException(422, '昵称至少 2 个可见字符')
    rate_limit(db, 'register:' + (request.client.host if request.client else 'unknown'), 8, 3600)
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, '该邮箱已注册')
    from .email_verification import consume_code
    consume_code(db, body.email.lower(), body.code)
    inviter = db.get(User, body.invite) if body.invite else None
    user = User(name=body.name.strip(), email=body.email.lower(), password_hash=password_hash(body.password), role_id='member', invited_by=inviter.id if inviter and inviter.enabled else None, profile={'emailVerified': True, 'emailVerifiedAt': now().isoformat()})
    db.add(user)
    db.flush()
    db.add(Wallet(user_id=user.id, balance=0))
    return establish(db, user, response)


@router.post('/logout/')
def logout(request: Request, response: Response, user: User = Depends(require_user), db: Session = Depends(get_db)):
    db.delete(request.state.session)
    db.commit()
    response.delete_cookie('kugni_session', path='/')
    return {'ok': True}


class ProfileBody(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    bio: str = Field(default='', max_length=160)
    avatar: str = Field(default='', max_length=300)
    notifications: dict[str, bool] | None = None


@router.patch('/profile/')
def profile(body: ProfileBody, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if body.avatar and not body.avatar.startswith('/uploads/'):
        raise HTTPException(422, '请先上传头像')
    user.name = body.name.strip()
    user.profile = {**user.profile, 'bio': body.bio, 'avatar': body.avatar}
    if body.notifications is not None:
        user.profile = {**user.profile, 'notifications': {k: body.notifications.get(k, False) for k in ['review', 'benefits']}}
    db.commit()
    return user_json(user, db.get(Role, user.role_id))


class PasswordBody(BaseModel):
    current: str = Field(max_length=128)
    password: str = Field(min_length=10, max_length=128)


@router.post('/password/')
def change_password(body: PasswordBody, request: Request, user: User = Depends(require_user), db: Session = Depends(get_db)):
    if not verify_password(body.current, user.password_hash):
        raise HTTPException(400, '当前密码不正确')
    user.password_hash = password_hash(body.password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id, LoginSession.id != request.state.session.id))
    db.commit()
    return {'ok': True}
