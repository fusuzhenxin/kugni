import copy
from datetime import timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest

from app.models import now
from app.station_monitor_adapters import tuzi_channels, betterstack_channels


class TuziSource:
    def __init__(self):
        current = now().replace(tzinfo=timezone.utc)
        self.ts = int((current - timedelta(minutes=5)).timestamp())
        self.groups = [{'group': 'Codex', 'has_samples': True, 'success_rate': 0,
            'latest_sample_ts': self.ts, 'hourly_series': [
                {'ts': self.ts - 3600, 'has_samples': True, 'success_rate': 0},
                {'ts': self.ts, 'has_samples': False, 'success_rate': 100}]},
            {'group': 'default', 'has_samples': False, 'success_rate': 100,
             'latest_sample_ts': self.ts, 'hourly_series': []}]
        self.model = 'gpt-exact'
    def get(self, url):
        if urlparse(url).path == '/api/pricing': return {'success': True, 'data': [{'model_name': 'gpt-exact'}]}
        assert parse_qs(urlparse(url).query)['model'] == ['gpt-exact']
        return {'success': True, 'data': {'model_name': self.model, 'groups': copy.deepcopy(self.groups)}}


def test_tuzi_exact_models_and_groups_preserve_zero_and_unknown_samples():
    result = tuzi_channels(TuziSource(), {'sourceBaseUrl': 'https://example.com', 'statusAdapter': '兔子API 模型性能', '_monitorModelIds': ['gpt-exact','removed-model']})
    a,b = result['modelChannels']
    assert a['modelIds'] == ['gpt-exact'] and a['group'] == 'Codex'
    assert a['windows']['24h']['successRate'] == 0
    assert [p['status'] for p in a['windows']['24h']['history']] == ['异常','未知']
    assert b['windows']['24h']['successRate'] is None and b['heartbeatAt'] == ''
    assert result['channels'][0]['modelIds'] == []
    assert result['historyWarnings'] and result['sourceUrl'].endswith('/pricing/status')


def test_tuzi_rejects_mismatched_models_and_missing_pricing_instead_of_fabricating_states():
    src = TuziSource()
    src.model = 'other-model'
    cfg = {'sourceBaseUrl': 'https://example.com', 'statusAdapter': '兔子API 模型性能', '_monitorModelIds': ['gpt-exact']}
    with pytest.raises(ValueError, match='不匹配'): tuzi_channels(src, cfg)
    with pytest.raises(ValueError, match='报价'): tuzi_channels(src, {**cfg, '_monitorModelIds': []})


def test_betterstack_parses_only_public_daily_history_without_assigning_models_or_heartbeat():
    today = now().replace(tzinfo=timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)
    yesterday = today-timedelta(days=1)
    class Source:
        def text(self, url):
            return '<div class="section" id="section-1"><div><svg aria-label="Operational"></svg><div>API platform</div><div>' + ''.join(
                '<div class="tick" data-tooltip-interval="'+date.strftime('%b %d, %Y')+'" data-html-tooltip-template="tick-tooltip-'+state+'"></div>'
                for date,state in [(yesterday,'operational'),(today,'unknown'),(today+timedelta(days=1),'operational')]) + '</div></div></div>'
    result = betterstack_channels(Source(), {'statusAdapter': 'Better Stack 状态页', 'statusPageUrl': 'https://example.com', 'sourceBaseUrl': 'https://console.example.com'})
    row = result['channels'][0]
    assert row['name'] == 'API platform' and row['heartbeatAt'] == '' and 'modelIds' not in row
    assert row['reportedStatus'] == '正常' and '具体模型' in row['note']
    assert len(row['history']) <= 2 and row['history'][0]['status'] == '正常'
    assert row['history'][0]['seconds'] == 86400


def test_betterstack_stops_on_changed_markup_or_verification_page():
    class Source:
        def text(self, url): return '<h1>Verify your browser</h1>'
    with pytest.raises(ValueError): betterstack_channels(Source(), {'statusPageUrl': 'https://example.com'})
