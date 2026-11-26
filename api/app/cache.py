"""Transactional cache invalidation outbox; a failed web callback stays retryable."""
import httpx
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import Record


def enqueue_invalidation(db, module: str, slug: str | None = None):
    tags = ['catalog', 'sitemap']
    if module in ['model-directory', 'model-packages']:
        tags += ['imported-catalog', 'models', 'pricing', 'content']
    if module == 'translations':
        tags += ['translations', 'content', 'stations', 'models']
    if module in ['stations', 'categories', 'station-notices', 'submissions', 'reports', 'reviews']:
        tags += ['stations']
    if module in ['models', 'pricing', 'source-pricing', 'coding-plans']:
        tags += ['models', 'pricing', 'stations']
    if module in ['articles', 'seo', 'settings', 'page-content', 'resources']:
        tags += ['content']
    if module == 'stations' and slug:
        tags += ['station:' + slug]
    db.add(Record(module='cache-outbox', name='公开页面更新', status='pending', data={'tags': list(set(tags)), 'attempts': 0}))


def flush_invalidations():
    with SessionLocal() as db:
        events = list(db.scalars(select(Record).where(Record.module == 'cache-outbox', Record.status == 'pending').limit(20)))
        if not events:
            return
        try:
            with httpx.Client(timeout=5, trust_env=False) as client:
                response = client.post(settings().web_internal_url.rstrip('/') + '/api/revalidate/', headers={'Authorization': 'Bearer ' + settings().revalidate_secret}, json={'tags': list({tag for event in events for tag in event.data['tags']})})
                response.raise_for_status()
            for event in events:
                event.status = 'delivered'
        except httpx.HTTPError:
            for event in events:
                event.data = {**event.data, 'attempts': event.data.get('attempts', 0) + 1}
        db.commit()
