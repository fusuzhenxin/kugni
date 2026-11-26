# 中转站采集覆盖情况

更新日期：2026-11-26。20 家已收录站点中，17 家已接入并启用每日采集；aigocode 按站主要求跳过；Foxcode、AICodeMirror 仍受站方访问验证阻挡。

现有 453 条已发布采集公告。17 家启用任务全部自动发布，按北京时间 04:00–05:20 每 5 分钟错峰更新；时间、采集接口与连接方式可在后台修改。来源当前为空时保持为空，不制造公告、模型状态或采样历史。

公告覆盖与状态覆盖分开统计：目前 9 家有来源状态数据，其中 6 家有带时间的历史，另 1 家 AruHub 提供无逐条时间戳的近期调用记录。历史来源包括 ZetaTechs 的官网/API/文档服务组件和 FluxLane 全站调用日统计，不能把它们当作具体模型的上游分组。此前“17 家接入”仅表示公告与采集任务覆盖，不表示 17 家都有渠道历史。

| 中转站 | 采集公告 | 监测分组/项 | 模型与分组记录 | 当前情况 |
| --- | ---: | ---: | ---: | --- |
| 0elog | 3 | 0 | 0 | 已完成；每日 05:15 |
| 302.AI | 1 | 0 | 0 | 已完成；每日 05:20 |
| 7Code | 71 | 0 | 0 | 已完成；每日 04:00 |
| 8sToken | 18 | 0 | 0 | 已完成；每日 04:05 |
| AICodeMirror | 0 | 0 | 0 | 正式域名返回 Cloudflare 访问验证；未创建反复失败的计划 |
| aigocode | 0 | 0 | 0 | 站主选择跳过；临时采集账号已清理，无定时任务 |
| AIHUBMIX | 12 | 5 | 0 | 已完成；每日 05:05 |
| aruhub API | 0 | 26 | 46 | 已补接独立渠道页；90 分钟近期调用；每日 04:10，长窗口失败记部分成功 |
| foxcode | 0 | 0 | 0 | 验证码待处理；配置停用，不重复登录 |
| MNAPI | 0 | 0 | 0 | 部分成功；每日 04:20 |
| PackyCode | 135 | 0 | 0 | 已完成；每日 05:10 |
| RightCode | 14 | 13 | 113 | 已完成；每日 04:55 |
| WAWA ZZ | 6 | 5 | 0 | 已完成；每日 04:50 |
| ZetaTechs API | 14 | 3 | 0 | 已补接独立 Better Stack 状态页；每日 04:40，按日服务组件历史 |
| 兔子API | 99 | 11 | 269 | 已补接独立模型性能接口；每日 04:35，117 款型号有分组记录；部分成功说明见下 |
| 智流 FluxLane | 19 | 1 | 3 | 已补接官网按日调用统计与型号周汇总；每日 04:15；不是上游分组 |
| 犀速AI | 3 | 0 | 0 | 已完成；每日 05:00 |
| 球球Token | 57 | 20 | 0 | 已完成；每日 04:25 |
| 瓦瓦AI | 0 | 11 | 270 | 已完成；每日 04:45 |
| 酸奶AI | 1 | 0 | 0 | 已完成；每日 04:30 |

0 只表示本地尚未获得对应状态，不能推断该站没有状态功能。7Code、8sToken、PackyCode、MNAPI 的公开配置关闭通用监控；酸奶AI、0elog 虽启用通用监控，但该接口返回空，尚未确认独立来源。AruHub 的通用监控也为空，但已有独立 `/channel-status`；FluxLane 官网使用独立周报，两家均已补接。犀速AI、302.AI 尚未确认渠道状态来源。Foxcode/AICodeMirror 受访问验证阻挡，aigocode 按站主要求跳过。复查证据 `verification/channel-source-coverage-audit.json` 记录补接前快照；最新核查结果保存在后台「渠道来源核查」，共20家。

九家 New API 兼容来源已启用模型与报价自动同步，共3,477条精确型号与分组报价。币种/基准单价未核实时保留原始倍率；动态计费保留规则，不推测金额。详细范围、后台入口与运行说明见 [DATA-OPERATIONS.md](DATA-OPERATIONS.md)。

监测项可能包括官网/基础设施，不等于所有模型都经过检测。来源心跳超过 15 分钟标为未核验，历史状态仍保留；每日快照与本站实测分开展示。球球Token 和 AIHUBMIX 仅有来源自报状态，未提供可绘制的历史。

兔子API 按本站报价中 154 个独立型号核对来源最新目录，138 款仍在目录中，最终有 117 款返回分组记录（269 条，11 个分组）。16 款已不在来源最新目录，任务明确记录警告并标记部分成功；另 21 款未返回分组记录，抽查 aqa、abab6.5-chat、abab6.5s-chat 均为来源无样本。未将全站型号汇总状态套入这些型号或分组。该适配按本站报价选择型号，最多 250 款；24 小时之外没有历史的部分仍留空。

ZetaTechs 官网公开链接 `https://status.zetatechs.com`，按原页面公开日期读取三个服务组件的按日历史，只保留近 30 日；不填造实时心跳，不绑定任何模型 ID。原页面日期未标时区，本站明确按公开日期的 UTC 日绘制，当前日不填未来部分。

两家已通过正常后台 API 更新原有任务并由常驻 worker 执行，沿用原每日时间与公告策略。证据 `verification/additional-channel-source-runs.json`、`verification/additional-channel-release.json`。页面已区分尚未接入、来源未返回数据、型号/分组无对应监测，以及来源未提供历史。

AruHub：独立公开 `/api/channel-status?minutes=1440` 与 `minutes=10080`，24 小时超时时回退真实 `minutes=90`；分组目录来自 `/api/pricing`。前一次真实 worker 快照为26组、891条分组调用样本、32款型号的58条型号与分组记录；本轮报价同步时再次采集，最新为26组、46条型号与分组记录，短窗口计数会变化，最新证据见 `verification/data-operations-release.json`。来源 24 小时超时、7 天返回 503，任务记部分成功并隐藏不可用窗口；后续每日仍会尝试长窗口。每组最多 60 条调用均无逐条时间戳，按来源顺序展示，不计入时间历史覆盖。分组百分比为来源分组成功率；型号百分比仅按精确型号与分组的近期样本计算。旧报价分组与新名称不做模糊关联，已有监测的行优先展示。此前证据 `verification/aruhub-channel-task.json`、`verification/aruhub-channel-release.json`。

RightCode：`/configs` 公告、`/upstreams/public` 分组名、`/models/availability/all` 模型可用性；保留 24h/7d/30d 的 `no_sample` 缺口，模型视图百分比为最近有效时段，分组状态按已知模型采样取最差状态。AIHUBMIX：公开 OnlineOrNot 组件与 RSS 事故通知，组件不伪造心跳时间。PackyCode：独立公告接口完整读取 135 条，而非只读取控制台摘要的 20 条。302.AI：使用官方脚本的 `/proxy/announcements`，未将商品 banner 当公告。

新增六家任务首次真实 worker 均已完成，无错误与警告。证据 `verification/remaining-source-configured.json`、`verification/remaining-source-release.json`；用户跳过 aigocode 的清理记录 `verification/aigocode-skipped.json`。登录账号/密码/会话仍加密保存，新增公开来源不需要密码。

入口：[采集任务](http://127.0.0.1:3001/admin/collection/stations/)、[采集记录](http://127.0.0.1:3001/admin/collection/station-runs/)、[公告管理](http://127.0.0.1:3001/admin/stations/announcements/)。必须保持 worker 常驻。公开采集可选择直连或服务器配置的代理，不读取系统代理；迁移部署时需配置对应网络出口。
