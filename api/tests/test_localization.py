from sqlalchemy import delete, select

from app.db import SessionLocal
from app.localization import public_bundle, process_one, sync_all, sync_record, translation_action
from app.models import Record
from .conftest import login


def fixture_station():
    with SessionLocal() as db:
        db.execute(delete(Record).where(Record.module == 'translations'))
        station = db.get(Record, 's1') or db.scalar(select(Record).where(Record.module == 'stations'))
        station.name = 'Translation Fixture'
        station.data = {**station.data, 'summary': '这是更新后的站点介绍，必须等待对应英文完成。', 'name': station.name}
        # Keep the test to a single queue item rather than touching an upstream.
        for key in ['description', 'promo', 'tags', 'seoTitle', 'seoDescription']:
            station.data = {**station.data, key: ''}
        sync_record(db, station)
        db.commit()
        return station.id


def slot(db, station_id):
    return db.scalar(select(Record).where(Record.module == 'translations', Record.data['recordId'].as_string() == station_id))


def test_edit_publishes_chinese_and_queues_english_without_network(client):
    station_id = fixture_station()
    login(client)
    changed = '新的中文介绍立即发布，而英文在后台处理。'
    response = client.patch('/api/v1/admin/records/stations/' + station_id + '/', json={'values': {'summary': changed}})
    assert response.status_code == 200
    slug = response.json()['slug']
    assert client.get('/api/v1/public/stations/' + slug + '/').json()['summary'] == changed
    bundle = client.get('/api/v1/public/localization/').json()
    assert changed in bundle['pendingSources']
    assert changed not in bundle['dictionary']
    seen = []
    assert process_one(lambda text: seen.append(text) or 'Updated English description.')
    assert seen == [changed]
    assert client.get('/api/v1/public/localization/').json()['dictionary'][changed] == 'Updated English description.'


def test_late_translation_cannot_overwrite_new_chinese_or_reviewed_english(client):
    station_id = fixture_station()
    new_source = '翻译执行期间再次修改的介绍。'
    def delayed(_):
        with SessionLocal() as db:
            station = db.get(Record, station_id)
            station.data = {**station.data, 'summary': new_source}
            sync_record(db, station)
            db.commit()
        return 'Outdated result.'
    process_one(delayed)
    with SessionLocal() as db:
        row = slot(db, station_id)
        assert row.status == '待翻译'
        assert row.data['source'] == new_source
        assert row.data['translation'] != 'Outdated result.'
        translation_action(db, row, 'edit', {'translation': 'Reviewed English.'})
        station = db.get(Record, station_id)
        station.data = {**station.data, 'summary': '人工校对后再次改变的中文。'}
        sync_record(db, station)
        db.commit()
        assert row.status == '待校对'
        assert row.data['translation'] == 'Reviewed English.'
        assert row.data['source'] not in public_bundle(db)['dictionary']
    assert process_one(lambda _: 'Must not overwrite') is False


def test_failed_provider_is_retryable_and_does_not_publish_stale_translation(client):
    station_id = fixture_station()
    def failed(_):
        raise RuntimeError('Upstream unavailable')
    assert process_one(failed)
    with SessionLocal() as db:
        row = slot(db, station_id)
        assert row.status == '翻译失败'
        assert row.data['attempts'] == 1
        assert row.data['nextAttempt']
        assert row.data['source'] in public_bundle(db)['pendingSources']
        row_id = row.id
    assert process_one(lambda _: 'Should wait') is False
    login(client)
    response = client.post('/api/v1/admin/records/translations/bulk/', json={'ids': [row_id], 'action': 'retry', 'values': {}})
    assert response.status_code == 200
    assert process_one(lambda _: 'A valid translation.')


def test_private_sources_never_enter_public_bundle_or_provider(client):
    station_id = fixture_station()
    with SessionLocal() as db:
        station = db.get(Record, station_id)
        station.status = '草稿'
        secret = Record(module='test-keys', name='私有凭证', status='启用', data={'secret': '不会发送的秘密'})
        draft = Record(module='articles', name='未发布文章', status='草稿', data={'body': '尚未公开的文章内容'})
        db.add_all([secret, draft])
        db.flush()
        sync_record(db, secret)
        sync_record(db, draft)
        db.commit()
        assert not public_bundle(db)['dictionary']
        assert not public_bundle(db)['pendingSources']
    assert process_one(lambda _: 'Must not send') is False
    login(client, 'local-publisher@kugni.com')
    response = client.get('/api/v1/admin/records/translations/')
    assert response.status_code == 403
