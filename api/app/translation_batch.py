"""Small, deduplicated public translation batches with durable leases and backoff."""
import json
import subprocess
import sys
from datetime import timedelta

from sqlalchemy import select, update

from .db import SessionLocal
from .localization import FIELDS, PUBLIC_STATUSES, reuse_translations, valid_translation
from .models import Record, now


def free_batch(sources):
    result = subprocess.run([sys.executable, '-m', 'app.translation_provider'], input=json.dumps({'texts': sources}),
        encoding='utf-8', text=True, capture_output=True, timeout=55, check=True)
    return json.loads(result.stdout)['translations']


def process_batch(translator=None):
    with SessionLocal() as db:
        provider = db.get(Record, 'translation-provider')
        if translator is None and provider and provider.data.get('nextAttempt', '') > now().isoformat(): return False
        reused = reuse_translations(db)
        db.commit()
        public = {'ui', *db.scalars(select(Record.id).where(Record.module.in_(FIELDS), Record.status.in_(PUBLIC_STATUSES)))}
        rows = [r for r in db.scalars(select(Record).where(Record.module == 'translations',
                    Record.status.in_(['待翻译', '翻译失败', '翻译中'])))
                if r.data.get('recordId') in public and not r.data.get('manual') and r.data.get('attempts', 0) < 6
                and r.data.get('nextAttempt', '') <= now().isoformat()
                and (r.status != '翻译中' or r.updated_at < now() - timedelta(minutes=5))]
        def priority(row):
            module, field = row.data.get('module', 'ui'), row.data.get('field', '')
            return (0 if module == 'ui' else 1 if module in ['stations', 'seo', 'categories', 'page-content'] else 3 if module == 'station-notices' else 2,
                    0 if field.endswith(('name', 'title', 'summary', 'description')) else 1, row.updated_at)
        rows.sort(key=lambda row: (*priority(row), row.id))
        busy_hashes = {r.data.get('sourceHash') for r in db.scalars(select(Record).where(Record.module == 'translations', Record.status == '翻译中', Record.updated_at >= now() - timedelta(minutes=5)))}
        selected, hashes, size = [], set(busy_hashes), 0
        for row in rows:
            source = row.data['source']
            if row.data['sourceHash'] in hashes: continue
            if selected and (size + len(source) > 2600 or len(selected) >= 16): continue
            if len(source) > 18000:
                row.data = {**row.data, 'error': '正文超过自动翻译上限，请分段人工校对', 'attempts': 6}
                row.status = '翻译失败'
                continue
            if selected and len(source) > 2600: continue
            version = row.version
            lease = db.execute(update(Record).where(Record.id == row.id, Record.version == version, Record.status == row.status)
                               .values(status='翻译中', version=version + 1, updated_at=now()))
            if not lease.rowcount:
                hashes.add(row.data['sourceHash'])
                continue
            selected.append({'id': row.id, 'version': version + 1, 'source': source, 'digest': row.data['sourceHash']})
            hashes.add(row.data['sourceHash'])
            size += len(source)
            if size >= 2600: break
        db.commit()
        if not selected: return bool(reused)
    try:
        translations = (translator or free_batch)([r['source'] for r in selected])
        if not isinstance(translations, list) or len(translations) != len(selected): raise ValueError('Invalid batch result')
        failure = ''
    except Exception:
        translations = [''] * len(selected)
        failure = '免费翻译通道暂不可用或限流；保留原文，自动退避后重试'
    from .cache import enqueue_invalidation
    with SessionLocal() as db:
        completed = 0
        invalid = 0
        for lease, translated in zip(selected, translations):
            row = db.get(Record, lease['id'])
            if not row or row.version != lease['version'] or row.data.get('sourceHash') != lease['digest'] or row.data.get('manual'): continue
            attempts = row.data.get('attempts', 0) + 1
            valid = not failure and valid_translation(lease['source'], translated)
            message = failure or ('' if valid else '译文残留中文或链接发生变化，请人工校对')
            row.data = {**row.data, 'attempts': attempts, 'error': message,
                'nextAttempt': (now() + timedelta(minutes=min(360, 5 * 2 ** (attempts - 1)))).isoformat() if not valid else ''}
            row.status = '已翻译' if valid else '翻译失败'
            if valid:
                row.data = {**row.data, 'translation': translated.strip(), 'translatedHash': lease['digest']}
                completed += 1
            else: invalid += 1
            if not valid:
                # The same failed source must not immediately be resent through
                # another record that happens to contain identical text.
                duplicates = db.scalars(select(Record).where(Record.module == 'translations',
                    Record.id != row.id, Record.data['sourceHash'].as_string() == lease['digest'],
                    Record.status.in_(['待翻译', '翻译失败'])))
                for duplicate in duplicates:
                    if duplicate.data.get('manual') or duplicate.data.get('source') != lease['source']: continue
                    duplicate.data = {**duplicate.data, 'attempts': max(attempts, duplicate.data.get('attempts', 0)),
                                      'nextAttempt': row.data['nextAttempt'], 'error': message}
                    duplicate.status, duplicate.version = '翻译失败', duplicate.version + 1
            row.version += 1
        if completed:
            db.flush()
            reuse_translations(db)
            enqueue_invalidation(db, 'translations')
        provider = db.get(Record, 'translation-provider')
        if not provider:
            provider = Record(id='translation-provider', module='translation-system', name='免费英文翻译', data={})
            db.add(provider)
        provider.status = '退避' if failure else '可用'
        provider.data = {**provider.data, 'nextAttempt': (now() + timedelta(minutes=5)).isoformat() if failure else '',
                         'lastSuccess': now().isoformat() if completed else provider.data.get('lastSuccess', ''),
                         'lastError': failure or (f'{invalid} 条译文需校对' if invalid else ''), 'lastBatchSize': len(selected)}
        db.commit()
    return True
