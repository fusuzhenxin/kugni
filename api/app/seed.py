"""Idempotent seed of sourced directory data, never fictional live measurements."""
import json
from sqlalchemy import select

from .catalog import CATALOG, SHARED
from .config import settings
from .db import SessionLocal
from .models import Record, Role, User, Wallet
from .security import password_hash


def normalized_policy(value, refund=False):
    text = str(value or '').strip().lstrip('–—- ').strip()
    if text in ['是', '支持']: return '支持'
    if text in ['否', '不支持']: return '不支持'
    if refund and text and text not in ['未确认', '未公开', '—', '-']: return '按条件支持'
    return '未确认'


def seed_database():
    cfg = settings()
    data = json.loads((SHARED / 'seed.json').read_text(encoding='utf-8'))
    with SessionLocal() as db:
        if db.get(Role, 'super'):
            reconcile(db)
            db.commit()
            return
        permissions = CATALOG['permissions']
        for rid, name, surface, scope, granted in [
            ('super', '超级管理员', 'platform', 'all', [p['code'] for p in permissions if p['code'].startswith('platform.')]),
            ('operator', '运营管理员', 'platform', 'all', [p['code'] for p in permissions if p['module'] not in ['users', 'roles', 'menus', 'settings', 'test-keys', 'probe-accounts', 'station-source-accounts'] and p['code'].startswith('platform.')]),
            ('reviewer', '内容审核员', 'platform', 'all', [p['code'] for p in permissions if p['module'] in ['overview', 'submissions', 'adreview', 'reports', 'reviews'] and p['action'] in ['read', 'view', 'approve', 'reject', 'bulkApprove', 'bulkReject']]),
            ('readonly', '数据观察员', 'platform', 'all', [p['code'] for p in permissions if p['module'] in ['overview', 'traffic', 'sources', 'pages', 'visitors', 'adstats'] and p['action'] == 'read']),
            ('publisher', '推广站长', 'publisher', 'own', [p['code'] for p in permissions if p['code'].startswith('publisher.')]),
            ('member', '普通用户', 'member', 'own', []),
        ]:
            db.add(Role(id=rid, code=rid, name=name, surface=surface, scope=scope, permissions=granted, protected=rid in ['super', 'member', 'publisher']))
        db.flush()
        if cfg.bootstrap_password:
            db.add(User(id='admin-root', email=cfg.bootstrap_email, name='KUGNI 管理员', password_hash=password_hash(cfg.bootstrap_password), role_id='super'))
            if cfg.environment == 'development':
                for rid in ['reviewer', 'publisher']:
                    db.add(User(id='local-' + rid, email='local-' + rid + '@kugni.com', name={'reviewer': '审核工作台', 'publisher': '推广站长'}[rid], password_hash=password_hash(cfg.bootstrap_password), role_id=rid))
        db.flush()
        for user in db.scalars(select(User)):
            db.add(Wallet(user_id=user.id, balance=0))
        categories = dict(public='public-service', enterprise='enterprise', new='newly-listed', bonus='signup-bonus')
        for i, c in enumerate(data['config']['categories']):
            db.add(Record(id='category-' + c['slug'], module='categories', name=c['name'], slug=categories[c['slug']], status='启用', data={**c, 'slug': categories[c['slug']], 'sort': (i + 1) * 10}))
        for s in data['source']['sites']:
            slug = data['stationSlugs'][s['id']]
            tags = s.get('tags', [])
            cats = []
            if s.get('kind') == '公益站': cats.append('public-service')
            if any('企业' in t or '稳定' in t for t in tags): cats.append('enterprise')
            if any('新站' in t for t in tags): cats.append('newly-listed')
            if any('赠' in t for t in tags): cats.append('signup-bonus')
            payload = dict(name=s['name'], slug=slug, domain='https://' + s['domain'], registerUrl=s.get('url', ''), summary=s.get('description', ''), logo='/' + s.get('logo', ''), category=(cats[0] if cats else 'enterprise'), categories=cats or ['enterprise'], models=s.get('models', []), payments=[p['name'] for p in s.get('payments', [])], kind=s.get('kind', ''), invoice=s.get('invoice', '未确认'), refund=s.get('refund', '未确认'), minRecharge=s.get('minRecharge', ''), promo=s.get('promo', ''), tags=tags, listedAt=s.get('listedAt', ''), serviceStatus='待核验', noticeDisplay='开启', source=data['source']['source'], sourceDate=data['source']['capturedAt'], sourceUptime=s.get('uptime'), sourceLatency=s.get('latency'), rank=s.get('rank'), seoTitle='', seoDescription='', status='已收录')
            db.add(Record(id=s['id'], module='stations', name=s['name'], slug=slug, status='已收录', data=payload))
        for m in data['models']['items']:
            db.add(Record(id='model-' + m['slug'], module='models', name=m['name'], slug=m['slug'], status='启用', data={**m, 'vendor': m['name'].split('/')[0].strip(), 'summary': m['name'] + ' 模型生态，具体型号与调用权限请以服务商最新说明为准。'}))
        for item in data['pricing']['items']:
            if item['rows']:
                db.add(Record(module='source-pricing', name=item['station'], slug=item['station'], status='已发布', data={**item, 'dataAsOf': data['pricing']['dataAsOf'], 'unitVerified': False}))
        for path, page in data['content']['pages'].items():
            route = next((r for r in data['routes'] if r['internal'] == path), None)
            if route:
                db.add(Record(module='page-content', name=page['title'], slug=route['path'] or '/', status='已发布', data={**page, 'document': data['content'].get('documents', {}).get(path.strip('/'), [])}))
        for m in CATALOG['modules']:
            db.add(Record(id='menu-' + m['key'], module='menus', name=m['title'], status='显示', data=dict(name=m['title'], path=m['path'], module=m['key'], surface=m['surface'], type='菜单', parent=m['group'], permission=m['permission'] + '.read', sort=list(CATALOG['modules']).index(m))))
        db.add(Record(id='settings-general', module='settings', name='KUGNI', status='启用', data=dict(name='KUGNI', description='发现值得信赖的 AI 连接', **data['config']['contact'])))
        for i, (name, code, size, price) in enumerate([('首页横幅', 'home-banner', '1440 × 320', 1280), ('站点列表', 'station-inline', '960 × 240', 720), ('站点详情页', 'station-detail', '640 × 320', 360), ('模型资料页', 'model-banner', '960 × 240', 480)]):
            db.add(Record(id='placement-' + str(i), module='placements', name=name, slug=code, status='可投放', data=dict(name=name, code=code, size=size, price=price, capacity=2, pricingMode='按周', description='展示规格与排期由平台审核确认。')))
        for i, (name, cost) in enumerate([('开发者体验权益', 20), ('进阶体验权益', 40), ('探索者体验权益', 60)]):
            db.add(Record(id='reward-' + str(i), module='rewards', name=name, status='停用', data=dict(name=name, cost=cost, stock=0, dailyLimit=1, description='待平台配置可发放权益后开放兑换，当前不扣积分。')))
        db.commit()
        reconcile(db)
        db.commit()


def reconcile(db):
    """Add new built-in capabilities without overwriting operator-managed data."""
    if not db.get(Record, 'config-collection-initialized'):
        db.add(Record(id='hvoy-catalog-task', module='collection-tasks', name='模型与套餐资料更新', status='启用', data={'name': '模型与套餐资料更新', 'datasets': ['模型大全', '模型套餐'], 'schedule': '仅手动', 'dailyTime': '03:00', 'interval': 360, 'cron': '0 3 * * *', 'timezone': 'Asia/Shanghai', 'syncMode': '保留人工修改', 'status': '启用'}))
        db.add(Record(id='config-collection-initialized', module='system', name='数据采集已初始化', status='启用'))
    marker = 'config-model-suggestions-initialized'
    if not db.get(Record, marker):
        # A persistent marker prevents deleted or disabled choices returning on restart.
        if not db.scalar(select(Record.id).where(Record.module == 'model-suggestions').limit(1)):
            defaults = json.loads((SHARED / 'common-models.json').read_text(encoding='utf-8'))
            for i, model_id in enumerate(defaults):
                db.add(Record(module='model-suggestions', name=model_id, slug=model_id, status='启用', data={'name': model_id, 'sort': (i + 1) * 10, 'status': '启用'}))
        db.add(Record(id=marker, module='system', name='常用模型已初始化', status='启用'))
    source = json.loads((SHARED / 'seed.json').read_text(encoding='utf-8'))
    for model in source['models']['items']:
        if not db.get(Record, 'model-' + model['slug']) and not db.scalar(select(Record).where(Record.module == 'models', Record.slug == model['slug'])):
            db.add(Record(id='model-' + model['slug'], module='models', name=model['name'], slug=model['slug'], status='启用', data={**model, 'modelId': model['slug'], 'vendor': model.get('vendor', model['name'].split('/')[0].strip()), 'summary': model['name'] + ' 模型生态，具体型号与调用权限请以服务商最新说明为准。'}))
    super_role = db.get(Role, 'super')
    for rid in ['reviewer', 'publisher']:
        user = db.get(User, 'local-' + rid)
        if user and user.email.endswith('@kugni.local'): user.email = 'local-' + rid + '@kugni.com'
    if super_role: super_role.permissions = [p['code'] for p in CATALOG['permissions'] if p['code'].startswith('platform.')]
    for m in CATALOG['modules']:
        row = db.get(Record, 'menu-' + m['key'])
        if row and not row.slug: row.slug = m['key']
        if not row: db.add(Record(id='menu-' + m['key'], module='menus', slug=m['key'], name=m['title'], status='显示', data={'module': m['key'], 'sort': CATALOG['modules'].index(m)}))
    for user in db.scalars(select(User).join(Role, Role.id == User.role_id).where(Role.surface == 'publisher')):
        if not db.scalar(select(Record).where(Record.module == 'publisher-profile', Record.owner_id == user.id)):
            db.add(Record(module='publisher-profile', owner_id=user.id, name=user.name, status='启用', data={'name': user.name, 'email': user.email}))
    for station in db.scalars(select(Record).where(Record.module == 'stations')):
        data = dict(station.data)
        for key in ['invoice', 'refund']:
            allowed = ['支持', '不支持', '未确认'] + (['按条件支持'] if key == 'refund' else [])
            if data.get(key) not in allowed:
                data['source' + key.capitalize()] = data.get(key)
                data[key] = normalized_policy(data.get(key), refund=key == 'refund')
        station.data = data
    for model in db.scalars(select(Record).where(Record.module == 'models')):
        if not model.data.get('modelId'):
            model.data = {**model.data, 'modelId': model.slug, 'vendor': {'openai': 'OpenAI', 'claude': 'Anthropic', 'gemini': 'Google', 'deepseek': 'DeepSeek'}.get(model.slug, model.data.get('vendor', ''))}
    db.flush()
    from .localization import sync_all
    sync_all(db)


if __name__ == '__main__':
    seed_database()
    print('Seed complete.')
