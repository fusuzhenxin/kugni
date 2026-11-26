from sqlalchemy import delete, select

from app.db import SessionLocal
from app.models import AuditLog, Record, Role, User
from app.seed import seed_database
from .conftest import login, register


BASE = '/api/v1/admin/records/model-suggestions/'


def choices(client):
    return client.get('/api/v1/public/catalog/').json()['modelSuggestions']


def create(client, name, sort=0):
    return client.post(BASE, json={'values': {'name': name, 'sort': sort, 'status': '启用'}})


def test_defaults_and_public_projection(client):
    rows = choices(client)
    assert len(rows) == 52
    assert rows[0]['modelId'] == 'gpt-6.2-astra'
    assert {'gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6.1-sol', 'gpt-6.1-terra', 'claude-fable-5-1', 'claude-fable-5-2', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'} <= {r['modelId'] for r in rows}
    assert not any(r['modelId'].startswith('gpt-5') for r in rows)
    assert all(set(row) == {'modelId', 'sort'} for row in rows)
    login(client)
    modules = client.get('/api/v1/admin/context/').json()['modules']
    module = next(m for m in modules if m['key'] == 'model-suggestions')
    assert module['path'] == '/admin/models/suggestions/'
    assert set(module['bulkActions']) == {'edit', 'delete'}


def test_crud_pause_bulk_cache_and_audit(client):
    login(client)
    first = create(client, 'gpt-admin-test', 0).json()
    second = create(client, 'claude-admin-test', 1).json()
    assert choices(client)[0]['modelId'] == first['name']
    assert client.get(BASE).json()['items'][0]['id'] == first['id']
    edited = client.patch(BASE + first['id'] + '/', json={'values': {'name': 'gpt-renamed-test', 'sort': 2, 'version': first['version']}})
    assert edited.status_code == 200
    assert 'gpt-admin-test' not in {r['modelId'] for r in choices(client)}
    assert client.patch(BASE + first['id'] + '/', json={'values': {'sort': 3, 'version': first['version']}}).status_code == 409
    paused = client.post(BASE + first['id'] + '/actions/pause/', json={})
    assert paused.json()['item']['status'] == '停用'
    assert 'gpt-renamed-test' not in {r['modelId'] for r in choices(client)}
    assert client.post(BASE + first['id'] + '/actions/pause/', json={}).json()['item']['status'] == '启用'
    ids = [first['id'], second['id']]
    assert client.post(BASE + 'bulk/', json={'ids': ids, 'action': 'edit', 'values': {'sort': 5, 'status': '停用'}}).json()['processed'] == 2
    assert not {'gpt-renamed-test', second['name']} & {r['modelId'] for r in choices(client)}
    # Validation is atomic: the first update is rolled back when a later ID fails.
    assert client.post(BASE + 'bulk/', json={'ids': [first['id'], 'missing'], 'action': 'edit', 'values': {'status': '启用'}}).status_code == 404
    assert client.get(BASE + first['id'] + '/').json()['status'] == '停用'
    assert client.post(BASE + 'bulk/', json={'ids': ids, 'action': 'delete'}).json()['processed'] == 2
    assert client.get(BASE + first['id'] + '/').status_code == 404
    with SessionLocal() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.target_id == first['id']))
        events = list(db.scalars(select(Record).where(Record.module == 'cache-outbox')))
        assert len(events) >= 8
        assert all('catalog' in event.data['tags'] for event in events)


def test_validation_and_duplicates_include_disabled_models(client):
    login(client)
    for name in ['', 'has space', '<script>', 'a' * 161, ['gpt-test']]:
        assert create(client, name).status_code == 422
    for sort in [-1, 0.5, 'invalid', True, 1000001]:
        assert create(client, 'gpt-invalid-sort', sort).status_code == 422
    row = create(client, 'provider/gpt-custom:free').json()
    assert create(client, row['name']).status_code == 409
    client.post(BASE + row['id'] + '/actions/pause/', json={})
    assert create(client, row['name']).status_code == 409
    assert client.patch(BASE + row['id'] + '/', json={'values': {'name': 'gpt-6.2-astra'}}).status_code == 409
    assert client.patch(BASE + row['id'] + '/', json={'values': {'status': '已发布'}}).status_code == 422


def test_permissions_are_separate_from_read_and_other_surfaces(client):
    assert client.get(BASE).status_code == 401
    register(client)
    assert create(client, 'gpt-denied').status_code == 403
    for email in ['local-reviewer@kugni.com', 'local-publisher@kugni.com']:
        login(client, email)
        assert client.get(BASE).status_code == 403
        assert create(client, 'gpt-denied').status_code == 403
    with SessionLocal() as db:
        db.add(Role(id='suggestions-reader', name='常用模型只读', code='suggestions-reader', surface='platform', permissions=['platform.model-suggestions.read']))
        db.get(User, 'local-reviewer').role_id = 'suggestions-reader'
        db.commit()
    login(client, 'local-reviewer@kugni.com')
    assert client.get(BASE).status_code == 200
    assert create(client, 'gpt-denied').status_code == 403
    assert client.post(BASE + 'bulk/', json={'ids': ['any'], 'action': 'delete'}).status_code == 403


def test_restart_preserves_edits_and_does_not_restore_deleted_choices(client):
    login(client)
    row = client.get(BASE).json()['items'][0]
    client.patch(BASE + row['id'] + '/', json={'values': {'name': 'gpt-kept-edit', 'sort': 999, 'status': '停用'}})
    seed_database()
    assert client.get(BASE + row['id'] + '/').json()['name'] == 'gpt-kept-edit'
    assert 'gpt-kept-edit' not in {r['modelId'] for r in choices(client)}
    with SessionLocal() as db:
        db.execute(delete(Record).where(Record.module == 'model-suggestions'))
        db.commit()
    seed_database()
    seed_database()
    assert choices(client) == []
