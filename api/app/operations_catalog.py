"""Operations modules share normal RBAC, menus, actions and audit records."""


def extend(catalog, add):
    add('collection-health', '采集健康', '/admin/collection/health/', [], [], ['view'], group='数据采集')
    add('station-source-findings', '渠道来源核查', '/admin/collection/sources/', [
        dict(key='name', label='核查名称', required=True), dict(key='station', label='中转站', type='select', required=True),
        dict(key='sourceUrl', label='公开来源地址', type='url'),
        dict(key='status', label='核查状态', type='select', options=['已接入', '未发现公开接口', '需要登录', '需要验证', '待核实', '已跳过'], required=True),
        dict(key='scope', label='数据范围', help='区分模型渠道、分组统计和网站服务组件。'),
        dict(key='body', label='核查依据与处理说明', type='textarea', required=True),
        dict(key='checkedAt', label='核查日期', type='date'),
    ], [('name', '来源'), ('station', '中转站'), ('status', '核查结果'), ('scope', '范围'), ('checkedAt', '核查日期')], group='数据采集')
    add('translation-health', '英文完成度', '/admin/content/translation-health/', [], [], ['view', 'retry'], group='内容与导航')
    add('seo-inspection-tasks', 'SEO 巡检', '/admin/content/seo-inspections/', [
        dict(key='name', label='巡检名称', required=True),
        dict(key='locales', label='巡检语言', type='multiselect', options=['中文', '英文'], required=True),
        dict(key='maxPages', label='每轮最多页面', type='number', help='20–10000；站内路径按批次轮换，避免长期只检查首页。'),
        dict(key='checkLinks', label='站内链接检查', type='select', options=['开启', '关闭']),
        dict(key='schedule', label='更新周期', type='select', options=['仅手动', '每日定时'], required=True),
        dict(key='dailyTime', label='每日时间', type='time', help='北京时间。'),
        dict(key='status', label='状态', type='select', options=['启用', '停用'], required=True),
    ], [('name', '巡检'), ('locales', '语言'), ('lastResult', '最近结果'), ('nextRun', '下次执行（北京时间）'), ('status', '状态')], ['create', 'view', 'edit', 'run', 'delete'], group='内容与导航')
    add('seo-inspection-runs', 'SEO 巡检记录', '/admin/content/seo-inspection-runs/', [],
        [('name', '巡检'), ('status', '状态'), ('checked', '已检查'), ('total', '本轮页面'), ('issueCount', '问题'), ('finishedTime', '完成时间（北京时间）')], ['view'], group='内容与导航')
    add('seo-issues', 'SEO 问题', '/admin/content/seo-issues/', [],
        [('name', '问题'), ('path', '页面'), ('severity', '级别'), ('status', '状态'), ('lastSeenAt', '最近发现（北京时间）')], ['view', 'recheck'], group='内容与导航')
    modules = {m['key']: m for m in catalog['modules']}
    for key in ['collection-health', 'translation-health']:
        modules[key].update(kind='operations', icon='activity', description='查看实时数据覆盖、失败原因与处理入口，结果按当前数据库统计。')
    modules['collection-health']['description'] = '统一查看采集覆盖、更新时效、排队、失败原因与最近运行。'
    modules['translation-health']['description'] = '按公开内容查看英文完成度、重复文本复用、失败原因和待校对项目。'
    for key in ['seo-inspection-tasks', 'seo-inspection-runs', 'seo-issues']:
        modules[key].update(icon='compass', description='检查真实服务端 HTML、规范链接、元信息、结构化数据、多语言与站内链接；结果不代表搜索引擎已收录。')
    modules['station-source-findings'].update(icon='layers', description='保留每家站点的独立来源、范围与核查依据；未发现公开接口不等于该站不存在状态功能。')
    modules['seo-issues'].update(bulkActions=['recheck'], bulkFields=[])
    catalog['actions'].update(recheck='重新检查', bulkRecheck='批量复检')
