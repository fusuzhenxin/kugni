"""Configuration for the operational capabilities, shared with the admin UI."""


def extend(catalog, add):
    modules = {m['key']: m for m in catalog['modules']}
    account = modules['probe-accounts']
    account.update(description='连接 New API / One API 账户，自动同步 Key、模型和余额。账号密码或管理令牌加密保存，定时默认关闭。',
                   actions=['create', 'view', 'edit', 'delete', 'sync', 'bulkEdit', 'bulkDelete', 'bulkSync'], bulkActions=['edit', 'delete', 'sync'], bulkFields=['status', 'checkin', 'syncInterval'])
    account['fields'] = [
        dict(key='name', label='账户名称', required=True), dict(key='station', label='所属中转站', type='select', required=True),
        dict(key='adapter', label='账户系统', type='select', options=['New API', 'One API'], required=True),
        dict(key='baseUrl', label='账户网站地址', type='url', required=True, help='管理后台根地址，例如 https://example.com，不填 /v1。'),
        dict(key='account', label='登录用户名'), dict(key='password', label='登录密码', type='password', help='编辑留空保留；遇到验证码或二次验证时会明确报错。'),
        dict(key='managementToken', label='管理访问令牌', type='password', help='可替代用户名密码。填写账户访问令牌，不是模型 API Key。'),
        dict(key='remoteUserId', label='远端用户 ID', type='number', help='使用管理令牌时填写 New API 用户 ID。'),
        dict(key='tokenName', label='自动维护的 Key 名称', help='留空使用 KUGNI 加账户 ID，重试不会反复新建。'),
        dict(key='apiBaseUrl', label='模型 API 地址', type='url', help='留空使用账户网站地址；可以单独填写 /v1 地址。'),
        dict(key='protocols', label='检测协议', type='multiselect', options=['OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic Messages', 'Google Gemini'], required=True),
        dict(key='credentialRef', label='同步目标 Key', type='select', source='test-keys', help='选填；为空时首次同步自动创建本地 Key 记录。'),
        dict(key='checkin', label='签到策略', type='select', options=['不自动签到', '每日签到']),
        dict(key='syncInterval', label='自动同步间隔（分钟）', type='number', help='0 或留空为仅手动；最短 15 分钟。'),
        dict(key='quotaPerUnit', label='每单位余额的 Quota 数', type='number', help='标准系统通常为 500000；按站点实际换算设置。'),
        dict(key='currency', label='余额单位', help='例如 USD、CNY 或站点积分，不自动换汇。'),
        dict(key='balanceThreshold', label='低余额提醒阈值', type='number'),
        dict(key='status', label='状态', type='select', options=['启用', '已暂停']), dict(key='note', label='备注', type='textarea'),
    ]
    account['columns'] = [dict(key=k, label=v) for k, v in [('name', '账户'), ('adapter', '系统'), ('balance', '余额'), ('currency', '单位'), ('syncState', '同步状态'), ('checkinResult', '签到结果'), ('lastSyncedAt', '上次同步'), ('status', '状态')]]
    add('account-sync-runs', '账户同步记录', '/admin/tests/account-sync-runs/', [], [('name', '账户'), ('status', '状态'), ('balance', '余额'), ('checkinResult', '签到'), ('error', '异常'), ('updated', '时间')], ['view'], group='检测与报告')
    add('fingerprint-baselines', '指纹基线库', '/admin/tests/fingerprint-baselines/', [
        dict(key='name', label='基线名称', required=True), dict(key='keyId', label='可信源 Key', type='select', source='test-keys', required=True),
        dict(key='protocol', label='调用协议', type='select', options=['OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic Messages', 'Google Gemini'], required=True),
        dict(key='model', label='准确模型 ID', required=True), dict(key='sourceUrl', label='来源依据', type='url', required=True, help='使用已核验的官方或可信接口；返回的 model 字段不能代替来源核验。'),
        dict(key='rounds', label='采样轮数', type='number', help='6–30 轮，每轮三题；前部训练，后部独立校准。'),
        dict(key='status', label='状态', type='select', options=['待采集', '启用', '停用']),
    ], [('name', '基线'), ('model', '模型'), ('sampleCount', '有效轮数'), ('validation', '校准状态'), ('status', '状态')], ['create', 'view', 'edit', 'delete', 'calibrate'], group='检测与报告')
    modules['rewards']['fields'].append(dict(key='deliveryMode', label='发放方式', type='select', options=['人工发放', '自动发码'], help='自动发码需先在兑换码库存导入有效权益。'))
    add('reward-codes', '兑换码库存', '/admin/points/reward-codes/', [dict(key='name', label='批次名称', required=True), dict(key='rewardId', label='所属权益', type='select', source='rewards', required=True), dict(key='codes', label='导入兑换码', type='textarea', required=True, help='每行一份权益，最多 100 行。只在新增时导入，加密保存，重复码不会重复入库。'), dict(key='expires', label='到期日', type='date')], [('name', '批次'), ('rewardId', '权益'), ('available', '可发放'), ('delivered', '已发放'), ('expires', '到期日'), ('status', '状态')], ['create', 'view', 'delete'])
    add('analytics-funnels', '转化漏斗配置', '/admin/analytics/funnels/', [dict(key='name', label='漏斗名称', required=True), dict(key='steps', label='有序步骤', type='textarea', required=True, help='每行 kind|路径前缀|显示名称，例如 pageview|/stations/|浏览站点；支持 pageview、outbound、impression、adclick。'), dict(key='status', label='状态', type='select', options=['启用', '停用'])], [('name', '漏斗'), ('steps', '步骤'), ('status', '状态')], group='流量统计')
    add('messages', '站内通知', '/admin/system/messages/', [], [('name', '通知'), ('body', '内容'), ('status', '状态'), ('created', '时间')], ['view'], group='系统设置')
    catalog['actions'].update(sync='同步账户', bulkSync='批量同步账户', calibrate='采集校准')
