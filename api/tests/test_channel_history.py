from datetime import timedelta, timezone

from app.channel_history import merge_snapshot, observation
from app.models import now
from app.station_source_adapters import channel_rows
from app.station_sources import public_snapshot
from app.models import Record


def test_legacy_identity_history_and_gaps_survive_collection_and_expiration(monkeypatch):
    current = now().replace(tzinfo=timezone.utc)
    earlier = (current - timedelta(hours=2)).isoformat()
    recent = current.isoformat()
    class Source:
        def get(self, path):
            return {'items': [{'id': i, 'name': 'group-' + str(i), 'provider': 'openai',
                              'primary_model': 'gpt-6.1-sol', 'primary_status': 'operational',
                              'timeline': [{'checked_at': recent, 'status': 'error'},
                                           {'checked_at': earlier, 'status': 'operational'}]} for i in [1, 2]]}
    snapshot = channel_rows(Source(), {'statusAdapter': 'Sub2API 渠道监控', 'sourceBaseUrl': 'https://example.com'})
    assert len({r['id'] for r in snapshot['channels']}) == 2
    assert snapshot['channels'][0]['modelIds'] == ['gpt-6.1-sol']
    assert snapshot['channels'][0]['status'] == '正常'
    merged = merge_snapshot(snapshot, snapshot)
    assert [p['at'] for p in merged['channels'][0]['history']] == [earlier, recent]
    assert observation((current + timedelta(hours=1)).isoformat(), 'operational') is None
    assert observation((current - timedelta(days=31)).isoformat(), 'error') is None
    monkeypatch.setattr('app.station_sources.now', lambda: current.replace(tzinfo=None) + timedelta(hours=3))
    stale = public_snapshot(Record(data={'_channelSnapshot': merged}))
    assert stale['channels'][0]['status'] == '未核验'
    assert stale['channels'][0]['history'] == merged['channels'][0]['history']
    assert merge_snapshot(snapshot, {**snapshot, 'sourceUrl': 'https://other.example', 'channels': []})['channels'] == []


def test_aggregate_ranges_keep_exact_models_separate_and_empty_ratio_unknown():
    instant = now().isoformat() + 'Z'
    class Source:
        def get(self, path):
            model = 'gpt-6.1-sol' if path.endswith('platform_group_model') else ''
            return {'coverage': {'data_through': instant, 'bucket_seconds': 3600}, 'items': [
                {'platform': 'openai', 'group_id': 1, 'group_name': 'GPT-Pro', 'model': model,
                 'metrics': {'success_rate': 0, 'request_count': 0}, 'health': {'overall': 'unknown'},
                 'buckets': [{'bucket_start': instant, 'health': {'overall': 'unknown'}}]},
                {'platform': 'openai', 'group_id': 2, 'group_name': 'GPT-Max', 'model': model,
                 'metrics': {'success_rate': .987654, 'request_count': 100}, 'health': {'overall': 'healthy'},
                 'buckets': [{'bucket_start': instant, 'health': {'overall': 'critical'}}]},
            ]}
    result = channel_rows(Source(), {'statusAdapter': 'Sub2API 聚合监控', 'sourceBaseUrl': 'https://example.com'})
    assert set(result['channels'][0]['windows']) == {'24h', '7d', '30d'}
    assert result['channels'][0]['windows']['24h']['successRate'] is None
    assert result['channels'][1]['windows']['7d']['successRate'] == 98.77
    assert result['channels'][1]['windows']['30d']['history'][0]['status'] == '异常'
    assert result['channels'][0]['modelIds'] == []
    assert result['channels'][1]['status'] == '正常'
    assert result['modelChannels'][0]['modelIds'] == ['gpt-6.1-sol']
    assert set(result['modelChannels'][0]['windows']) == {'24h'}


def test_optional_long_history_failure_keeps_valid_recent_data():
    class Source:
        def get(self, path):
            if 'range=7d' in path or 'range=30d' in path or 'platform_group_model' in path:
                raise ValueError('response too large')
            return {'items': [{'platform': 'openai', 'group_id': 1}], 'coverage': {}}
    result = channel_rows(Source(), {'statusAdapter': 'Sub2API 聚合监控', 'sourceBaseUrl': 'https://example.com'})
    assert len(result['channels']) == 1 and len(result['historyWarnings']) == 3
    assert result['channels'][0]['windows']['24h']['history'] == []
