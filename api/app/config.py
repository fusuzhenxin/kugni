from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / 'api/.env', extra='ignore')
    environment: str = 'development'
    database_url: str = 'postgresql+psycopg://kugni:kugni@127.0.0.1:5432/kugni'
    site_url: str = 'https://www.kugni.com'
    browser_origin: str = 'http://127.0.0.1:3000'
    web_internal_url: str = 'http://127.0.0.1:3000'
    secret_key: str
    encryption_key: str
    revalidate_secret: str
    session_days: int = 7
    allow_private_targets: bool = False
    cookie_secure: bool = False
    bootstrap_email: str = 'admin@kugni.com'
    bootstrap_password: str = ''
    storage_dir: str = str(ROOT / 'storage')
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_user: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    geoip_database: str = ''
    translation_enabled: bool = True
    translation_proxy_url: str = ''
    station_source_proxy_url: str = ''
    station_source_dns_url: str = ''


@lru_cache
def settings() -> Settings:
    value = Settings()
    if len(value.secret_key) < 32 or len(value.revalidate_secret) < 32:
        raise RuntimeError('SECRET_KEY and REVALIDATE_SECRET must be at least 32 characters')
    if value.environment == 'production' and (not value.cookie_secure or value.allow_private_targets):
        raise RuntimeError('Production requires secure cookies and public-only detection targets')
    return value
