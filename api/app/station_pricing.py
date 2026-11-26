"""Exact public model/group pricing. Monetary units are never inferred from ratios."""
import math
import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select

from .models import Record, now

ADAPTERS = ['New API 公开报价']
HEADERS = ['模型', '分组', '倍率', '输入/输出', '缓存', '纯度', '延迟']


def numeric(value):
    return value if type(value) in [int, float] and math.isfinite(value) and 0 <= value <= 1e12 else None


def fmt(value):
    return f'{value:.8f}'.rstrip('0').rstrip('.') if value is not None else '—'


def validate_pricing(cfg):
    if cfg.get('pricingAdapter', ADAPTERS[0]) not in ADAPTERS:
        raise HTTPException(422, '不支持的模型报价来源')
    if cfg.get('priceCurrency', '未确认') not in ['未确认', 'USD', 'CNY']:
        raise HTTPException(422, '请选择真实报价币种')
    value = cfg.get('tokenPriceBase')
    if value not in [None, '']:
        try: value = float(value)
        except (ValueError, TypeError): value = None
        if value is None or numeric(value) is None or value == 0:
            raise HTTPException(422, '每百万 Token 的基准单价需要正数')
        if cfg.get('priceCurrency', '未确认') == '未确认':
            raise HTTPException(422, '配置基准单价前请确认来源币种')
        cfg['tokenPriceBase'] = value


def parse_pricing(raw, cfg):
    from .station_sources import plain
    if isinstance(raw.get('data'), dict) and isinstance(raw['data'].get('model_info'), list):
        nested = raw['data']
        groups = nested.get('group_info', {})
        overrides = {}
        models = []
        for item in nested['model_info']:
            models.append({**item, 'billing_mode': 'group_pricing'})
            for group, prices in (item.get('price_info') or {}).items():
                value = prices.get('default', {}) if isinstance(prices, dict) else {}
                overrides.setdefault(group, {})[item.get('model_name')] = {
                    'model_ratio': value.get('model_ratio'), 'completion_ratio': value.get('model_completion_ratio'),
                    'cache_ratio': value.get('model_cache_ratio'), 'create_cache_ratio': value.get('model_create_cache_ratio'),
                    'billing_expr': json.dumps(prices, ensure_ascii=False), 'billing_mode': 'group_pricing'}
        raw = {**raw, 'data': models, 'group_model_pricing': overrides,
               'group_ratio': {key: value.get('GroupRatio') for key, value in groups.items()}, 'usable_group': groups}
    items, group_ratios, usable = raw.get('data'), raw.get('group_ratio') or {}, raw.get('usable_group') or {}
    if raw.get('success') is not True or not isinstance(items, list) or not 1 <= len(items) <= 10000:
        raise ValueError('公开报价不是完整的非空模型列表，保留上次资料')
    if not isinstance(group_ratios, dict) or not isinstance(usable, dict) or max(len(group_ratios), len(usable)) > 300:
        raise ValueError('公开报价分组结构无效')
    currency, base = cfg.get('priceCurrency', '未确认'), numeric(cfg.get('tokenPriceBase'))
    rows, seen, models, warnings, rules = [], set(), [], [], {}
    for item in items:
        if not isinstance(item, dict): raise ValueError('公开报价型号结构无效')
        model = plain(item.get('model_name', ''), 180)
        groups = item.get('enable_groups')
        if not model or model in models or not isinstance(groups, list) or len(groups) > 300:
            raise ValueError('公开报价型号缺失、重复或分组无效')
        models.append(model)
        if not groups: continue  # No enabled group is not a purchasable model/group quote.
        for value in groups:
            group = plain(value, 180)
            if not group or (model, group) in seen: raise ValueError('报价的精确型号与分组缺失或重复')
            seen.add((model, group))
            override = (raw.get('group_model_pricing') or {}).get(group, {})
            override = override.get(model, {}) if isinstance(override, dict) else {}
            if not isinstance(override, dict): override = {}
            source = {**item, **override}
            expression = source.get('billing_expr') or ''
            if not isinstance(expression, str) or len(expression) > 100000: raise ValueError('计费规则过长或格式无效')
            rule_id = hashlib.sha256(expression.encode()).hexdigest() if expression else ''
            if expression: rules.setdefault(rule_id, expression)
            ratio = numeric(group_ratios.get(group))
            mode = source.get('billing_mode') or 'ratio'
            quota = source.get('quota_type')
            model_ratio, completion = numeric(source.get('model_ratio')), numeric(source.get('completion_ratio'))
            cache, creation = numeric(source.get('cache_ratio')), numeric(source.get('create_cache_ratio'))
            # Complex expressions/tier prices are preserved verbatim, never evaluated.
            simple = mode in ['ratio', 'legacy', 'standard', 'fixed'] and not source.get('billing_expr')
            input_price = model_ratio * ratio * base if simple and quota == 0 and None not in [model_ratio, ratio, base] and currency != '未确认' else None
            output_price = input_price * completion if input_price is not None and completion is not None else None
            call_price = numeric(source.get('model_price')) if simple and quota == 1 else None
            call_price = call_price * ratio if call_price is not None and ratio is not None and currency != '未确认' else None
            symbol = {'USD': '$', 'CNY': '¥'}.get(currency, '')
            if input_price is not None:
                price_text = f'{symbol}{fmt(input_price)} / {symbol}{fmt(output_price)} · /M'
            elif call_price is not None:
                price_text = f'{symbol}{fmt(call_price)} / 次'
            elif not simple:
                price_text = '阶梯/动态计费'
            elif quota == 1:
                price_text = f'{fmt(numeric(source.get("model_price")))} / 次 · 来源单位'
            else:
                price_text = f'输入 {fmt(model_ratio)}× / 输出 {fmt(completion)}×'
            cache_text = f'{symbol}{fmt(input_price * cache)} /M' if input_price is not None and cache is not None else f'{fmt(cache)}× 输入' if cache is not None else '—'
            rows.append({'cells': [model, group, fmt(ratio) + 'x' if ratio is not None else '—', price_text, cache_text, '未测', '—'],
                'pricing': {'modelId': model, 'group': group, 'groupRatio': ratio, 'modelRatio': model_ratio,
                    'completionRatio': completion, 'cacheRatio': cache, 'cacheCreationRatio': creation,
                    'quotaType': quota, 'currency': currency, 'unit': '百万 Token' if quota == 0 else '次' if quota == 1 else '未确认',
                    'input': input_price, 'output': output_price, 'cache': input_price * cache if input_price is not None and cache is not None else None,
                    'pricePerCall': call_price, 'billingMode': str(mode)[:80], 'billingExpression': expression[:180],
                    'billingRuleId': rule_id, 'billingExpressionTruncated': len(expression) > 180,
                    'unitVerified': input_price is not None or call_price is not None,
                    'endpoints': [str(v)[:100] for v in (source.get('supported_endpoint_types') or [])[:20]]}})
            if len(rows) > 30000: raise ValueError('型号与分组报价超过 30000 条，保留原资料')
    if not rows: raise ValueError('来源没有启用的型号与分组报价，保留原资料')
    if currency == '未确认' or base is None:
        warnings.append('未配置已核实的币种/Token基准单价；保留来源倍率，不推测金额')
    if any(not r['pricing']['unitVerified'] and r['pricing']['billingExpression'] for r in rows):
        warnings.append('包含阶梯或动态计费，已保留来源规则，不用简单倍率估算金额')
    return {'headers': HEADERS, 'rows': rows, 'modelIds': models, 'modelCount': len(models),
            'groupCount': len({r['cells'][1] for r in rows}), 'sourceUrl': cfg['sourceBaseUrl'] + '/pricing',
            'sourceApiUrl': cfg['sourceBaseUrl'] + '/api/pricing', 'collectedAt': now().isoformat(),
            'dataAsOf': now().date().isoformat(), 'currency': currency, 'tokenPriceBase': base,
            'unitVerified': all(r['pricing']['unitVerified'] for r in rows),
            'pricingVersion': str(raw.get('pricing_version') or '')[:180], 'billingRules': rules, 'warnings': warnings}


def fetch_pricing(client, cfg):
    return parse_pricing(client.get(cfg['sourceBaseUrl'] + '/api/pricing'), cfg)


def persist_pricing(db, station, incoming, task):
    from .cache import enqueue_invalidation
    row = db.scalar(select(Record).where(Record.module == 'source-pricing', Record.slug == station.slug).with_for_update())
    if not row:
        row = Record(module='source-pricing', slug=station.slug, name=station.name, status='已发布', data={})
        db.add(row)
    old = row.data
    old_map = {(r['cells'][0], r['cells'][1]): r for r in old.get('rows', []) if len(r.get('cells', [])) >= 2}
    new_map = {(r['cells'][0], r['cells'][1]): r for r in incoming['rows']}
    changes = {'added': len(new_map.keys() - old_map.keys()), 'removed': len(old_map.keys() - new_map.keys()),
               'changed': sum(old_map[k].get('cells', [])[2:5] != new_map[k]['cells'][2:5] for k in old_map.keys() & new_map.keys())}
    row.data = {**incoming, 'station': station.slug, 'stationId': station.id, 'taskId': task.id, 'changes': changes}
    row.version = (row.version or 0) + 1
    station.data = {**station.data, 'modelCount': incoming['modelCount'], 'sourceModelIds': incoming['modelIds'],
                    'pricingUpdatedAt': incoming['collectedAt']}
    # Keep manually curated ecosystem filters; exact discovered IDs have their own field.
    station.version += 1
    enqueue_invalidation(db, 'source-pricing', station.slug)
    return changes
