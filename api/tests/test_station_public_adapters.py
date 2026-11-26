import copy
import json
from datetime import timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException

from app.models import now
from app.station_sources import PublicSource
from app.station_public_adapters import public_notices, public_channels


class Source:
    def __init__(self, values): self.values = values
    def get(self, url): return copy.deepcopy(self.values[url])
    def text(self, url): return self.values[url]


def test_right_public_announcements_deduplicate_audiences_strip_markup_and_keep_ids():
    item = {'id': 'notice-123', 'created_time': 1793295342, 'description': '<h3>维护通知</h3><p>已恢复</p><script>bad()</script>'}
    src = Source({'https://example.com/configs': {'public.notice': json.dumps({'admin': [item], 'user': [item]})}})
    rows, warnings = public_notices(src, {'sourceAdapter': 'RightCode', 'sourceBaseUrl': 'https://example.com'})
    assert len(rows) == 1 and not warnings
    assert rows[0]['identity'] == 'right:notice-123' and rows[0]['name'] == '维护通知'
    assert rows[0]['body'] == '维护通知\n已恢复' and rows[0]['publishedAt'].startswith('2026-10-29T17:35:42')


def test_packy_imports_full_archive_and_302_uses_real_announcement_success_code():
    src = Source({'https://example.com/api/announcements': {'success': True, 'data': [
        {'id': i, 'title': '通知', 'content': '内容', 'publishDate': '2026-11-01'} for i in range(1, 136)]},
        'https://example.com/proxy/announcements': {'code': 0, 'data': {'id': 50, 'title': '技术交流群', 'content': '<p>交流通知</p>', 'modified_on': 1753757342}}})
    rows, _ = public_notices(src, {'sourceAdapter': 'PackyCode 公告', 'sourceBaseUrl': 'https://example.com'})
    assert len(rows) == 135 and rows[-1]['identity'] == 'packy:135'
    rows, _ = public_notices(src, {'sourceAdapter': '302.AI', 'sourceBaseUrl': 'https://example.com'})
    assert rows[0]['identity'] == '302:50'
    src.values['https://example.com/proxy/announcements']['code'] = -1
    with pytest.raises(ValueError): public_notices(src, {'sourceAdapter': '302.AI', 'sourceBaseUrl': 'https://example.com'})


def test_xisu_uses_stable_article_id_and_page_date_and_fails_on_access_page():
    url = 'https://example.com/resources/announcements'
    html = '<link rel="canonical" href="'+url+'"><h1>官方公告</h1><article id="notice-3"><div><p>08</p><p>2026-11</p></div><div><h2>恢复通知</h2><div class="whitespace-pre-line">服务恢复<script>bad()</script></div></div></article>'
    source = Source({url: html})
    rows, _ = public_notices(source, {'sourceAdapter': '犀速 AI 公告页', 'sourceBaseUrl': 'https://example.com'})
    assert rows[0]['identity'] == 'xisu:notice-3' and rows[0]['publishedAt'] == '2026-11-08'
    assert rows[0]['body'] == '服务恢复'
    source.values[url] = '<h1>Just a moment</h1>'
    with pytest.raises(ValueError): public_notices(source, {'sourceAdapter': '犀速 AI 公告页', 'sourceBaseUrl': 'https://example.com'})


def test_onlineornot_reads_public_components_and_rss_without_executing_scripts():
    base = 'https://example.com'
    src = Source({base: '<script>components:$R[18]=[$R[19]={id:"public-1",name:"Claude-Compatible",status:"OPERATIONAL",groupId:null}]};throw new Error("never execute");</script>',
        base+'/incidents.rss': '<rss><channel><item><guid>incident-1</guid><title>故障恢复</title><description>&lt;p&gt;已恢复&lt;/p&gt;</description><link>https://other.example/private</link><pubDate>Thu, 26 Nov 2026 05:00:00 GMT</pubDate></item></channel></rss>'})
    cfg = {'sourceAdapter': 'OnlineOrNot', 'statusAdapter': 'OnlineOrNot', 'sourceBaseUrl': base}
    rows, _ = public_notices(src, cfg)
    assert rows[0]['body'] == '已恢复' and rows[0]['sourceUrl'] == base+'/incidents.rss'
    channel = public_channels(src, cfg)['channels'][0]
    assert channel['status'] == '正常' and channel['heartbeatAt'] == '' and 'history' not in channel
    src.values[base+'/incidents.rss'] = '<!DOCTYPE rss [<!ENTITY a "unsafe">]><rss/>'
    with pytest.raises(ValueError): public_notices(src, cfg)


def test_right_model_histories_respect_no_sample_and_do_not_assign_every_model_group_health():
    current = now().replace(tzinfo=timezone.utc)
    start, end = (current-timedelta(hours=1)).timestamp(), current.timestamp()
    def model(name, ratio, empty):
        return {'model': name, 'points': [{'start_at':start,'end_at':end,'availability':ratio,'no_sample':empty}]}
    src = Source({'https://example.com/upstreams/public': {'upstreams':[{'id':1,'name':'GPT-Pro'}]},
        'https://example.com/models/availability/all': {'upstreams':[{'upstream_id':1,'windows':{'24h':[
            model('gpt-a',100,False),model('gpt-b',100,True),model('gpt-c',0,False)]}}]}})
    result = public_channels(src, {'statusAdapter':'RightCode 模型可用性','sourceBaseUrl':'https://example.com'})
    assert result['channels'][0]['modelIds'] == []
    assert result['channels'][0]['windows']['24h']['history'][0]['status'] == '异常'
    a,b,c = result['modelChannels']
    assert a['windows']['24h']['latestAvailability'] == 100
    assert b['windows']['24h']['latestAvailability'] is None and b['windows']['24h']['history'][0]['status']=='未知'
    assert c['windows']['24h']['latestAvailability'] == 0


def test_public_reader_passes_source_query_and_stops_challenge(monkeypatch):
    from urllib.parse import urlparse
    monkeypatch.setattr('app.station_sources.validate_target',lambda url:(urlparse(url),'1.1.1.1'))
    seen=[]
    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(403,headers={'cf-mitigated':'challenge'},text='challenge')
    with pytest.raises(HTTPException) as exc:
        PublicSource(transport=httpx.MockTransport(handler)).text('https://example.com/script.js?dpl=public')
    assert exc.value.status_code==409 and len(seen)==1 and '?dpl=public' in seen[0]
