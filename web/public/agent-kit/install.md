# KUGNI AI Agent 接入说明

正式地址：https://www.kugni.com/；资料日期：2026-11-12。

## 当前可用

- 站点公开快照：https://www.kugni.com/data/v1/stations.json
- 模型生态索引：https://www.kugni.com/data/v1/models.json
- 原始公开分组报价：https://www.kugni.com/data/v1/pricing.json
- 评测方法：https://www.kugni.com/data/v1/methodology.json
- 文档索引：https://www.kugni.com/llms.txt

以上为无需登录的只读静态资料。客户端自行读取和筛选 JSON，不需要 API Key。不支持 POST、账户写入、充值或真实检测。

## Skills

- 查找候选：https://www.kugni.com/agent-kit/skills/kugni-find-relay/SKILL.md
- 核对站点：https://www.kugni.com/agent-kit/skills/kugni-check-relay/SKILL.md

下载对应 SKILL.md 后，按客户端文档放入其技能目录；本站不自动修改客户端配置。

## MCP

远程 MCP 服务尚未接入。不要把静态 JSON 地址作为 MCP server URL，不存在可直接使用的远程 MCP 工具。

## 数据解释

请保留 dataAsOf、source 和每条记录的 url。isLiveMonitoring 为 false；可用率、延迟是来源日期的记录。not-tested、null 和未公开字段不能当作验证通过。模型生态不等于具体型号可用；倍率不能直接换算 Token 单价。
