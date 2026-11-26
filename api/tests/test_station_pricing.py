import copy

import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Record
from app.station_pricing import parse_pricing
from .test_station_sources import task, run


RAW = {'success': True, 'group_ratio': {'Pro': .2, 'Max': .5}, 'data': [
    {'model_name': 'gpt-a', 'enable_groups': ['Pro', 'Max'], 'quota_type': 0, 'model_ratio': 4, 'completion_ratio': 3, 'cache_ratio': .1},
    {'model_name': 'gpt-image', 'enable_groups': ['Pro'], 'quota_type': 1, 'model_price': .25},
]}
CFG = {'sourceBaseUrl': 'https://example.com'}


def test_public_ratios_have_exact_groups_zero_values_and_no_inferred_currency():
    raw = copy.deepcopy(RAW)
    raw['group_ratio']['Pro'] = 0
    result = parse_pricing(raw, CFG)
    a, b, image = result['rows']
    assert a['cells'][:3] == ['gpt-a', 'Pro', '0x']
    assert a['pricing']['input'] is None and not a['pricing']['unitVerified']
    assert a['pricing']['cacheRatio'] == .1
    assert b['pricing']['groupRatio'] == .5
    assert '来源单位' in image['cells'][3]
    assert result['modelIds'] == ['gpt-a', 'gpt-image'] and result['groupCount'] == 2


def test_confirmed_units_compute_prices_but_never_evaluate_tier_expressions():
    cfg = {**CFG, 'priceCurrency': 'USD', 'tokenPriceBase': 2}
    result = parse_pricing(RAW, cfg)
    assert result['rows'][0]['pricing']['input'] == pytest.approx(1.6)
    assert result['rows'][0]['pricing']['output'] == pytest.approx(4.8)
    assert result['rows'][0]['pricing']['cache'] == pytest.approx(.16)
    assert result['rows'][2]['pricing']['pricePerCall'] == pytest.approx(.05)
    raw = copy.deepcopy(RAW)
    raw['data'][0].update(billing_mode='tiered_expr', billing_expr='tier("standard", p * 8 + c * 24)')
    result = parse_pricing(raw, cfg)
    assert result['rows'][0]['pricing']['input'] is None
    assert result['rows'][0]['cells'][3] == '阶梯/动态计费'
    assert result['rows'][0]['pricing']['billingExpression'].startswith('tier(')


def test_empty_duplicate_or_broken_catalog_is_not_a_successful_replacement():
    for raw in [{'success': True, 'data': []}, {'success': False, 'data': RAW['data']},
                {**RAW, 'data': [RAW['data'][0], RAW['data'][0]]},
                {**RAW, 'data': [{**RAW['data'][0], 'enable_groups': ['Pro', 'Pro']}]}]:
        with pytest.raises(ValueError): parse_pricing(raw, CFG)


def test_real_worker_path_replaces_old_source_quotes_and_failure_keeps_them(client):
    class PublicPricing:
        data = RAW
        def get(self, url):
            assert url.endswith('/api/pricing')
            return self.data
    tid, sid, slug = task(['模型与报价'])
    with SessionLocal() as db:
        station = db.get(Record, sid)
        curated = station.data['models']
    source = PublicPricing()
    result = run(tid, source)
    assert result.status == '部分成功' and result.data['modelCount'] == 2 and result.data['quoteCount'] == 3
    response = client.get('/api/v1/public/stations/' + slug + '/').json()
    assert response['models'] == curated and response['sourceModelIds'] == ['gpt-a', 'gpt-image']
    assert len(response['sourcePricing']['rows']) == 3
    source.data = {'success': True, 'data': []}
    assert run(tid, source).status == '失败'
    unchanged = client.get('/api/v1/public/stations/' + slug + '/').json()['sourcePricing']
    assert unchanged == response['sourcePricing']
