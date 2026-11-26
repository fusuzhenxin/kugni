from sqlalchemy import select

from app.db import SessionLocal
from app.models import Record
from app.seed import seed_database


def test_sitemap_keeps_model_fingerprint_tool(client):
    paths = {row['path'] for row in client.get('/api/v1/public/sitemap/').json()['items']}
    assert '/tools/model-fingerprint/' in paths
    assert '/models/openai/' in paths
    assert '/tools/model-fingerprint/report/' not in paths


def test_model_ecosystems_upgrade_without_overwriting_edits(client):
    with SessionLocal() as db:
        model = db.get(Record, 'model-qwen')
        db.delete(model)
        model = db.get(Record, 'model-grok')
        model.status = '停用'
        model.data = {**model.data, 'summary': '站长维护的模型介绍'}
        db.commit()
    seed_database()
    seed_database()
    with SessionLocal() as db:
        models = list(db.scalars(select(Record).where(Record.module == 'models')))
        assert len(models) == 8
        assert db.get(Record, 'model-grok').status == '停用'
        assert db.get(Record, 'model-grok').data['summary'] == '站长维护的模型介绍'
    catalog = client.get('/api/v1/public/catalog/').json()
    assert {m['slug'] for m in catalog['models']} == {
        'openai', 'claude', 'gemini', 'deepseek', 'qwen', 'kimi', 'glm',
    }
