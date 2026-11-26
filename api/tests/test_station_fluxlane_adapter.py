from datetime import timedelta, timezone

from app.models import now
from app.station_fluxlane_adapter import fluxlane_channels


def test_weekly_site_history_uses_beijing_dates_and_never_becomes_upstream_model_history():
    yesterday = (now().replace(tzinfo=timezone.utc) + timedelta(hours=8)).date() - timedelta(days=1)
    class Source:
        def get(self, url):
            assert url.endswith('/fluxlane-home/success-week.json')
            return {'days': [{'date': (yesterday - timedelta(days=6-i)).isoformat(), 'success_rate': None if i == 2 else 99.5} for i in range(7)],
                    'models': [{'name': 'gpt-a', 'success_rate': 99.7}], 'model_count': 10, 'success_rate': 99.3}
    result = fluxlane_channels(Source(), {'sourceBaseUrl': 'https://example.com', 'statusAdapter': 'FluxLane 公开调用表现'})
    group = result['channels'][0]
    assert len(group['windows']['7d']['history']) == 7
    assert group['windows']['7d']['history'][2]['status'] == '未知'
    assert group['windows']['7d']['history'][0]['at'].endswith('16:00:00+00:00')
    assert group['modelIds'] == [] and not group['heartbeatAt']
    model = result['modelChannels'][0]
    assert model['modelIds'] == ['gpt-a'] and model['windows']['7d']['history'] == []
    assert model['group'] != group['group']
    assert result['supportedRanges'] == ['7d'] and result['historyScope'] == 'site-wide'
