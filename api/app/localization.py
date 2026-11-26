"""Persisted English translations. Never translate on a public request.

Only explicitly public editorial fields enter the queue. Credentials, reviews,
account profiles and test evidence are deliberately outside this allowlist.
"""
import hashlib
import json
import re
import subprocess
import sys
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import aliased

from .catalog import SHARED
from .config import settings
from .db import SessionLocal
from .models import Record, now

FIELDS = {
    'model-directory': ['name', 'summary', 'modelLabels', 'englishFallback'],
    'model-packages': ['name', 'summary', 'plans'],
    'stations': ['name', 'summary', 'description', 'promo', 'tags', 'seoTitle', 'seoDescription', 'channelLabels', 'pricingLabels'],
    'models': ['name', 'summary', 'description'],
    'categories': ['name', 'title', 'description'],
    'page-content': ['name', 'title', 'description', 'keywords', 'faq', 'document'],
    'articles': ['name', 'summary', 'body', 'seoTitle', 'seoDescription'],
    'seo': ['name', 'title', 'description', 'keywords'],
    'station-notices': ['name', 'body'],
    'coding-plans': ['name', 'description', 'summary', 'limits'],
    'resources': ['name', 'description'],
}
PUBLIC_STATUSES = {'已收录', '已发布', '启用'}
HAN = re.compile(r'[\u3400-\u9fff]')


def fingerprint(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def builtins():
    path = SHARED / 'locales' / 'en.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def strings(value, pointer=''):
    if isinstance(value, str) and HAN.search(value):
        yield pointer, value.strip()
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from strings(child, pointer + '/' + str(i))
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from strings(child, pointer + '/' + key)


def sync_record(db, record, dictionary=None):
    """Enqueue only changed public fields in the same transaction as publishing."""
    if record.module not in FIELDS or record.status not in PUBLIC_STATUSES:
        return
    dictionary = builtins() if dictionary is None else dictionary
    source_data = {**record.data, 'name': record.name}
    if record.module == 'model-directory':
        model = record.data.get('model') or {}
        source_data['modelLabels'] = [model.get('displayName', ''), model.get('license', ''),
                                      (model.get('organization') or {}).get('nameEn', ''),
                                      (model.get('bestRelay') or {}).get('siteName', ''),
                                      (model.get('officialPricing') or {}).get('unitLabel', ''),
                                      (model.get('officialPricing') or {}).get('unit', ''),
                                      (model.get('bestRelay') or {}).get('unitLabel', ''),
                                      (model.get('bestRelay') or {}).get('unit', '')]
        native = (model.get('description') or {}).get('en') or (model.get('subtitle') or {}).get('en')
        source_data['englishFallback'] = '' if native else (model.get('description') or {}).get('zh') or (model.get('subtitle') or {}).get('zh') or ''
        if native and source_data.get('summary') == (model.get('subtitle') or {}).get('zh'):
            source_data['summary'] = ''
    if record.module == 'stations':
        # Only public channel labels enter translation, never the complete source
        # snapshot, endpoints, timestamps, or worker configuration.
        source_data['channelLabels'] = list(dict.fromkeys(
            str(channel.get(key) or '') for channel in record.data.get('_channelSnapshot', {}).get('channels', [])
            for key in ['name', 'group'] if channel.get(key)
        ))
        pricing = db.scalar(select(Record).where(Record.module == 'source-pricing', Record.slug == record.slug))
        source_data['pricingLabels'] = list(dict.fromkeys(str(row['cells'][1]) for row in (pricing.data.get('rows', []) if pricing else []) if len(row.get('cells', [])) >= 2))
    expected = set()
    for field in FIELDS[record.module]:
        for pointer, source in strings(source_data.get(field), field):
            identity = 'en:' + record.id + ':' + pointer
            slot = 'tr-' + fingerprint(identity)[:48]
            expected.add(slot)
            row = db.get(Record, slot)
            digest = fingerprint(source)
            if row and row.data.get('sourceHash') == digest:
                # Newly bundled translations can complete previously queued work.
                if row.status in ['待翻译', '翻译失败'] and source in dictionary:
                    row.data = {**row.data, 'translation': dictionary[source], 'translatedHash': digest, 'error': ''}
                    row.status = '已翻译'
                continue
            previous = row.data if row else {}
            if not row:
                row = Record(id=slot, module='translations', slug=fingerprint(identity), name=record.name + ' · ' + pointer)
                db.add(row)
            manual = bool(previous.get('manual'))
            translated = dictionary.get(source, '') if not manual else ''
            row.data = {**previous, 'locale': 'en', 'recordId': record.id, 'module': record.module,
                        'field': pointer, 'source': source, 'sourceHash': digest,
                        'translation': translated or previous.get('translation', ''),
                        'translatedHash': digest if translated else previous.get('translatedHash', ''),
                        'manual': manual, 'attempts': 0, 'nextAttempt': '', 'error': ''}
            row.status = '待校对' if manual else '已翻译' if translated else '待翻译'
            row.version = (row.version or 0) + 1
    for old in db.scalars(select(Record).where(Record.module == 'translations', Record.data['recordId'].as_string() == record.id)):
        if old.id not in expected:
            db.delete(old)


def sync_all(db):
    dictionary = builtins()
    for record in db.scalars(select(Record).where(Record.module.in_(list(FIELDS)))):
        sync_record(db, record, dictionary)
    path = SHARED / 'locales' / 'sources.json'
    for source in json.loads(path.read_text(encoding='utf-8')) if path.exists() else []:
        if source in dictionary:
            continue
        identity = 'tr-ui-' + fingerprint(source)[:44]
        if not db.get(Record, identity):
            digest = fingerprint(source)
            db.add(Record(id=identity, module='translations', slug=fingerprint('ui:' + source), name='界面文字', status='待翻译',
                          data={'locale': 'en', 'recordId': 'ui', 'field': 'interface', 'source': source,
                                'sourceHash': digest, 'translation': '', 'translatedHash': '', 'manual': False,
                                'attempts': 0, 'nextAttempt': '', 'error': ''}))


def public_bundle(db):
    """Return current public translations only; stale/private data stays private."""
    public_ids = {'ui', *db.scalars(select(Record.id).where(Record.module.in_(list(FIELDS)), Record.status.in_(PUBLIC_STATUSES)))}
    dictionary, pending = {}, set()
    for row in db.scalars(select(Record).where(Record.module == 'translations')):
        data = row.data
        if data.get('recordId') in public_ids:
            if row.status == '已翻译' and data.get('sourceHash') == data.get('translatedHash'):
                dictionary[data['source']] = data['translation']
            else:
                pending.add(data['source'])
    return {'locale': 'en', 'dictionary': dictionary, 'pendingSources': sorted(pending - dictionary.keys())}


def valid_translation(source, translated):
    if not isinstance(translated, str) or not translated.strip() or HAN.search(translated): return False
    if translated.strip() == source.strip(): return False
    # Do not silently corrupt public links or replace them with hallucinated URLs.
    urls = lambda text: {value.rstrip('.,;:!?') for value in re.findall(r'https?://[^\s<>"\u3000\u3400-\u9fff，。；！？、（）【】)\]]+', text)}
    return urls(source) == urls(translated)


def reuse_translations(db):
    from .cache import enqueue_invalidation
    dictionary = builtins()
    rows = list(db.scalars(select(Record).where(Record.module == 'translations')))
    for row in rows:
        d = row.data
        if row.status == '已翻译' and d.get('sourceHash') == d.get('translatedHash') and valid_translation(d.get('source', ''), d.get('translation', '')):
            dictionary.setdefault(d['source'], d['translation'])
    count = 0
    for row in rows:
        d = row.data
        if d.get('manual') or row.status == '已翻译': continue
        translated = dictionary.get(d.get('source', ''))
        if translated and valid_translation(d['source'], translated):
            row.data = {**d, 'translation': translated, 'translatedHash': d['sourceHash'], 'error': '', 'nextAttempt': ''}
            row.status, row.version = '已翻译', row.version + 1
            count += 1
    if count: enqueue_invalidation(db, 'translations')
    return count


def translation_action(db, row, action, values):
    from fastapi import HTTPException
    from .cache import enqueue_invalidation
    if action == 'edit':
        if set(values) - {'translation', 'version'}:
            raise HTTPException(422, '只能编辑英文译文')
        if values.get('version') is not None and values['version'] != row.version:
            raise HTTPException(409, '中文或译文已更新，请刷新后重试')
        translated = str(values.get('translation', '')).strip()
        if not translated or len(translated) > 50000 or not valid_translation(row.data['source'], translated):
            raise HTTPException(422, '请填写有效的英文译文')
        row.data = {**row.data, 'translation': translated, 'translatedHash': row.data['sourceHash'], 'manual': True, 'error': ''}
        row.status = '已翻译'
    elif action == 'retry':
        row.data = {**row.data, 'manual': False, 'attempts': 0, 'nextAttempt': '', 'error': ''}
        row.status = '待翻译'
    else:
        raise HTTPException(422, '不支持的翻译操作')
    row.version += 1
    enqueue_invalidation(db, 'translations')
    return row


def process_one(translator=None):
    """One leased job, with stale-result protection and provider-wide backoff."""
    with SessionLocal() as db:
        provider = db.get(Record, 'translation-provider')
        if translator is None and provider and provider.data.get('nextAttempt', '') > now().isoformat():
            return False
        parent = aliased(Record)
        public_records = select(parent.id).where(parent.module.in_(list(FIELDS)), parent.status.in_(PUBLIC_STATUSES))
        rows = db.scalars(select(Record).where(Record.module == 'translations',
                         or_(Record.data['recordId'].as_string() == 'ui', Record.data['recordId'].as_string().in_(public_records)),
                         Record.status.in_(['待翻译', '翻译失败', '翻译中']),
                         Record.data['attempts'].as_integer() < 6,
                         Record.data['nextAttempt'].as_string() <= now().isoformat(),
                         or_(Record.status != '翻译中', Record.updated_at < now() - timedelta(minutes=5)))
                         .order_by(Record.updated_at).limit(1))
        row = next((r for r in rows if not r.data.get('manual') and r.data.get('attempts', 0) < 6
                    and r.data.get('nextAttempt', '') <= now().isoformat()
                    and (r.status != '翻译中' or r.updated_at < now() - timedelta(minutes=5))), None)
        if not row:
            return False
        version, source, digest, identity = row.version, row.data['source'], row.data['sourceHash'], row.id
        result = db.execute(update(Record).where(Record.id == identity, Record.version == version, Record.status == row.status)
                            .values(status='翻译中', version=version + 1, updated_at=now()))
        db.commit()
        if not result.rowcount:
            return False
    try:
        translated = (translator or translate_free)(source)
        if not isinstance(translated, str) or not translated.strip() or translated.strip() == source.strip():
            raise ValueError('Translation unavailable')
        failure = False
    except Exception:
        translated, failure = '', True
    with SessionLocal() as db:
        row = db.get(Record, identity)
        if not row or row.version != version + 1 or row.data['sourceHash'] != digest or row.data.get('manual'):
            return True
        attempts = row.data.get('attempts', 0) + 1
        row.data = {**row.data, 'attempts': attempts,
                    'nextAttempt': (now() + timedelta(minutes=min(360, 5 * 2 ** (attempts - 1)))).isoformat() if failure else '',
                    'error': '免费翻译通道暂不可用或限流；已保留原译文，稍后自动重试。' if failure else ''}
        row.status = '翻译失败' if failure else '已翻译'
        if not failure:
            row.data = {**row.data, 'translation': translated.strip(), 'translatedHash': digest}
            from .cache import enqueue_invalidation
            enqueue_invalidation(db, 'translations')
        elif translator is None:
            provider = db.get(Record, 'translation-provider')
            if not provider:
                provider = Record(id='translation-provider', module='translation-system', name='免费翻译通道', status='退避')
                db.add(provider)
            provider.data = {'nextAttempt': row.data['nextAttempt']}
        row.version += 1
        db.commit()
    return True


def translate_free(source):
    """MIT-licensed deep-translator, isolated so an upstream hang has a deadline."""
    result = subprocess.run([sys.executable, '-m', 'app.translation_provider'], input=json.dumps({'text': source}),
                            text=True, encoding='utf-8', capture_output=True, timeout=25, check=True)
    return json.loads(result.stdout)['translation']


def run_loop():
    import logging
    import time
    while True:
        try:
            from .translation_batch import process_batch
            worked = process_batch() if settings().translation_enabled else False
        except Exception:
            logging.getLogger('kugni.translation').exception('Translation queue failed')
            worked = False
        time.sleep(3 if worked else 15)
