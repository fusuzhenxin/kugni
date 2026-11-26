import os
import tempfile
from pathlib import Path
import pytest
from cryptography.fernet import Fernet

_tmp = tempfile.TemporaryDirectory(prefix='kugni-tests-')
os.environ.update(DATABASE_URL='sqlite:///' + (Path(_tmp.name) / 'test.db').as_posix(), ENVIRONMENT='development', SECRET_KEY='test-secret-' * 5, REVALIDATE_SECRET='test-revalidate-' * 4, ENCRYPTION_KEY=Fernet.generate_key().decode(), BOOTSTRAP_PASSWORD='KugniTest!2026', BROWSER_ORIGIN='http://testserver', WEB_INTERNAL_URL='http://127.0.0.1:1', STORAGE_DIR=_tmp.name)

from fastapi.testclient import TestClient
from app.db import Base, engine, SessionLocal
from app.main import app
from app.seed import seed_database
MAILBOX = {}


@pytest.fixture(scope='session', autouse=True)
def cleanup():
    yield
    engine.dispose()
    _tmp.cleanup()


@pytest.fixture(autouse=True)
def database(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed_database()
    monkeypatch.setattr('app.admin.flush_invalidations', lambda: None)
    monkeypatch.setattr('app.commerce.flush_invalidations', lambda: None)
    MAILBOX.clear()
    monkeypatch.setattr('app.email_verification.deliver_code', lambda email, code: MAILBOX.update({email: code}))
    yield


@pytest.fixture
def client():
    with TestClient(app) as client: yield client


def login(client, email='admin@kugni.com', password='KugniTest!2026'):
    response = client.post('/api/v1/auth/login/', json={'email': email, 'password': password})
    assert response.status_code == 200, response.text
    client.headers['x-csrf-token'] = response.json()['csrf']
    return response.json()['user']


def register(client, name='测试用户', email='member@example.com', invite=''):
    sent = client.post('/api/v1/auth/email-code/', json={'email': email})
    assert sent.status_code == 200, sent.text
    response = client.post('/api/v1/auth/register/', json={'name': name, 'email': email, 'password': 'KugniTest!2026', 'invite': invite, 'code': MAILBOX[email]})
    assert response.status_code == 201, response.text
    client.headers['x-csrf-token'] = response.json()['csrf']
    return response.json()['user']
