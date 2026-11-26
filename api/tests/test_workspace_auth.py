import pytest
from sqlalchemy import func, select
from app.db import SessionLocal
from app.models import LoginSession
from .conftest import login, register

API = '/api/v1/auth'


@pytest.mark.parametrize('email,surface,allowed', [
    ('admin@kugni.com', 'platform', True),
    ('local-reviewer@kugni.com', 'platform', True),
    ('local-publisher@kugni.com', 'publisher', True),
    ('admin@kugni.com', 'publisher', False),
    ('local-publisher@kugni.com', 'platform', False),
])
def test_workspace_login_checks_role_before_creating_session(client, email, surface, allowed):
    response = client.post(API + '/login/', json={
        'email': email, 'password': 'KugniTest!2026', 'surface': surface,
    })
    assert response.status_code == (200 if allowed else 403)
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(LoginSession)) == (1 if allowed else 0)
    session = client.get(API + '/session/').json()
    if allowed:
        assert session['user']['surface'] == surface
    else:
        assert session['user'] is None
        assert 'set-cookie' not in response.headers


def test_wrong_workspace_preserves_existing_member_session(client):
    register(client)
    cookie = client.cookies.get('kugni_session')
    response = client.post(API + '/login/', json={
        'email': 'member@example.com', 'password': 'KugniTest!2026', 'surface': 'platform',
    })
    assert response.status_code == 403
    assert client.cookies.get('kugni_session') == cookie
    assert client.get(API + '/session/').json()['user']['surface'] == 'member'
    # The public login remains compatible for existing accounts.
    login(client)
