import json
from pathlib import Path

from fastapi import HTTPException

SHARED = Path(__file__).resolve().parents[2] / 'shared'
CATALOG = json.loads((SHARED / 'catalog.json').read_text(encoding='utf-8'))


def add_module(key, title, path, fields, columns, actions=None, group='用户与积分'):
    actions = actions or ['create', 'view', 'edit', 'delete']
    CATALOG['modules'].append(dict(key=key, title=title, path=path, group=group, icon='gift', kind='collection', surface='platform', store=key, permission='platform.' + key, fields=fields, columns=[{'key': k, 'label': v} for k, v in columns], actions=actions, bulkActions=[a for a in ['edit', 'delete', 'approve', 'reject'] if a in actions], bulkFields=['status']))


add_module('rewards', '积分好礼', '/admin/points/rewards/', [dict(key='name', label='权益名称', required=True), dict(key='cost', label='所需积分', type='number', required=True), dict(key='stock', label='可兑换数量', type='number', required=True), dict(key='description', label='权益说明', type='textarea'), dict(key='dailyLimit', label='每人每日限兑', type='number'), dict(key='status', label='状态', type='select', options=['启用', '停用'])], [('name', '权益'), ('cost', '积分'), ('stock', '剩余数量'), ('status', '状态')])
add_module('redemptions', '兑换处理', '/admin/points/redemptions/', [dict(key='fulfillment', label='发放说明', type='textarea', required=True), dict(key='status', label='处理状态', type='select', options=['待处理', '已发放', '已取消'])], [('name', '兑换权益'), ('cost', '消耗积分'), ('status', '状态'), ('updated', '时间')], ['view', 'edit'])
add_module('reviews', '评价审核', '/admin/content/reviews/', [dict(key='body', label='评价内容', type='textarea'), dict(key='reply', label='公开回复', type='textarea')], [('name', '评价对象'), ('body', '评价'), ('status', '状态')], ['view', 'edit', 'approve', 'reject', 'delete'])
add_module('feedback', '反馈与纠错', '/admin/content/feedback/', [dict(key='name', label='问题标题', required=True), dict(key='body', label='内容', type='textarea'), dict(key='reply', label='处理意见', type='textarea'), dict(key='status', label='状态', type='select', options=['待处理', '已处理'])], [('name', '反馈'), ('status', '状态'), ('updated', '提交时间')], ['view', 'edit', 'delete'])
add_module('coding-plans', '编程套餐', '/admin/models/coding-plans/', [dict(key='name', label='套餐名称', required=True), dict(key='station', label='服务商', type='select', required=True), dict(key='price', label='周期价格', type='number', required=True), dict(key='currency', label='币种', type='select', options=['CNY', 'USD']), dict(key='cycle', label='计费周期', type='select', options=['月', '周', '年']), dict(key='models', label='模型与客户端', required=True), dict(key='limits', label='用量与限制', type='textarea', required=True), dict(key='refund', label='退款说明', type='textarea'), dict(key='url', label='官方说明页', type='url', required=True), dict(key='verifiedAt', label='资料核对日期', type='date', required=True), dict(key='status', label='状态', type='select', options=['已发布', '草稿'])], [('name', '套餐'), ('price', '周期价格'), ('cycle', '周期'), ('verifiedAt', '核对日期'), ('status', '状态')], group='站点与模型')

next(m for m in CATALOG['modules'] if m['key']=='orders')['actions'].append('confirmPayment')
next(m for m in CATALOG['modules'] if m['key']=='users')['fields']=[f for f in next(m for m in CATALOG['modules'] if m['key']=='users')['fields'] if f['key']!='mfa']
add_module('translations', '英文翻译', '/admin/content/translations/',
           [dict(key='translation', label='英文译文', type='textarea', required=True, help='保存后视为人工校对；中文改变时提示待校对，不会自动覆盖。')],
           [('name', '内容与字段'), ('source', '中文原文'), ('translation', '英文译文'), ('status', '翻译状态'), ('error', '异常说明')],
           ['view', 'edit', 'retry'], group='内容与导航')
add_module('model-suggestions', '常用模型', '/admin/models/suggestions/',
           [dict(key='name', label='模型 ID', required=True, help='填写接口使用的准确型号，最多 160 个字符；品牌图标自动识别。'),
            dict(key='sort', label='排序', type='number', help='非负整数；前台按品牌分组，同品牌内数字越小越靠前。'),
            dict(key='status', label='状态', type='select', options=['启用', '停用'], required=True)],
           [('name', '模型 ID'), ('sort', '排序'), ('status', '状态')],
           ['create', 'view', 'edit', 'delete', 'pause'], group='站点与模型')
add_module('model-directory', '模型大全', '/admin/models/directory/',
           [dict(key='name', label='模型名称', required=True), dict(key='summary', label='模型简介', type='textarea'), dict(key='status', label='展示状态', type='select', options=['已发布', '草稿', '来源已移除'])],
           [('name', '模型'), ('modelId', '接口型号'), ('vendor', '发行商'), ('status', '状态'), ('collectedAt', '采集时间')], ['view', 'edit'], group='站点与模型')
add_module('model-packages', '模型套餐', '/admin/models/packages/',
           [dict(key='name', label='产品名称', required=True), dict(key='summary', label='产品简介', type='textarea'), dict(key='status', label='展示状态', type='select', options=['已发布', '草稿', '来源已移除'])],
           [('name', '套餐产品'), ('vendor', '厂商'), ('tierCount', '档位数'), ('status', '状态'), ('collectedAt', '采集时间')], ['view', 'edit'], group='站点与模型')
add_module('collection-tasks', '数据采集任务', '/admin/collection/tasks/',
           [dict(key='name', label='任务名称', required=True), dict(key='datasets', label='采集内容', type='multiselect', options=['模型大全', '模型套餐'], required=True),
            dict(key='schedule', label='更新周期', type='select', options=['仅手动', '间隔执行', '每日定时', 'Cron 表达式'], required=True),
            dict(key='interval', label='间隔分钟', type='number', help='间隔执行时使用，最短 60 分钟。'), dict(key='dailyTime', label='每日更新时间', type='time', help='每日定时时使用，北京时间（UTC+8）。'),
            dict(key='cron', label='Cron 表达式', help='五段表达式，北京时间；例如 0 3 * * * 为每天 03:00，最密每小时一次。'),
            dict(key='syncMode', label='资料更新方式', type='select', options=['保留人工修改', '跟随来源更新'], required=True, help='跟随来源更新会覆盖模型名称、简介和展示状态的人工修改。'),
            dict(key='status', label='任务状态', type='select', options=['启用', '停用'], required=True)],
           [('name', '任务'), ('datasets', '采集内容'), ('schedule', '周期'), ('nextRun', '下次执行（北京时间）'), ('lastResult', '上次结果'), ('status', '状态')], ['create', 'view', 'edit', 'run', 'delete'], group='数据采集')
add_module('collection-runs', '采集运行记录', '/admin/collection/runs/', [],
           [('name', '任务'), ('status', '状态'), ('progress', '进度'), ('modelCount', '模型'), ('productCount', '套餐产品'), ('tierCount', '套餐档位'), ('error', '异常说明'), ('updated', '更新时间')], ['view'], group='数据采集')
from .capability_catalog import extend
extend(CATALOG, add_module)
from .station_source_catalog import extend as extend_station_sources
extend_station_sources(CATALOG, add_module)
from .operations_catalog import extend as extend_operations
extend_operations(CATALOG, add_module)
MODULES = {m['key']: m for m in CATALOG['modules']}
for key in ['model-directory', 'model-packages']:
    MODULES[key].update(icon='layers', bulkFields=['status'], description='来源自动采集，保留准确型号、原币种及额度说明。可修改展示名称、简介或批量上下架；默认更新时保留人工修改。')
MODULES['collection-tasks'].update(icon='clock', bulkFields=['status'], description='采集源固定为 Hvoy 公开模型和套餐资料。可手动运行或设置北京时间定时；失败保留上次数据，更新后自动刷新页面。')
MODULES['collection-runs'].update(icon='list', description='查看排队、执行进度、采集数量与异常原因。失败不会清空公开页面，重试请在采集任务中点击立即运行。')
MODULES['model-suggestions'].update(icon='layers', bulkFields=['status', 'sort'], description='维护前台检测下拉中的常用型号。按品牌连续展示，图标自动识别；保存后自动更新中英文页面，仍可手动填写或通过 Key 获取其他型号。')
MODULES['translations'].update(bulkActions=['retry'], bulkFields=[])
for f in MODULES['plans']['fields']:
    if f['key'] == 'items': f['options'] = list(dict.fromkeys([*f['options'], '流式性能']))
_source_sites = json.loads((SHARED / 'seed.json').read_text(encoding='utf-8'))['source']['sites']
for f in MODULES['categories']['fields']:
    if f['key'] == 'icon':
        _categories = json.loads((SHARED / 'seed.json').read_text(encoding='utf-8'))['config']['categories']
        f['options'] = sorted(set(f.get('options', [])) | {c['icon'] for c in _categories if c.get('icon')})
for f in MODULES['stations']['fields']:
    if f['key'] == 'models': f['options'] = sorted(set(f.get('options', [])) | {name for s in _source_sites for name in s.get('models', [])})
    if f['key'] == 'payments': f['options'] = sorted(set(f.get('options', [])) | {p['name'] for s in _source_sites for p in s.get('payments', [])})
MODULES['users']['fields'].append(dict(key='verified', label='邀请有效性核验', type='select', options=['未核验', '已核验'], help='人工核验有效注册后，为邀请人发放一次奖励。'))
MODULES['categories'].update(actions=['create', 'view', 'edit', 'delete'], bulkActions=['edit', 'delete'], bulkFields=['status', 'sort'])
MODULES['menus']['fields'].insert(1, dict(key='module', label='关联功能模块', type='select', options=list(MODULES), required=True))
MODULES['seo'].update(kind='collection', actions=['create', 'view', 'edit', 'delete'], columns=[dict(key='name', label='页面'), dict(key='path', label='路径'), dict(key='title', label='SEO 标题')])
MODULES['models']['fields'].insert(1, dict(key='slug', label='页面标识', required=True, help='稳定的小写英文、数字和连字符。'))
for f in MODULES['models']['fields']:
    if f['key'] == 'modelId': f.update(label='模型 / 生态标识', help='资料库可维护模型生态；具体可调用型号从测试 Key 获取。')
MODULES['publishers']['fields'].append(dict(key='password', label='登录密码（新建必填）', type='password'))
MODULES['orders']['fields'] = [f for f in MODULES['orders']['fields'] if f['key'] == 'note']
MODULES['p-orders']['fields'] = []
MODULES['test-alerts']['fields'] = [f for f in MODULES['test-alerts']['fields'] if f['key'] != 'receiver']
for f in MODULES['test-alerts']['fields']:
    if f['key'] == 'channel': f.update(options=['站内通知'], help='告警显示在规则详情，同时写入站内消息，不对外发送。')
MODULES['resources']['fields'] = [f for f in MODULES['resources']['fields'] if f['key'] not in ['version', 'path']]
MODULES['resources']['fields'] += [dict(key='slug', label='资源标识', required=True), dict(key='release', label='版本号', required=True), dict(key='body', label='资源内容', type='editor', required=True)]
MODULES['resources']['columns'] = [dict(key='name', label='资源名称'), dict(key='type', label='类型'), dict(key='release', label='版本'), dict(key='status', label='状态')]
for m in MODULES.values():
    for f in m['fields']:
        if f['key'] in ['station', 'stationId']: f.update(source='stations', options=[])
        if f['key'] == 'placement': f.update(source='placements', options=[])
        if f['key'] == 'category': f.update(source='categories', options=[])
        if m['key'] == 'stations' and f['key'] == 'minRecharge': f.update(type='text', help='保留金额、币种和起充条件，未公开可留空。')
        if m['key'] == 'test-keys' and f['key'] == 'expires': f['required'] = False
    for a in m.get('bulkActions', []):
        code = 'bulk' + a[0].upper() + a[1:]
        if code not in m['actions']:
            m['actions'].append(code)
CATALOG['permissions'] = [dict(code=m['permission'] + '.' + a, module=m['key'], action=a, group=m['group'], title=m['title']) for m in MODULES.values() for a in ['read', *m['actions']]]


def module(key: str) -> dict:
    if key not in MODULES:
        raise HTTPException(404, '模块不存在')
    return MODULES[key]
