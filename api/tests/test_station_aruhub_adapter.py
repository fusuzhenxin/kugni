import copy
from datetime import timezone

import httpx
import pytest

from app.models import now
from app.station_aruhub_adapter import aruhub_channels, parse_window


class Source:
    def __init__(self):
        self.groups = [
            {'group': 'GPT-Pro', 'summary': {'has_data': True, 'success_rate': 96},
             'recent_calls': [{'model_name': 'gpt-a', 'success': True, 'latency_ms': 1000},
                              {'model_name': 'gpt-b', 'success': False, 'latency_ms': 500},
                              {'model_name': 'gpt-a', 'success': False, 'latency_ms': 2000}]},
            {'group': 'Empty', 'summary': {'has_data': False, 'success_rate': 100}, 'recent_calls': []},
            {'group': 'Zero', 'summary': {'has_data': True, 'success_rate': 0}, 'recent_calls': []}]
        self.broken_week = False
        self.broken_day = False
    def get(self, url):
        if url.endswith('/api/pricing'):
            return {'success': True, 'usable_group': {'GPT-Pro': {}, 'Empty': {}, 'Zero': {}}}
        minutes = int(url.split('minutes=')[1])
        if minutes == 1440 and self.broken_day:
            raise httpx.ReadTimeout('timeout')
        if minutes == 10080 and self.broken_week:
            raise httpx.HTTPStatusError('unavailable', request=httpx.Request('GET', url), response=httpx.Response(503))
        return {'success': True, 'data': {'updated_at': now().replace(tzinfo=timezone.utc).timestamp(),
                'window_minutes': minutes, 'groups': copy.deepcopy(self.groups)}}


CFG = {'sourceBaseUrl': 'https://example.com', 'statusAdapter': 'AruHub 渠道状态'}


def test_aruhub_keeps_call_order_without_inventing_a_timeline_or_model_group_rates():
    result = aruhub_channels(Source(), CFG)
    group, empty, zero = result['channels']
    assert group['modelIds'] == [] and group['windows']['24h']['successRate'] == 96
    calls = group['windows']['24h']['recentCalls']
    assert [c['success'] for c in calls] == [True, False, False]
    assert all('at' not in c and 'time' not in c for c in calls)
    assert group['heartbeatAt'] == '' and 'history' not in group['windows']['24h']
    assert empty['windows']['24h']['successRate'] is None and empty['status'] == '未知'
    assert zero['windows']['24h']['successRate'] == 0 and zero['status'] == '异常'
    a,b = result['modelChannels']
    assert a['modelIds'] == ['gpt-a'] and a['group'] == 'GPT-Pro'
    assert a['windows']['24h']['sampleSuccessRate'] == 50
    assert b['windows']['24h']['sampleSuccessRate'] == 0
    assert 'successRate' not in a['windows']['24h']
    assert result['supportedRanges'] == ['24h','7d'] and result['historyKind'] == 'ordered-calls'


def test_aruhub_optional_week_failure_preserves_day_and_exposes_only_available_windows():
    source = Source()
    source.broken_week = True
    result = aruhub_channels(source, CFG)
    assert result['supportedRanges'] == ['24h'] and result['historyWarnings']
    assert result['channels'][0]['windows']['24h']['recentCalls']


def test_aruhub_day_timeout_falls_back_to_actual_short_window_without_relabelling():
    source = Source()
    source.broken_day = source.broken_week = True
    result = aruhub_channels(source, CFG)
    assert result['supportedRanges'] == ['90m']
    assert len(result['historyWarnings']) == 2
    assert '24h' not in result['channels'][0]['windows']
    assert result['channels'][0]['windows']['90m']['successRate'] == 96
    assert result['modelChannels'][0]['windows']['90m']['sampleSuccessRate'] == 50


def test_aruhub_rejects_wrong_window_invalid_success_and_duplicate_groups():
    source = Source()
    data = source.get('https://example.com/api/channel-status?minutes=1440')['data']
    with pytest.raises(ValueError, match='窗口'): parse_window(data, 10080)
    data['groups'][0]['recent_calls'][0]['success'] = 'true'
    with pytest.raises(ValueError, match='结果'): parse_window(data, 1440)
    data = source.get('https://example.com/api/channel-status?minutes=1440')['data']
    data['groups'].append(data['groups'][0])
    with pytest.raises(ValueError, match='重复'): parse_window(data, 1440)
