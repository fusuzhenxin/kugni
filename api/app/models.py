"""Relational identities, money/points, credentials, reports and flexible editorial data."""
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def uid() -> str:
    return uuid4().hex


class Role(Base):
    __tablename__ = 'roles'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(80))
    code: Mapped[str] = mapped_column(String(64), unique=True)
    surface: Mapped[str] = mapped_column(String(20), default='platform')
    scope: Mapped[str] = mapped_column(String(10), default='all')
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    protected: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text, default='')


class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    role_id: Mapped[str] = mapped_column(ForeignKey('roles.id'))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    profile: Mapped[dict] = mapped_column(JSON, default=dict)
    invited_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LoginSession(Base):
    __tablename__ = 'sessions'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Record(Base):
    __tablename__ = 'records'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    module: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(240))
    slug: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, default='草稿')
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True, index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    __table_args__ = (UniqueConstraint('module', 'slug', name='uq_record_module_slug'), Index('ix_records_module_status', 'module', 'status'))


class PageRedirect(Base):
    __tablename__ = 'page_redirects'
    path: Mapped[str] = mapped_column(String(240), primary_key=True)
    destination: Mapped[str] = mapped_column(String(240))


class Wallet(Base):
    __tablename__ = 'wallets'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)


class Ledger(Base):
    __tablename__ = 'points_ledger'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    event_key: Mapped[str] = mapped_column(String(180))
    title: Mapped[str] = mapped_column(String(240))
    amount: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (UniqueConstraint('user_id', 'event_key', name='uq_ledger_event'),)


class Evidence(Base):
    __tablename__ = 'task_evidence'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    kind: Mapped[str] = mapped_column(String(80))
    day: Mapped[str] = mapped_column(String(10))
    __table_args__ = (UniqueConstraint('user_id', 'kind', 'day', name='uq_task_evidence'),)


class Favorite(Base):
    __tablename__ = 'favorites'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    station_id: Mapped[str] = mapped_column(ForeignKey('records.id', ondelete='CASCADE'), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Credential(Base):
    __tablename__ = 'credentials'
    id: Mapped[str] = mapped_column(ForeignKey('records.id', ondelete='CASCADE'), primary_key=True)
    encrypted_secret: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(20))


class RewardCodeDigest(Base):
    __tablename__ = 'reward_code_digests'
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey('records.id', ondelete='CASCADE'), index=True)


class Execution(Base):
    __tablename__ = 'executions'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey('records.id', ondelete='SET NULL'), nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(32), default='queued', index=True)
    targets: Mapped[list] = mapped_column(JSON, default=list)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    total: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, default='')
    dedupe_key: Mapped[str | None] = mapped_column(String(180), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Report(Base):
    __tablename__ = 'reports'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    execution_id: Mapped[str] = mapped_column(ForeignKey('executions.id', ondelete='CASCADE'), index=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True, index=True)
    station_id: Mapped[str | None] = mapped_column(ForeignKey('records.id', ondelete='SET NULL'), nullable=True)
    model: Mapped[str] = mapped_column(String(180))
    test_type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default='待审核', index=True)
    visibility: Mapped[str] = mapped_column(String(20), default='内部可见')
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    share_token: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AnalyticsEvent(Base):
    __tablename__ = 'analytics_events'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    visitor: Mapped[str] = mapped_column(String(64), index=True)
    path: Mapped[str] = mapped_column(String(500))
    referrer: Mapped[str] = mapped_column(String(240), default='')
    device: Mapped[str] = mapped_column(String(24), default='desktop')
    campaign_id: Mapped[str | None] = mapped_column(ForeignKey('records.id', ondelete='SET NULL'), nullable=True, index=True)
    duration: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    session_id: Mapped[str] = mapped_column(String(64), default='', index=True)
    previous_path: Mapped[str] = mapped_column(String(500), default='')
    country: Mapped[str] = mapped_column(String(80), default='未知')
    region: Mapped[str] = mapped_column(String(100), default='未知')


class VisitorSession(Base):
    __tablename__ = 'visitor_sessions'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    visitor: Mapped[str] = mapped_column(String(64), index=True)
    entry_path: Mapped[str] = mapped_column(String(500))
    last_path: Mapped[str] = mapped_column(String(500))
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    module: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str] = mapped_column(String(100), default='')
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class RateBucket(Base):
    __tablename__ = 'rate_buckets'
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
