from sqlalchemy import delete, select

from app.db import SessionLocal
from app.localization import fingerprint, public_bundle, translation_action
from app.localization import valid_translation
from app.models import Record
from app.translation_batch import process_batch


def slots():
    with SessionLocal() as db:
        db.execute(delete(Record).where(Record.module == 'translations'))
        result = []
        for index, source in enumerate(['同一段公开介绍。', '同一段公开介绍。', '另一段公开文字。']):
            row = Record(module='translations', name='Batch fixture', status='待翻译', data={
                'recordId': 'ui', 'field': 'interface', 'source': source, 'sourceHash': fingerprint(source),
                'translatedHash': '', 'translation': '', 'manual': False, 'attempts': 0, 'nextAttempt': ''})
            db.add(row); db.flush(); result.append(row.id)
        db.commit()
        return result


def test_batch_deduplicates_and_reuses_exact_text_without_sending_private_records():
    ids = slots()
    with SessionLocal() as db:
        db.add(Record(module='translations', name='Private fixture', status='待翻译', data={
            'recordId': 'private-key', 'source': '不可发出的凭证备注。', 'sourceHash': 'private', 'attempts': 0, 'nextAttempt': ''}))
        db.commit()
    seen = []
    assert process_batch(lambda sources: seen.extend(sources) or ['A public description.', 'Another public text.'])
    assert seen == ['同一段公开介绍。', '另一段公开文字。']
    with SessionLocal() as db:
        assert all(db.get(Record, identity).status == '已翻译' for identity in ids)
        assert not public_bundle(db)['pendingSources']


def test_batch_stale_results_cannot_replace_new_source_or_manual_translation():
    ids = slots()
    def late(sources):
        with SessionLocal() as db:
            row = db.get(Record, ids[0])
            row.version += 1
            row.data = {**row.data, 'source': '更新后的原文。', 'sourceHash': fingerprint('更新后的原文。')}
            row.status = '待翻译'
            translation_action(db, db.get(Record, ids[2]), 'edit', {'translation': 'Reviewed text.'})
            db.commit()
        return ['Old English.', 'Must not replace reviewed text.']
    process_batch(late)
    with SessionLocal() as db:
        assert db.get(Record, ids[0]).status == '待翻译'
        assert db.get(Record, ids[2]).data['translation'] == 'Reviewed text.'


def test_batch_rejects_remaining_chinese_or_corrupted_links_and_backs_off():
    ids = slots()
    assert process_batch(lambda sources: ['还是中文。', 'Valid English.'])
    with SessionLocal() as db:
        assert db.get(Record, ids[0]).status == '翻译失败'
        assert db.get(Record, ids[2]).status == '已翻译'
    assert process_batch(lambda sources: ['Should wait.']) is False


def test_translation_preserves_links_but_does_not_treat_adjacent_chinese_as_url():
    source = '积分计费，见https://www.example.com/docs/123。'
    assert valid_translation(source, 'Credits billing: https://www.example.com/docs/123.')
    assert valid_translation(source, 'Credits billing: https://www.example.com/docs/123')
    assert not valid_translation(source, 'Credits billing: https://evil.example/docs/123')
