"""Shared admin actions, backed by database transactions and server-side RBAC."""
import copy
import re
import secrets
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

from fastapi import HTTPException
from email_validator import validate_email, EmailNotValidError
from sqlalchemy import delete, func, select

from .cache import enqueue_invalidation
from .catalog import CATALOG, MODULES
from .member import award
from .models import AuditLog, Credential, Execution, Favorite, LoginSession, PageRedirect, Record, Report, Role, User, Wallet, now, uid
from .security import check_permission, encrypt, password_hash
from .serialization import record_json, user_json

ALIASES = {'adreview': 'campaigns', 'publishers': 'users', 'p-store': 'placements', 'p-messages': 'messages', 'p-account': 'publisher-profile'}


def store(m):
    return ALIASES.get(m['key'], m['store'])


def allowed_query(db, user, m, action='read'):
    role = check_permission(db, user, m, action)
    scope_own = role.scope == 'own' or m['surface'] == 'publisher'
    key = store(m)
    model = User if key == 'users' else Role if key == 'roles' else AuditLog if key == 'audit' else Execution if key == 'executions' else Report if key == 'reports' else Record
    query = select(model)
    if m['key'] == 'publishers': query = query.join(Role, Role.id == User.role_id).where(Role.surface == 'publisher')
    if model is Record:
        query = query.where(Record.module == key)
        if key == 'station-notices': query = query.where(Record.status != '已删除')
        if scope_own and m['key'] not in ['p-store']:
            query = query.where(Record.owner_id == user.id)
        if m['key'] == 'adreview': query = query.where(Record.status == '待审核')
        if m['key'] == 'p-store': query = query.where(Record.status == '可投放')
    elif scope_own:
        if model in [Execution, Report]: query = query.where(model.owner_id == user.id)
        elif model is User: query = query.where(User.id == user.id)
        else: raise HTTPException(403, '此模块不支持本人数据范围')
    return query, model


def get_entity(db, user, m, id, action='view'):
    query, model = allowed_query(db, user, m, action)
    query = query.where(model.id == id)
    if action not in ['read', 'view']: query = query.with_for_update()
    row = db.scalar(query)
    if not row:
        raise HTTPException(404, '记录不存在或不在你的数据范围内')
    return row


def serialize(db, row):
    if isinstance(row, Record):
        data = record_json(row)
        if row.module in ['probe-accounts', 'station-source-accounts', 'reward-codes', 'fingerprint-baselines', 'station-sync-tasks', 'station-sync-runs', 'station-notices', 'stations', 'seo-inspection-tasks', 'seo-inspection-runs']:
            data = {k: v for k, v in data.items() if not k.startswith('_') and k not in ['password', 'managementToken', 'codes']}
        if row.module in ['probe-accounts', 'station-source-accounts']:
            data['authConfigured'] = bool(db.get(Credential, row.id))
        if row.module in ['station-sync-runs', 'seo-inspection-runs']:
            finished = row.data.get('finishedAt')
            data['finishedTime'] = (datetime.fromisoformat(finished) + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S') if finished else '—'
        if row.module in ['collection-tasks', 'station-sync-tasks', 'seo-inspection-tasks']:
            scheduled = row.data.get('_nextRun')
            data['nextRun'] = (datetime.fromisoformat(scheduled) + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M') if scheduled else '仅手动 / 已停用'
        if row.module == 'test-keys':
            credential = db.get(Credential, row.id)
            data['secretMask'] = credential.fingerprint if credential else '未配置'
        return data
    if isinstance(row, User):
        role = db.get(Role, row.role_id)
        return {**user_json(row, role), 'lastLogin': row.last_login.isoformat() if row.last_login else '从未登录', **{k: v for k, v in row.profile.items() if k in ['department', 'contact', 'domain']}, 'verified': ('已认证' if row.profile.get('publisherVerified') else '待认证') if role.surface == 'publisher' else ('已核验' if row.profile.get('verified') else '未核验')}
    if isinstance(row, Role):
        return dict(id=row.id, name=row.name, code=row.code, surface=row.surface, scope=row.scope, permissions=row.permissions, description=row.description, protected=row.protected, status='启用' if row.enabled else '停用', members=db.scalar(select(func.count()).select_from(User).where(User.role_id == row.id)))
    if isinstance(row, Execution):
        return dict(id=row.id, name=row.name, status=row.status, station='', progress=f'{row.completed} / {row.total}', updated=row.created_at.isoformat(), error=row.error, planId=row.plan_id, targets=[{k: v for k, v in t.items() if k not in ['secret']} for t in row.targets], settings={k: v for k, v in row.settings.items() if k != 'ephemeralSecret'})
    if isinstance(row, Report):
        return dict(id=row.id, name=row.model, modelId=row.model, station=row.station_id, type=row.test_type, score=row.score, status=row.status, visibility=row.visibility, updated=row.created_at.isoformat(), evidence=row.evidence, executionId=row.execution_id, shareUrl=f'/tools/api-check/reports/{row.id}/?token={row.share_token}' if row.share_token else None)
    if isinstance(row, AuditLog):
        actor = db.get(User, row.user_id) if row.user_id else None
        return dict(id=row.id, name=row.action, operator=actor.name if actor else '系统', object=row.module + '/' + row.target_id, status='成功', detail=row.data, updated=row.created_at.isoformat())
    raise TypeError('Unsupported entity')


def audit(db, user, action, m, target, detail=None):
    db.add(AuditLog(user_id=user.id, action=action, module=m['key'], target_id=target, data=detail or {}))


def context(db, user):
    role = db.get(Role, user.role_id)
    menus = list(db.scalars(select(Record).where(Record.module == 'menus', Record.status == '显示')))
    modules = []
    for m in CATALOG['modules']:
        if role.surface != m['surface'] or m['permission'] + '.read' not in role.permissions:
            continue
        if not any(r.data.get('module') == m['key'] and r.status == '显示' for r in menus):
            continue
        value = copy.deepcopy(m)
        menu = next(r for r in menus if r.data.get('module') == m['key'])
        value.update(title=menu.name, icon=menu.data.get('icon') or m['icon'], sort=menu.data.get('sort', 0))
        value['actions'] = [a for a in m['actions'] if m['permission'] + '.' + a in role.permissions]
        value['bulkActions'] = [a for a in m.get('bulkActions', []) if m['permission'] + '.bulk' + a[0].upper() + a[1:] in role.permissions]
        for field in value['fields']:
            if field['key'] in ['station', 'stationId']:
                field['source'] = 'stations'
                field['options'] = []
            if field.get('key') == 'category':
                field['source'] = 'categories'
            if field.get('key') == 'placement':
                field['source'] = 'placements'
            if field.get('key') == 'ownerId':
                field['source'] = 'publishers'
            if field.get('key') == 'roleId':
                field['type'] = 'select'
                field['source'] = 'roles'
        modules.append(value)
    modules.sort(key=lambda m: m.get('sort') or 0)
    choices = {}
    for key in ['stations', 'categories', 'placements']:
        choices[key] = [dict(id=r.id, name=r.name, slug=r.slug, **({'status': r.status} if key == 'placements' else {})) for r in db.scalars(select(Record).where(Record.module == key))]
    if role.surface == 'platform':
        choices['roles'] = [dict(id=r.id, name=r.name) for r in db.scalars(select(Role))]
        choices['publishers'] = [dict(id=u.id, name=u.name) for u in db.scalars(select(User).join(Role, Role.id == User.role_id).where(Role.surface == 'publisher'))]
        if 'platform.test-keys.read' in role.permissions:
            choices['test-keys'] = [serialize(db, r) for r in db.scalars(select(Record).where(Record.module == 'test-keys'))]
        if 'platform.rewards.read' in role.permissions:
            choices['rewards'] = [dict(id=r.id, name=r.name) for r in db.scalars(select(Record).where(Record.module == 'rewards'))]
        if 'platform.station-source-accounts.read' in role.permissions:
            query, _ = allowed_query(db, user, MODULES['station-source-accounts'])
            choices['station-source-accounts'] = [dict(id=r.id, name=r.name, station=r.data.get('station'), status=r.status) for r in db.scalars(query)]
    return dict(user=user_json(user, role), modules=modules, actions=CATALOG['actions'], permissions=CATALOG['permissions'] if 'platform.roles.read' in role.permissions else [], choices=choices)


def validate_values(db, m, values, existing=None):
    data = {**(existing.data if isinstance(existing, Record) else {}), **values}
    allowed = {f['key'] for f in m['fields']} | {'version', 'name', 'status', 'slug', 'categories', 'reviewNote', 'visibility'}
    unknown = set(values) - allowed
    if unknown:
        raise HTTPException(422, '不支持的字段：' + ', '.join(sorted(unknown)))
    for field in m['fields']:
        value = data.get(field['key'])
        if field.get('required') and (value is None or value == '' or value == []):
            raise HTTPException(422, '请填写' + field['label'])
        if value in [None, '']:
            continue
        kind = field.get('type', 'text')
        if kind in ['multiselect', 'bindings', 'permissions'] and not isinstance(value, list):
            raise HTTPException(422, field['label'] + '需要列表')
        if isinstance(value, str) and len(value) > (100100 if m['key'] == 'reward-codes' and field['key'] == 'codes' else 50000 if kind == 'editor' else 5000 if kind == 'textarea' else 1000):
            raise HTTPException(422, field['label'] + '内容过长')
        if kind == 'email':
            try: validate_email(str(value), check_deliverability=False)
            except EmailNotValidError: raise HTTPException(422, field['label'] + '格式无效')
        if kind == 'url' and (urlparse(str(value)).scheme not in ['http', 'https'] or not urlparse(str(value)).hostname):
            raise HTTPException(422, field['label'] + '需要有效的 HTTP/HTTPS 地址')
        if kind == 'number':
            try:
                if float(value) < 0 or float(value) == float('inf') or float(value) != float(value): raise ValueError()
            except (TypeError, ValueError):
                raise HTTPException(422, field['label'] + '需要非负数字')
        if kind in ['select', 'multiselect'] and field.get('options') and not field.get('source') and field['key'] not in ['station', 'stationId', 'category', 'ownerId', 'roleId']:
            actual = value if isinstance(value, list) else [value]
            if any(v not in field['options'] for v in actual):
                raise HTTPException(422, field['label'] + '包含无效选项')
    if data.get('start') and data.get('end') and data['end'] < data['start']:
        raise HTTPException(422, '结束日期不能早于开始日期')
    if m['key'] in ['stations', 'categories', 'articles', 'models', 'resources']:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', data.get('slug', '')):
            raise HTTPException(422, '页面标识需要小写英文、数字和连字符')
    return data


def save_user(db, user, m, values, row=None):
    check_permission(db, user, m, 'edit' if row else 'create')
    validate_values(db, m, {**({'name': row.name, 'email': row.email} if row else {}), **values})
    role = db.get(Role, 'publisher' if m['key'] == 'publishers' else values.get('roleId', row.role_id if row else 'member'))
    if not role: raise HTTPException(422, '角色不存在')
    actor = db.get(Role, user.role_id)
    if actor.id != 'super' and (role.surface != actor.surface or set(role.permissions) - set(actor.permissions)):
        raise HTTPException(403, '不能通过分配角色授予超出自身的权限')
    if row and row.id == 'admin-root' and (role.id != 'super' or values.get('status') == '已停用'):
        raise HTTPException(409, '不能停用或降级初始管理员')
    if row and row.id == user.id and (role.id != row.role_id or values.get('status') == '已停用'):
        raise HTTPException(409, '不能改变自己的角色或停用自己')
    password = values.get('password', '')
    if (not row or password) and len(password) < 10:
        raise HTTPException(422, '密码至少 10 位')
    if not row:
        row = User(id=uid(), name=values.get('name', '').strip(), email=values.get('email', '').lower(), password_hash=password_hash(password), role_id=role.id)
        db.add(row)
        db.flush()
        db.add(Wallet(user_id=row.id, balance=0))
    row.name = values.get('name', row.name).strip()
    row.email = values.get('email', row.email).lower()
    row.role_id = role.id
    row.enabled = values.get('status', '正常') == '正常'
    verified = values.get('verified', '已核验' if row.profile.get('verified') else '未核验') == '已核验'
    row.profile = {**row.profile, **{k: values[k] for k in ['department', 'contact', 'domain'] if k in values}, 'verified': verified, **({'publisherVerified': values.get('verified') == '已认证'} if m['key'] == 'publishers' else {})}
    if verified and row.invited_by and row.invited_by != row.id:
        award(db, row.invited_by, 'invite:' + row.id, '有效邀请核验通过', 50)
    if role.surface == 'publisher' and not db.scalar(select(Record).where(Record.module == 'publisher-profile', Record.owner_id == row.id)):
        db.add(Record(module='publisher-profile', owner_id=row.id, name=row.name, status='启用', data={'name': row.name, 'email': row.email}))
    if password:
        row.password_hash = password_hash(password)
        db.execute(delete(LoginSession).where(LoginSession.user_id == row.id))
    return row


def save_role(db, user, m, values, row=None):
    check_permission(db, user, m, 'edit' if row else 'create')
    validate_values(db, m, {**({k: getattr(row, k) for k in ['name', 'code']} if row else {}), **values})
    if row and row.protected:
        raise HTTPException(409, '内置角色不可修改，请复制权限创建新角色')
    permissions = values.get('permissions', [])
    all_codes = {p['code'] for p in CATALOG['permissions']}
    actor = db.get(Role, user.role_id)
    if not isinstance(permissions, list) or set(permissions) - all_codes or (actor.id != 'super' and set(permissions) - set(actor.permissions)):
        raise HTTPException(403, '不能授予自己没有的权限')
    if values.get('scope', 'all') not in ['all', 'own'] or values.get('surface', 'platform') not in ['platform', 'publisher']:
        raise HTTPException(422, '角色后台或数据范围无效')
    if any(not p.startswith(values.get('surface', 'platform') + '.') for p in permissions):
        raise HTTPException(422, '角色权限必须与所属后台一致')
    if not row:
        row = Role(id=uid(), name=values.get('name', ''), code=values.get('code', ''))
        db.add(row)
    for key in ['name', 'code', 'surface', 'scope', 'description', 'permissions']:
        if key in values: setattr(row, key, values[key])
    row.enabled = values.get('status', '启用') == '启用'
    return row


def save_record(db, user, m, values, row=None):
    action = 'edit' if row else 'create'
    role = check_permission(db, user, m, action)
    data = validate_values(db, m, values, row)
    if row and 'version' in values and row.version != values['version']:
        raise HTTPException(409, '记录已被其他人修改，请刷新后再编辑')
    key = store(m)
    if key == 'collection-tasks':
        from .collection import validate_task
        validate_task(data)
    if key == 'seo-inspection-tasks':
        from .seo_inspection import validate_task
        validate_task(db, data, row)
        if data.get('status') == '启用' and data.get('schedule') == '每日定时':
            if check_permission(db, user, m, 'run').scope != 'all': raise HTTPException(403, '定时巡检需要全站运行权限')
    if key == 'station-sync-tasks':
        from .station_sources import authorize_sync, needs_account, validate_task
        get_entity(db, user, MODULES['stations'], data.get('station'), 'read')
        validate_task(db, data, row)
        if data.get('status') == '启用' and data.get('schedule') != '仅手动': authorize_sync(db, user, data)
        elif needs_account(data):
            get_entity(db, user, MODULES['station-source-accounts'], data.get('sourceAccount'), 'edit')
    if key == 'station-source-accounts':
        from .station_source_auth import validate_account
        get_entity(db, user, MODULES['stations'], data.get('station'), 'read')
        source_auth = validate_account(db, data, values, row)
    if key == 'station-notices' and row and row.data.get('_stationSync'):
        # Generic editors submit complete forms. Protect fields only when the value
        # actually changed, otherwise an unchanged form would freeze every field.
        changed = {k for k, v in values.items() if k != 'version' and v != {'name': row.name, 'status': row.status}.get(k, row.data.get(k))}
        if 'stationId' in changed: raise HTTPException(409, '采集公告不能更换所属站点，请新建公告')
        data['_manualFields'] = sorted(set(row.data.get('_manualFields', [])) | changed)
    if key in ['model-directory', 'model-packages']:
        data['_manualFields'] = sorted(set(data.get('_manualFields', [])) | (set(values) & {'name', 'summary', 'status'}))
    if key == 'model-suggestions':
        model_id = data.get('name', '')
        if not isinstance(model_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/:@+\-]{0,159}', model_id):
            raise HTTPException(422, '模型 ID 需要 1–160 个英文、数字或 . _ / : @ + - 字符，不含空格')
        try:
            sort = float(data.get('sort') or 0)
            if isinstance(data.get('sort'), bool) or not sort.is_integer() or not 0 <= sort <= 1000000: raise ValueError()
        except (TypeError, ValueError):
            raise HTTPException(422, '排序需要 0–1000000 的整数')
        if db.scalar(select(Record.id).where(Record.module == key, Record.slug == model_id, Record.id != (row.id if row else ''))):
            raise HTTPException(409, '该模型 ID 已存在，请编辑已有记录')
        data.update(slug=model_id, sort=int(sort))
    if key == 'menus':
        target = MODULES.get(data.get('module'))
        if not target: raise HTTPException(422, '请选择有效功能模块')
        if data.get('path') and data['path'].rstrip('/') != target['path'].rstrip('/'): raise HTTPException(422, '菜单路径必须与关联模块一致')
        if db.scalar(select(Record.id).where(Record.module == 'menus', Record.id != (row.id if row else ''), Record.slug == target['key'])): raise HTTPException(409, '此模块已有菜单，请直接编辑')
        data.update(path=target['path'], permission=target['permission'], surface=target['surface'], slug=target['key'])
    if key == 'seo':
        if not isinstance(data.get('path'), str) or not data['path'].startswith('/') or '?' in data['path'] or '#' in data['path']: raise HTTPException(422, 'SEO 路径需要站内绝对路径')
        data['status'] = '已发布'
    if key == 'probe-accounts':
        from .account_connector import validate_account
        account_auth = validate_account(db, data, values, row)
        check_permission(db, user, MODULES['test-keys'], 'edit' if data.get('credentialRef') else 'create')
        if row and row.data.get('syncState') in ['排队中', '执行中']:
            raise HTTPException(409, '账户正在同步，请执行完成后再编辑')
    if key == 'fingerprint-baselines':
        from .fingerprint import validate_baseline
        validate_baseline(db, data, row)
        check_permission(db, user, MODULES['test-keys'], 'read')
    if key == 'rewards':
        for field in ['cost', 'stock', 'dailyLimit']:
            number = float(data.get(field) or (1 if field == 'dailyLimit' else 0))
            if not number.is_integer() or number < (1 if field in ['cost', 'dailyLimit'] else 0):
                raise HTTPException(422, '积分、库存和限兑次数需要有效整数')
            data[field] = int(number)
        if data.get('deliveryMode') == '自动发码':
            data['stock'] = sum(int(r.data.get('available') or 0) for r in db.scalars(select(Record).where(Record.module == 'reward-codes')) if r.data.get('rewardId') == (row.id if row else '') and (not r.data.get('expires') or r.data['expires'] >= now().date().isoformat()))
    if key == 'analytics-funnels':
        from .analytics_details import validate_funnel
        validate_funnel(data)
    if key == 'plans':
        from .testing import validate_plan
        validate_plan(db, data)
    if key == 'test-alerts':
        if not db.scalar(select(Record.id).where(Record.id == data.get('station'), Record.module == 'stations')): raise HTTPException(422, '请选择检测站点')
        if data.get('channel') != '站内通知': raise HTTPException(422, '目前支持站内通知')
        for field, default, low, high in [('window', 60, 1, 10080), ('cooldown', 30, 1, 10080), ('threshold', 1, 0, 10000)]:
            try: value = int(data[field]) if data.get(field) not in [None, ''] else default
            except (TypeError, ValueError): raise HTTPException(422, field + '需要整数')
            if not low <= value <= high: raise HTTPException(422, field + '超出有效范围')
            data[field] = value
    if key == 'pricing':
        if data.get('unit') not in ['百万 Token', '千 Token', '次'] or data.get('currency') not in ['CNY', 'USD']:
            raise HTTPException(422, '请明确计费单位和币种')
    if key == 'test-keys':
        if not row and not values.get('secret'):
            raise HTTPException(422, '创建凭证需要填写 API Key')
        from .testing import validate_target
        validate_target(data.get('baseUrl', ''))
    if key == 'campaigns':
        if data.get('placement'):
            placement = db.get(Record, data['placement'])
            if not placement or placement.module != 'placements' or placement.status != '可投放': raise HTTPException(422, '请选择可投放广告位')
        if role.surface == 'publisher':
            if row and row.status not in ['草稿', '已驳回', '已暂停', '待审核']:
                raise HTTPException(409, '投放中或已结束广告不能直接修改，请联系平台')
            data.pop('ownerId', None)
            data['status'] = '草稿' if data.get('status') == '草稿' else '待审核'
        if data.get('status') == '投放中':
            if not row or row.status not in ['已通过', '投放中', '已暂停']:
                raise HTTPException(409, '广告需先通过审核')
            orders = db.scalars(select(Record).where(Record.module == 'orders', Record.status == '已支付'))
            if not any(o.data.get('campaignId') == row.id for o in orders): raise HTTPException(409, '广告订单尚未确认付款')
        if data.get('status') == '已通过' and (not row or row.status != '已通过'):
            raise HTTPException(409, '请通过审核操作确认广告')
    if key == 'orders':
        if not row: raise HTTPException(409, '订单由审核通过的广告生成')
        if any(k not in ['note', 'version'] and v != ({'name': row.name, 'status': row.status}.get(k, row.data.get(k))) for k, v in values.items()):
            raise HTTPException(409, '订单金额与付款状态通过专用流程维护，只允许修改备注')
    if key == 'redemptions' and row:
        if row.status != '待处理': raise HTTPException(409, '已处理的兑换不能再次修改')
        if data.get('status') == '已取消':
            award(db, row.owner_id, 'refund:' + row.id, '兑换取消返还：' + row.name, int(row.data['cost']))
            reward = db.scalar(select(Record).where(Record.id == row.data['rewardId']).with_for_update())
            if reward: reward.data = {**reward.data, 'stock': reward.data.get('stock', 0) + 1}
    old_slug = row.slug if row else None
    if not row:
        row = Record(module=key, name=str(data.get('name', m['title'])), owner_id=user.id)
        db.add(row)
        db.flush()
    if key == 'probe-accounts':
        credential = db.get(Credential, row.id)
        encoded = encrypt(__import__('json').dumps(account_auth))
        if credential:
            credential.encrypted_secret = encoded
        else:
            db.add(Credential(id=row.id, encrypted_secret=encoded, fingerprint='账户凭证已加密'))
        data.pop('managementToken', None)
    if key == 'station-source-accounts':
        from .station_source_auth import save_auth
        save_auth(db, row, source_auth)
    if key == 'reward-codes':
        from .reward_delivery import import_codes
        check_permission(db, user, MODULES['rewards'], 'edit')
        data = {**data, **import_codes(db, data['rewardId'], values.get('codes', ''), row, data.get('expires', ''))}
        data.pop('codes', None)
        data['status'] = '可发放'
    if role.surface == 'platform' and 'ownerId' in data:
        owner = db.get(User, data['ownerId']) if data['ownerId'] else None
        if not owner or db.get(Role, owner.role_id).surface != 'publisher': raise HTTPException(422, '请选择有效站长账户')
        row.owner_id = owner.id
    if values.get('secret'):
        secret = values['secret']
        credential = db.get(Credential, row.id)
        if not credential:
            credential = Credential(id=row.id, encrypted_secret=encrypt(secret), fingerprint='••••' + secret[-4:])
            db.add(credential)
        else:
            credential.encrypted_secret = encrypt(secret)
            credential.fingerprint = '••••' + secret[-4:]
        data.pop('discoveredModels', None)
    for field in ['secret', 'password', 'version', 'ownerId']:
        data.pop(field, None)
    row.name = str(data.get('name', row.name))
    row.status = str(data.get('status', row.status))
    if data.get('slug'): row.slug = data['slug']
    if key == 'stations':
        category = data.get('category', '')
        cat = db.get(Record, category)
        if cat and cat.module == 'categories': category = cat.slug
        data['category'] = category
        data['categories'] = list(dict.fromkeys(c for c in [category, *(data.get('categories') or [])] if c))
        if old_slug and old_slug != row.slug:
            old_path, new_path = '/stations/' + old_slug + '/', '/stations/' + row.slug + '/'
            if db.scalar(select(Record).where(Record.module == 'stations', Record.slug == row.slug, Record.id != row.id)):
                raise HTTPException(409, '此页面地址已被使用')
            # Flatten previous aliases so a second rename does not create redirect chains.
            for alias in db.scalars(select(PageRedirect).where(PageRedirect.destination == old_path)):
                alias.destination = new_path
            existing = db.get(PageRedirect, old_path)
            if existing: existing.destination = new_path
            else: db.add(PageRedirect(path=old_path, destination=new_path))
            if db.get(PageRedirect, new_path): db.delete(db.get(PageRedirect, new_path))
            source_pricing = db.scalar(select(Record).where(Record.module == 'source-pricing', Record.slug == old_slug))
            if source_pricing:
                source_pricing.slug = row.slug
                source_pricing.data = {**source_pricing.data, 'station': row.slug, 'stationId': row.id}
    row.data = data
    row.version += 1
    enqueue_invalidation(db, key, row.slug)
    return row


def mutate(db, user, m, action, id=None, values=None):
    values = values or {}
    check_permission(db, user, m, action)
    row = get_entity(db, user, m, id, action) if id else None
    key = store(m)
    if key == 'translations':
        from .localization import translation_action
        row = translation_action(db, row, action, values)
        db.flush()
        audit(db, user, action, m, row.id)
        return row
    if action in ['create', 'edit']:
        if key == 'users': row = save_user(db, user, m, values, row)
        elif key == 'roles': row = save_role(db, user, m, values, row)
        else: row = save_record(db, user, m, values, row)
    elif action == 'delete':
        if isinstance(row, Role) and (row.protected or db.scalar(select(User.id).where(User.role_id == row.id))):
            raise HTTPException(409, '角色受保护或仍有成员，不能删除')
        if isinstance(row, User):
            if row.id in ['admin-root', user.id]: raise HTTPException(409, '不能删除初始管理员或自己')
            row.enabled = False  # retain relational history; delete means deactivate and revoke sessions
            db.execute(delete(LoginSession).where(LoginSession.user_id == row.id))
        else:
            if isinstance(row, Record) and key == 'seo-inspection-tasks' and db.scalar(select(Record.id).where(Record.module == 'seo-inspection-runs', Record.slug == row.id)):
                raise HTTPException(409, '巡检正在执行，请完成后再删除')
            if isinstance(row, Record) and key in ['station-sync-tasks', 'stations']:
                running = select(Record.id).where(Record.module == 'station-sync-runs', Record.status.in_(['排队中', '采集中']))
                running = running.where(Record.data['taskId'].as_string() == row.id) if key == 'station-sync-tasks' else running.where(Record.slug == row.id)
                if db.scalar(running): raise HTTPException(409, '站点采集正在排队或执行，请完成后再删除')
                if key == 'stations' and db.scalar(select(Record.id).where(Record.module == 'station-sync-tasks', Record.data['station'].as_string() == row.id)):
                    raise HTTPException(409, '请先删除该站点的公告与渠道采集配置')
            if isinstance(row, Record) and key == 'station-notices' and row.data.get('_stationSync'):
                # A source tombstone prevents the next sync from recreating a deleted notice.
                row.data = {**row.data, '_sourceDeleted': True, '_manualFields': sorted(set(row.data.get('_manualFields', [])) | {'status'})}
                row.status = '已删除'
                enqueue_invalidation(db, key)
                audit(db, user, action, m, row.id)
                return row
            if isinstance(row, Record) and key in ['stations', 'test-keys']:
                if db.scalar(select(Record.id).where(Record.module == 'plans', Record.status == '启用')):
                    plans = db.scalars(select(Record).where(Record.module == 'plans', Record.status == '启用'))
                    if any(row.id in str(p.data) for p in plans): raise HTTPException(409, '该记录被启用的测试计划引用，请先修改计划')
            if isinstance(row, Record) and key == 'campaigns' and row.status == '投放中': raise HTTPException(409, '请先暂停投放，再删除广告')
            if isinstance(row, Record) and key == 'reward-codes':
                check_permission(db, user, MODULES['rewards'], 'edit')
                from .reward_delivery import delete_batch
                delete_batch(db, row)
            if isinstance(row, Record) and key == 'rewards':
                if any(r.data.get('rewardId') == row.id for r in db.scalars(select(Record).where(Record.module.in_(['reward-codes', 'redemptions'])))):
                    raise HTTPException(409, '权益已有库存或兑换记录，请停用而非删除')
            if isinstance(row, Record) and key == 'probe-accounts' and db.scalar(select(Record.id).where(Record.module == 'account-sync-runs', Record.slug == row.id)):
                raise HTTPException(409, '账户正在排队或同步，不能删除')
            if isinstance(row, Record) and key == 'station-source-accounts' and db.scalar(select(Record.id).where(Record.module == 'station-sync-tasks', Record.data['sourceAccount'].as_string() == row.id)):
                raise HTTPException(409, '账号仍关联采集任务，请先解除关联再删除')
            if isinstance(row, Record) and key == 'stations' and db.scalar(select(Record.id).where(Record.module == 'station-source-accounts', Record.data['station'].as_string() == row.id)):
                raise HTTPException(409, '该站点仍有采集登录账号，请先移除关联账号')
            if isinstance(row, Record) and key == 'stations' and row.slug:
                db.execute(delete(PageRedirect).where(PageRedirect.destination == '/stations/' + row.slug + '/'))
            db.delete(row)
        enqueue_invalidation(db, key)
    elif action in ['approve', 'reject']:
        if not isinstance(row, (Record, Report)) or row.status not in ['待审核', '已驳回']:
            raise HTTPException(409, '当前状态不支持审核')
        row.status = '已通过' if action == 'approve' else '已驳回'
        if isinstance(row, Report):
            row.visibility = '公开可见' if action == 'approve' else '内部可见'
        else:
            row.data = {**row.data, 'reviewNote': str(values.get('reviewNote', ''))[:2000]}
            if action == 'approve' and key == 'submissions':
                station_id = row.data.get('publishedStationId')
                if not station_id:
                    slug = str(values.get('slug', ''))
                    if not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', slug): raise HTTPException(422, '首次通过收录时请填写规范页面标识 slug')
                    station = Record(module='stations', name=row.name, slug=slug, owner_id=row.owner_id, status='已收录', data={**row.data, 'slug': slug, 'categories': [row.data['category']], 'serviceStatus': '待核验', 'sourceDate': str(date.today())})
                    db.add(station)
                    db.flush()
                    row.data = {**row.data, 'publishedStationId': station.id}
                    if row.owner_id: award(db, row.owner_id, 'contribution:' + row.id, '贡献站点审核通过', 20)
            if action == 'approve' and key == 'reviews' and row.owner_id:
                award(db, row.owner_id, 'review:' + row.id, '点评审核通过', 8)
            if action == 'approve' and key == 'campaigns' and row.owner_id:
                db.add(Record(module='messages', name='广告审核通过', owner_id=row.owner_id, status='未读', data={'body': row.name + ' 已通过审核，支付确认后安排投放。'}))
        enqueue_invalidation(db, key)
    elif action == 'share' and isinstance(row, Report):
        if row.status != '已通过': raise HTTPException(409, '报告审核通过后才可分享')
        row.share_token = secrets.token_urlsafe(24)
    elif action == 'sync' and key == 'probe-accounts':
        from .account_connector import queue_sync
        if row.status != '启用': raise HTTPException(409, '请先启用账户')
        check_permission(db, user, MODULES['test-keys'], 'create')
        check_permission(db, user, MODULES['test-keys'], 'edit')
        queue_sync(db, row)
    elif action == 'calibrate' and key == 'fingerprint-baselines':
        from .fingerprint import queue_calibration
        check_permission(db, user, MODULES['test-keys'], 'read')
        queue_calibration(db, row)
    elif action == 'run' and key == 'station-sync-tasks':
        from .station_sources import queue_sync
        queued = queue_sync(db, row, user)
        row.data = {**row.data, 'lastQueuedRun': queued.id}
    elif action == 'run' and key == 'seo-inspection-tasks':
        from .seo_inspection import queue_inspection
        queued = queue_inspection(db, row, user)
        db.flush()
        row.data = {**row.data, 'lastQueuedRun': queued.id}
    elif action == 'recheck' and key == 'seo-issues':
        from .seo_inspection import queue_issue_recheck
        queue_issue_recheck(db, row, user)
    elif action == 'run' and key == 'collection-tasks':
        from .collection import queue_collection
        queued = queue_collection(db, row, user.id)
        row.data = {**row.data, 'lastQueuedRun': queued.id}
    elif action in ['run', 'retry', 'cancel']:
        from .testing import execution_action
        row = execution_action(db, user, m, row, action)
    elif action == 'pause':
        if isinstance(row, Record):
            if key == 'model-suggestions':
                row.status = '停用' if row.status == '启用' else '启用'
                row.data = {**row.data, 'status': row.status}
                row.version += 1
                enqueue_invalidation(db, key)
            else:
                row.status = '已暂停' if row.status in ['启用', '投放中'] else '启用' if key != 'campaigns' else '已暂停'
    elif action in ['acknowledge', 'resolve'] and isinstance(row, Record):
        row.data = {**row.data, 'eventStatus': '已确认' if action == 'acknowledge' else '已解决'}
    elif action == 'pay':
        raise HTTPException(503, '在线支付渠道未配置，请联系平台核对付款；不会自动标记为已支付')
    elif action == 'discover':
        from .testing import discover_models
        discover_models(db, row)
    else:
        raise HTTPException(422, '不支持的操作')
    db.flush()
    if key == 'fingerprint-baselines':
        from .fingerprint import recalibrate
        recalibrate(db)
    from .localization import sync_record
    if isinstance(row, Record):
        if action == 'delete':
            for item in db.scalars(select(Record).where(Record.module == 'translations')):
                if item.data.get('recordId') == row.id:
                    db.delete(item)
        else:
            sync_record(db, row)
            if key == 'submissions' and action == 'approve':
                station = db.get(Record, row.data.get('publishedStationId'))
                if station:
                    sync_record(db, station)
    audit(db, user, action, m, row.id if row else id or '')
    return row
