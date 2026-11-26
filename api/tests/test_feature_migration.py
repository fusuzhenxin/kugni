import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from app.db import Base


@pytest.mark.parametrize('legacy', [True, False])
def test_upgrade_preserves_events_and_accepts_fresh_schema(tmp_path, legacy):
    engine = create_engine('sqlite:///' + (tmp_path/'migration.db').as_posix())
    if not legacy:
        Base.metadata.create_all(engine)
    with engine.begin() as conn:
        if legacy:
            conn.execute(text('CREATE TABLE analytics_events (id VARCHAR(64) PRIMARY KEY, kind VARCHAR(20))'))
            conn.execute(text("INSERT INTO analytics_events (id,kind) VALUES ('existing-history','pageview')"))
        path = Path(__file__).resolve().parents[1]/'migrations/versions/0002_feature_completion.py'
        spec = importlib.util.spec_from_file_location('feature_migration', path)
        migration = importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        migration.upgrade()  # Safe to rerun after fresh metadata creation.
        columns = {c['name'] for c in inspect(conn).get_columns('analytics_events')}
        assert {'session_id','country','region','previous_path'} <= columns
        assert {'visitor_sessions','reward_code_digests'} <= set(inspect(conn).get_table_names())
        if legacy:
            row = conn.execute(text('SELECT id,country,session_id FROM analytics_events')).one()
            assert tuple(row) == ('existing-history','未知','')
    engine.dispose()
