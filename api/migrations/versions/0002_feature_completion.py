"""Session analytics, preserving existing events and deployments."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    # 0001 creates current metadata on a fresh installation; old installations
    # need explicit additions. Never recreate or discard their event history.
    bind = op.get_bind()
    columns = {c['name'] for c in inspect(bind).get_columns('analytics_events')}
    for name, length, default in [('session_id', 64, ''), ('previous_path', 500, ''), ('country', 80, '未知'), ('region', 100, '未知')]:
        if name not in columns:
            op.add_column('analytics_events', sa.Column(name, sa.String(length), nullable=False, server_default=default))
    if 'ix_analytics_events_session_id' not in {i['name'] for i in inspect(bind).get_indexes('analytics_events')}:
        op.create_index('ix_analytics_events_session_id', 'analytics_events', ['session_id'])
    from app.models import VisitorSession, RewardCodeDigest
    VisitorSession.__table__.create(bind, checkfirst=True)
    RewardCodeDigest.__table__.create(bind, checkfirst=True)


def downgrade():
    op.drop_table('reward_code_digests')
    op.drop_table('visitor_sessions')
    op.drop_index('ix_analytics_events_session_id', table_name='analytics_events')
    for name in ['region', 'country', 'previous_path', 'session_id']:
        op.drop_column('analytics_events', name)
