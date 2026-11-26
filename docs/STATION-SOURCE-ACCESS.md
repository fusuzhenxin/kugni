# 未接入站点的访问要求与解决办法

复查日期：2026-11-26。上一轮只检查 New API / One API 通用接口，不能根据通用接口失败就认定站点需要登录或没有公告。

先读取各站公开首页及其实际引用脚本，再对脚本中出现的路径做未登录 GET 请求；获得用户授权后，为三家确认需要登录的站点保存加密账号并实际验证。没有访问服务商管理接口。

| 站点 | 已验证的结果 | 对应处理 |
| --- | --- | --- |
| 瓦瓦AI | 已用授权账号登录；旧监控为空，V2 返回 11 组聚合监控，公告为空 | 已接入 Sub2API 适配并配置每日任务，真实 worker 确认复用会话 |
| WAWA ZZ | 已用授权账号登录；6 条公告、5 个旧版监控；V2 返回 403 | 已接入旧版监控并配置每日任务，不尝试获取无权限的 V2 数据 |
| foxcode | 用户公告路径为 `/api/user/announcements/timeline`；修正错误 DNS 与代理 TLS 后连接成功，登录要求安全验证 | 加密账号已保存，状态需要处理、任务停用；尚未获得会话，无法判断密码是否正确 |
| RightCode | `/configs` 返回 200，其中有 `public.notice`；`/models/availability/all` 返回公开可用性数据 | 增加 RightCode 公告与公开状态解析；不需要登录 |
| 犀速AI | 官网明确链接 `/resources/announcements`，未登录返回 200，公告正文在 HTML 内 | 增加公开公告页解析；不需要登录 |
| AIHUBMIX | 官网明确链接 `https://status.aihubmix.com`，未登录返回 200，使用 OnlineOrNot 状态页 | 增加 OnlineOrNot 状态页适配；不需要登录 |
| PackyCode | 当前直连超时，经系统网络代理读取 `/api/status`、`/api/announcements` 成功；后者返回 135 条 | 先解决部署网络出口，并补充该站独立公告接口；不是登录问题 |
| 0elog | 当前直连超时，经系统网络代理读取 `/api/status`、`/api/notice` 成功 | 解决部署网络出口后接现有 New API 适配；不是登录问题 |
| AICodeMirror | 首页与接口均返回 Cloudflare 403 验证页，响应有 `cf-mitigated: challenge` | 核实允许程序访问的公开接口，或通过站点方配置允许的访问方式；账号登录不会直接解决验证页 |
| aigocode | 首页公开；控制台、定价入口指向登录页；没有确认公告的真实数据接口 | 继续定位公告来源，不能仅依据控制台需登录就断言所有公告需登录 |
| 302.AI | 首页公开；前端 API 根地址实际是 `https://dash-api.302.ai`，不是首页根地址 | 需继续确认公告数据接口与权限；不能把公开商品 banner 当公告导入 |

## 采集实现边界

已新增独立的「采集登录账号」，与模型 Key 探测账号分开管理。Sub2API 与 Foxcode 会话适配已实现；前者完成两站真实联调，后者被实际验证码阻挡。保存的密码和会话均加密，登录失效时先刷新，刷新明确失效再密码登录。403、限流和服务异常不会触发密码重登录。

确需登录的站点，应由站点所有者在后台录入其有权使用的专用账号或控制台令牌，加密储存，自动处理有效期和刷新；遇到验证码、二次验证、账号失效，应明确提示需要人工处理。模型调用 API Key 通常不具备读取控制台公告的权限。普通账号能看到的渠道范围也取决于该账号权限，并不等于服务商全部后台渠道。

公开页面或公开 JSON 可以直接适配，不需要为了采公告创建账号。网络问题应通过部署地区、出口和 DNS 连接排查解决；研究中使用代理是为了区分网络与权限问题，没有因此让生产采集器自动继承环境代理。

后台当前启用 11 家每日任务，另有 Foxcode 停用配置。其他站点的独立公开解析器仍未接入，不能把发现数据接口写成已完成采集。接入继续保留来源、时间、草稿审核和人工编辑保护。

## 可复核证据

- `verification/station-source-access-research.json`：11 家首页、公开脚本、实际路径与网络方式。
- `verification/station-source-discovered-endpoints.json`：公开链接及脚本里发现的接口，未登录访问的状态码与响应结构。
- `.runtime/station-source-research/`：用于核对的公开页面和脚本快照，不作为已接入生产的标志。
- `verification/station-source-daily-config.json`、`verification/station-source-daily-worker.json`：每日计划、真实 worker 结果与登录时间对比。
- `verification/fox-source-login.json`：Foxcode 实际登录要求安全验证。


## 本轮接入结果（2026-11-26）

新增 RightCode、犀速 AI、AIHUBMIX、PackyCode、0elog、302.AI 六家生产适配，真实 worker 均成功执行；当前 17 家启用每日采集。原表中的公开解析器待开发状态已完成，最新状态以 STATION-SOURCE-COVERAGE.md 为准。

aigocode 已使用站主此前授权的账号密码验证一次，站方返回账号或密码不正确；站主随后明确选择跳过，临时账号与对应加密凭证均通过正常管理删除流程清理，未创建计划。AICodeMirror 正式已收录域名 `https://www.aicodemirror.ai` 仍明确返回 Cloudflare 访问验证，停止程序读取；Foxcode 原验证码阻挡保持，不重试密码。

新增任务支持独立的公开采集连接方式，公开 HTML、RSS 和 JSON 均经过逐跳地址检查、固定 IP、原始域名 TLS 校验及 3 MB 大小限制。配置代理时可使用既有可信 DoH；重定向换域重新校验，403 验证页不作为空数据入库。没有执行远端脚本或访问服务商管理接口。

## 渠道覆盖专项复查（2026-11-26）

通用接口空不等于站方没有状态页。本次重新检查缺少监控站点的公开配置、首页和引用脚本，发现此前遗漏 ZetaTechs 官网链接的 Better Stack 状态站，以及兔子API `/pricing/status` 实际使用的公开模型性能接口。两家现已补接，17 家采集任务中实际有 7 家获得状态数据、5 家获得历史，具体范围见覆盖表。ZetaTechs 为三个服务组件，兔子为 11 个分组、117 个型号的 269 条型号与分组记录；两者都无需登录。

其他站点只确认到通用监控关闭、通用接口空或独立来源尚未找到，不能写成全部已完成渠道接入；Foxcode/AICodeMirror 的验证阻挡及 aigocode 跳过保持原决定。后台任务、真实运行和原始 SSR 证据见 `verification/additional-channel-release.json`。
