# 中转站公告与渠道状态采集

研究与实现日期：2026-11-26。入口：后台 → 数据采集 → 站点公告与渠道采集。登录凭证在「采集登录账号」，运行记录在「站点采集记录」。已启用 17 家每日任务，现有 453 条已发布采集公告；aigocode 按站主要求跳过，Foxcode 和 AICodeMirror 受站方验证阻挡。各站覆盖范围及部分成功项见 [STATION-SOURCE-COVERAGE.md](STATION-SOURCE-COVERAGE.md)。

## 已核实的公开接口

| 来源 | 公告 | 渠道状态 |
| --- | --- | --- |
| New API | `/api/notice` 和 `/api/status` 的 `announcements`，两者需要同时读 | `/api/uptime/status`，仅代表来源自报 |
| One API | `/api/notice`；兼容有控制台公告的派生版本 | 原版没有标准公开渠道列表 |
| Uptime Kuma | 此适配器不采集事故公告 | 公开 `/status/{slug}` 对应的 config 与 heartbeat 接口 |
| Statuspage | 此适配器不采集事故公告 | 状态站 `/api/v2/summary.json` 的公开组件 |
| Sub2API（登录） | `/api/v1/announcements` | 用户可见的旧版 `/api/v1/channel-monitors` 或 V2 聚合监控；按站点权限选择 |
| Foxcode（登录） | `/api/user/announcements/timeline` | 尚未适配渠道接口；真实登录遇到安全验证，未完成接入 |
| 兔子API 独立模型监控 | 沿用原公告接口 | `/api/perf-metrics?model=准确型号&hours=24&resolution=hour`，按实际分组返回小时统计；型号来自本站已同步报价，并核对公开 `/api/pricing` |
| Better Stack 公开状态页 | 此适配器不采集事故公告 | 从公开 HTML 读取服务组件与按日历史；ZetaTechs 官网明确链接其独立状态站 |
| AruHub 独立渠道页 | 沿用 New API 公告接口，当前为空 | `/api/channel-status?minutes=1440` / `10080`，24 小时失败回退真实 `minutes=90`；`/api/pricing` 补充已配置分组。来源逐条调用无时间戳，不当作时间轴 |

源码依据：

- [New API 路由](https://github.com/QuantumNous/new-api/blob/main/router/api-router.go)、[公告与状态](https://github.com/QuantumNous/new-api/blob/main/controller/misc.go)、[Kuma 代理](https://github.com/QuantumNous/new-api/blob/main/controller/uptime_kuma.go)
- [One API 路由](https://github.com/songquanpeng/one-api/blob/master/router/api.go)、[公开资料接口](https://github.com/songquanpeng/one-api/blob/master/controller/misc.go)
- [Uptime Kuma 公开状态页接口](https://github.com/louislam/uptime-kuma/blob/master/server/routers/status-page-router.js)
- [Statuspage 公开 API](https://www.atlassian.com/software/statuspage/features/statuspage-api)

真实只读调查记录见 `verification/station-source-survey-proxy.json`：aruhub.com 控制台公告为空；api.tu-zi.com 返回 100 条公告；qiuqiutoken.net 返回 56 条。前两站 `/api/notice` 正文为空，说明只读该接口会漏掉控制台公告。前两站公开监测接口虽成功，但渠道数组为空，不能据此判断任何模型是否正常。

补充联调排除了命令沙箱的网络限制：在正常运行环境，安全连接器采用解析校验与固定 IP 直连（不继承系统代理）已成功读取上述三站。早期通用接口去重结果见 `verification/station-source-live-connector.json`：aruhub 无公告/通用公开渠道，兔子 99 条公告/无通用公开渠道，球球 57 条公告/18 个公开渠道。兔子与 AruHub 此后已找到独立状态接口并补接；当前覆盖见 STATION-SOURCE-COVERAGE.md，不能用这份早期通用接口快照判断整站覆盖。数量会随来源更新变化；与初次接口条数也可能因去重不同。

真实常驻 worker 已运行 9 家公开来源，并新增两家登录来源：瓦瓦AI 0 条公告、11 组聚合监控；WAWA ZZ 6 条公告、5 个渠道监控。后两家采集前后登录时间相同，确认复用已保存会话。11 家任务已在北京时间 04:00–04:50 每 5 分钟错峰执行；foxcode 的配置保持停用，避免反复触发验证。证据：`verification/station-source-daily-config.json`、`verification/station-source-daily-worker.json`。没有调用服务商管理员接口，也没有读取上游凭证。

## 配置与更新

1. 新增配置并选择所属站点。账户网站地址填 New API / One API 根地址（不填 `/v1`）；为空时使用站点官网。
2. 勾选公告、渠道或两者。New API 监测无需额外地址；Kuma 填完整公开状态页（例如 `https://status.example.com/status/api`）；Statuspage 填状态站根地址。
3. 公告配置支持「先保存草稿」或「自动发布」，在「站点公告」编辑、批量修改或删除。按站主当前选择，17 家启用任务均已设置自动发布，现有 453 条采集公告已发布；后续直接展示在对应中转站详情页，人工改过的字段仍保留。删除采集公告后会保留内部来源标识，后续不会重新抓回来。
4. 默认仅手动。可选择 15–10080 分钟间隔，或北京时间每日更新。推荐 30 分钟；必须保持独立 worker 运行。
5. 运行任务需要采集运行权限与关联站点编辑权限；采公告还需要公告新增、编辑权限及全部数据范围。保存自动计划、运行以及 worker 落库时均检查权限。新增权限只自动授予超级管理员，自定义角色需明确配置。

登录来源先在「采集登录账号」录入账号、密码、控制台 HTTPS 根地址和系统，再在任务中绑定。绑定账号必须属于同站点、同地址、同系统且启用；绑定和运行还需该账号的编辑权限。密码与会话保存在现有 Credential 表的加密字段，管理 API、审计日志和公开页面不返回凭证。编辑密码留空表示保留；填入新密码会清除旧会话和错误登录锁定。

有有效会话时直接读取；401 才尝试刷新，刷新明确失效才使用保存的密码登录。403、429 和服务异常不会触发重登录。验证码、二次验证或账号密码错误标记「需要处理」并停止反复登录；后台账号详情显示具体原因。Foxcode 当前被站方要求安全验证，尚未获得有效登录会话，不能认定密码错误或宣称已采集成功。

同一站点不会同时执行多个采集；运行中禁止编辑/删除配置或删除站点。任务分项记录成功与失败；接口失败保留旧资料，空列表也不会删除历史公告。公告按来源标识去重并清除远端 HTML；公开页面只输出转义后的文字和有效 HTTP/HTTPS 来源链接。

## 状态的含义

- New API 的监测代理没有心跳时间，核实的源码版本还可能取列表第一条心跳。因此只显示「未核验」及「来源自报正常/异常」，不纳入本站实测成绩。
- 公开监测项可能包括官网、数据库、服务器等基础设施，不能把每一项都解释为模型渠道；模型真实可用性仍以 Key 检测为准。
- Kuma 按时间选择最新心跳。缺心跳、超过 15 分钟或未来时间明显异常，均显示未核验。24 小时可用率缺失显示 `—`，不会显示成 0%。
- Statuspage 使用公开组件状态；组件更新时间不是心跳时间，不会因为长期正常就判离线。
- 间隔任务快照按间隔的两倍过期，至少 30 分钟、最多 24 小时；每日任务保留至下一次计划时间后一小时。心跳新鲜度独立判断，Kuma 与 Sub2API 超过 15 分钟仍显示未核验，不能把每日快照当实时监控。详情页的服务端缓存另有最长约 120 秒刷新延迟。
- Sub2API 旧版展示来源 7 日可用率，V2 展示近 90 分钟成功率和聚合指标；两者不混用统计周期。瓦瓦AI 使用 V2，WAWA ZZ 因 V2 返回 403 使用该账号有权访问的旧版。
- 来源渠道状态不会覆盖人工维护的服务状态，也不会覆盖本站真实 Key 检测结果。没有公开状态数据时，需要配置服务商的公开 Kuma / Statuspage 地址，或使用本站真实 Key 检测。

详情页始终显示「站点公告」导航入口，最新公告默认展开，前五条以外折叠进「更多公告」。渠道状态合并到「模型与价格」表格，可按分组/模型和 24 小时/7 天/30 天切换，状态条保留真实采样缺口，显示更新时间与最多两位小数的指标。保留来源、发布时间（来源提供时）和采集时间，正文由服务端渲染，发布后通过缓存失效队列刷新中英文页面。来源没有发布时间时只展示采集时间，不冒充发布时间。公开监测项名称与分组也进入现有英文翻译队列，未译完时沿用英文页面的 noindex 保护，不影响中文收录。

无需增加数据库表，也不部署模型；仅定时 HTTP 请求与少量 JSON/文本存储。公开采集请求超时 15 秒，登录来源请求超时 20 秒，响应上限 3 MB。公开重定向逐跳校验，登录来源禁止重定向；固定公开 IP 并保留原始域名的 TLS 证书验证。调度与已有检测共用独立 worker；大量站点时应另行做 worker 容量评估。

默认直连且不继承系统代理。只有账号明确选择「配置的采集代理」才读取 `STATION_SOURCE_PROXY_URL`；可配 `STATION_SOURCE_DNS_URL` 为 Cloudflare/Google 的受支持 DoH 地址以处理错误 DNS，解析结果全部需要是公开 IP。当前本机 Foxcode 使用此配置已连通，但仍要求验证码。部署时 127.0.0.1 代理地址需换为部署环境可达的出口，不要照搬本机地址。数据库与 `ENCRYPTION_KEY` 必须一起备份；上线后保持 worker 常驻。


## 模型与价格中的历史状态（2026-11-26）

- 旧版 Sub2API 与 Kuma 保留带真实时间的历史点，按来源及渠道 ID 去重、合并，最多保留 30 天 / 每渠道 2000 点。不会补造两次采样之间的状态。
- V2 使用 `matrix?range=24h|7d|30d&group_by=platform_group`；另外单独读取 `range=24h&group_by=platform_group_model`，保存准确的模型与分组关联。模型级长周期接口响应过大时保留现有 3 MB 限制，长周期模型视图仅绘制已有的真实短期记录，缺少的时段为灰色。
- 分组监控不会套给同品牌的全部模型。模型模式只能按精确 API ID 与分组关联；同一模型跨不同分组分别展示。分组可点击查看关联模型，品牌筛选隐藏没有记录的生态。
- V2 数值为「来源成功率」；旧版有对应时窗时展示来源可用率，否则为「采样可用率」，只按有效采样计算，均有指标提示。状态条颜色按来源健康状态；灰色表示没有记录/未知，橙色表示性能下降，不能据灰色判断故障。
- 真实 worker 最新成功获取：瓦瓦 AI 11 个分组、270 条模型与分组记录，三个分组历史窗口共 689 个聚合桶；WAWA ZZ 5 个渠道、300 个历史点。瓦瓦 AI 目前公告源为空；WAWA ZZ 有 6 条已发布公告。
- 公告发布证据 `verification/station-notice-published.json`；运行 ID 见 `verification/station-channel-history-runs.json`。独立的历史规范化、来源解析及表格表现模块分别位于 `channel_history.py`、`station_channel_adapters.py` 和 `model-channel-ui.mjs`。

## 更多公开来源与网络出口（2026-11-26）

六家新增来源已接入后台并配置每日采集，公告采集后直接发布：RightCode 04:55、犀速 AI 05:00、AIHUBMIX 05:05、PackyCode 05:10、0elog 05:15、302.AI 05:20，均为北京时间。当前共 17 家启用任务，累计 453 条已发布采集公告。最新列表见 STATION-SOURCE-COVERAGE.md。

后台「公告采集接口」新增 RightCode、PackyCode 公告、犀速 AI 公告页、OnlineOrNot、302.AI；「渠道状态来源」新增 RightCode 模型可用性、OnlineOrNot。公开接口连接可独立选择直连或配置的采集代理；登录来源仍使用绑定账号的连接设置。代理与 DoH 复用 `STATION_SOURCE_PROXY_URL` / `STATION_SOURCE_DNS_URL`，不读取系统代理。

来源解析集中在 `station_public_adapters.py`；共享的 IP / 代理 TLS / DoH 校验集中在 `station_source_network.py`。公开页面用 BeautifulSoup 提取稳定公告 ID、标题、正文及原始日期；RSS 拒绝 DTD/实体，不执行任何来源 JavaScript。OnlineOrNot 只读取公开组件字面量；结构变化时报错并保留旧快照。

RightCode 按源 `upstream_id` 和精确模型 ID 分离记录：13 个分组、113 条模型监控。`no_sample=true` 即使携带 100% 也保留为未知，不能当正常；每个模型的百分比为最近有效时段可用率，不冒充整段总成功率。同组同一时段合并时取最差已知状态，并在状态条提示中说明。AIHUBMIX 的 5 个组件是状态页自报，没有心跳时间便不补造历史；RSS 事故通知进入对应站点公告。

## AruHub 独立渠道来源（2026-11-26）

`/channel-status` 使用独立应用，不使用 New API 的通用监控数组。`station_aruhub_adapter.py` 读取公开 JSON、分组成功率与逐条近期调用；不需要登录，也不会发起模型推理。先取 24 小时，失败回退官方 90 分钟窗口；7 天为可选项。失败窗口明确记警告，不将短窗口改称全天，不凭更新时间制造逐条调用时间。后台来源下拉可选择「AruHub 渠道状态」。

页面根据 `supportedRanges` 选择默认窗口并隐藏不可用窗口。每组最多 60 条调用按来源顺序展示，左侧较早、右侧最近，缺少调用用灰色留空；说明为「近期调用（非时间轴）」。分组指标使用来源摘要；型号指标仅统计精确 API 型号与分组的近期样本，不能继承分组全量百分比。来源的 `has_data=false` 不可显示 100% 正常。来源更新时间与本站采集时间分别保留。

本次真实 worker 结果为 26 组、32 款型号的 58 条型号与分组记录，90 分钟窗口中 22 组有 891 条调用样本。24 小时超时、7 天 HTTP 503，记「部分成功」且保留可用结果。原任务每日北京时间 04:10、公告自动发布策略保持不变，连接采用配置的采集代理。旧报价中的改名前分组保持独立，不按品牌或名称前缀强行对应；有监测的行优先展示。任务、运行、SSR 和 SEO 验收见 `verification/aruhub-channel-release.json`。
