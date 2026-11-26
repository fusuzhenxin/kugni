"""Admin configuration for public and authenticated station metadata."""


def extend(catalog, add):
    add('station-source-accounts', '采集登录账号', '/admin/collection/accounts/', [
        dict(key='name', label='账号名称', required=True),
        dict(key='station', label='所属中转站', type='select', required=True),
        dict(key='adapter', label='登录系统', type='select', options=['Sub2API', 'Foxcode'], required=True),
        dict(key='baseUrl', label='控制台网站地址', type='url', required=True, help='填写控制台 HTTPS 根地址，不填 /v1 或登录页路径。'),
        dict(key='account', label='登录邮箱 / 用户名', required=True),
        dict(key='password', label='登录密码', type='password', help='加密保存；编辑留空保留原密码。只在会话失效且无法续期时重新登录。'),
        dict(key='connection', label='连接方式', type='select', options=['直连', '配置的采集代理'], help='代理需由服务器配置；不会读取系统代理或改变系统网络设置。'),
        dict(key='status', label='账号状态', type='select', options=['启用', '停用'], required=True),
    ], [('name', '账号'), ('station', '中转站'), ('adapter', '系统'), ('authState', '登录状态'), ('lastLoginAt', '上次登录（北京时间）'), ('lastUsedAt', '上次使用（北京时间）'), ('status', '状态')],
        ['create', 'view', 'edit', 'delete'], group='数据采集')
    add('station-sync-tasks', '站点公告与渠道采集', '/admin/collection/stations/', [
        dict(key='name', label='配置名称', required=True),
        dict(key='station', label='所属中转站', type='select', required=True),
        dict(key='sourceBaseUrl', label='账户网站地址', type='url', help='留空使用站点官网；填写控制台根地址，不填 /v1。登录采集需与绑定账号的控制台地址一致。'),
        dict(key='sourceAdapter', label='公告采集接口', type='select', options=['New API 公开接口', 'Sub2API', 'Foxcode', 'RightCode', 'PackyCode 公告', '犀速 AI 公告页', 'OnlineOrNot', '302.AI']),
        dict(key='connection', label='公开采集连接', type='select', options=['直连', '配置的采集代理'], help='公开接口使用此设置；登录接口使用采集账号的连接设置。代理需在服务器配置，不读取系统代理。'),
        dict(key='sourceAccount', label='采集登录账号', type='select', source='station-source-accounts', help='公开接口无需选择；登录接口需选择同站点、同系统、同地址的启用账号。'),
        dict(key='datasets', label='采集内容', type='multiselect', options=['站点公告', '渠道状态', '模型与报价'], required=True),
        dict(key='pricingAdapter', label='模型报价来源', type='select', options=['New API 公开报价']),
        dict(key='priceCurrency', label='报价币种', type='select', options=['未确认', 'USD', 'CNY'], help='仅在核实来源后设置；未确认时保留倍率，不推测金额。'),
        dict(key='tokenPriceBase', label='1倍率每百万Token基准单价', type='number', help='按来源实际计费说明填写。留空仅同步原始倍率；阶梯计费不按此估价。'),
        dict(key='noticePolicy', label='公告发布策略', type='select', options=['先保存草稿', '自动发布'], help='默认先审核；重复采集不重复新增，人工改过的字段会保留。'),
        dict(key='statusAdapter', label='渠道状态来源', type='select', options=['New API 公开监测', 'Uptime Kuma', 'Statuspage', 'Sub2API 渠道监控', 'Sub2API 聚合监控', 'RightCode 模型可用性', 'OnlineOrNot', '兔子API 模型性能', 'Better Stack 状态页', 'AruHub 渠道状态', 'FluxLane 公开调用表现']),
        dict(key='statusPageUrl', label='公开状态页', type='url', help='Kuma 填完整 /status/页面标识；Statuspage / OnlineOrNot / Better Stack 填公开状态页。兔子API 按本站已展示报价型号同步，最多250款。New API 无需填写。'),
        dict(key='schedule', label='更新周期', type='select', options=['仅手动', '间隔执行', '每日定时'], required=True),
        dict(key='interval', label='间隔分钟', type='number', help='15–10080 分钟；推荐 30 分钟，避免频繁请求服务商。'),
        dict(key='dailyTime', label='每日更新时间', type='time', help='每日定时时使用，北京时间（UTC+8）。'),
        dict(key='status', label='配置状态', type='select', options=['启用', '停用'], required=True),
    ], [('name', '配置'), ('station', '中转站'), ('datasets', '采集内容'), ('schedule', '更新周期'), ('nextRun', '下次执行（北京时间）'), ('lastResult', '最近结果'), ('status', '状态')], ['create', 'view', 'edit', 'run', 'delete'], group='数据采集')
    add('station-sync-runs', '站点采集记录', '/admin/collection/station-runs/', [dict(key='station', label='所属中转站', source='stations')],
        [('name', '配置'), ('station', '中转站'), ('status', '状态'), ('noticeCount', '公告变更'), ('channelCount', '来源监测项'), ('modelCount', '模型'), ('quoteCount', '型号/分组报价'), ('finishedTime', '完成时间（北京时间）')], ['view'], group='数据采集')
    modules = {m['key']: m for m in catalog['modules']}
    modules['station-source-accounts'].update(icon='key', description='密码与登录会话加密保存，详情和日志不返回凭证。优先复用有效登录态，过期后先续期，无法续期再自动登录；验证码、二次验证与权限不足会明确提示。', bulkActions=[], bulkFields=[])
    modules['station-sync-tasks'].update(icon='clock', description='同步公告、渠道状态和公开模型报价，支持北京时间定时。精确区分型号与分组，保留人工资料与真实计费依据；失败保留上次数据。', bulkActions=['run', 'edit', 'delete'], bulkFields=['status', 'schedule', 'dailyTime'])
    modules['station-sync-runs'].update(icon='list', description='查看公告变更、来源监测项、部分成功及错误。监测项可能包含官网等基础设施；零项表示来源未返回数据，不代表渠道健康。')

