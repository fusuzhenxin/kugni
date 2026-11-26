# KUGNI Platform

正式工程。Next.js 负责可收录公开页面与 React 交互，FastAPI 负责认证、权限和业务；生产使用 PostgreSQL。

实施进度见 [TASKS.md](TASKS.md)。本仓库包含正在运行的正式工程，旧静态原型单独保留在本机；本工程不依赖其浏览器本地存储。

目录：`web/` 前端，`api/` Python 服务与工作进程，`shared/` 迁移资料和模块契约，`scripts/` 启动与验证，`docs/` 架构和交付说明。

本地配置、登录凭证、数据库、运行日志及生成的验收截图/报告不提交仓库。文档中的 `verification/` 记录为本地验收产物，运行对应验证命令后生成。

## 本地运行

需要 Python 3.12+、Node.js 22+。在本文件所在目录运行：

```powershell
python -m venv api/.venv
api/.venv/Scripts/python -m pip install -r api/requirements.lock.txt
api/.venv/Scripts/python scripts/configure-local.py
Set-Location web
npm ci
Set-Location ..
pwsh -File scripts/start-local.ps1
```

配置脚本只在首次生成配置和随机密码，重复运行不覆盖。当前本地显式使用 SQLite，部署目标为 PostgreSQL。

- 前台：<http://127.0.0.1:3001/>
- 管理后台登录：<http://127.0.0.1:3001/admin/login/>
- 站长后台登录：<http://127.0.0.1:3001/publisher/login/>
- API 文档：<http://127.0.0.1:8000/docs>
- 登录账号和随机密码：本地 `LOCAL-ACCESS.md`。

分开运行时，API 工作目录为 `api`，命令 `.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`；worker 命令 `.venv/Scripts/python -m app.worker`；Web 工作目录为 `web`，命令 `npm run dev`。

## 验证

```powershell
Set-Location api
.venv/Scripts/python -m pytest -q
Set-Location ../web
npm run typecheck
npm run build
# 前后端已启动时；本机安装 Chrome，测试使用独立无头浏览器
npm run test:e2e
```

接口测试使用临时隔离数据库、本地协议服务器，不调用付费服务。浏览器测试使用本地配置账号，检查公开 HTML、后台模块、CRUD、缓存更新、301、报告分享海报和手机布局，临时分类与站点测试后删除。

## 已接通的业务

站点、独立分类、公告、模型、标准报价、编程套餐、文章与开发者资源；注册登录、个人资料、收藏、收录、评价、反馈、邀请核验、积分任务与兑换；RBAC 用户/角色/菜单/归属/审计与批量操作；广告审核、广告位、订单核对、曝光点击和站长统计；多 Key/多模型/多协议测试、定时调度、实际证据、报告审核、分享链接与海报。

真实模型检测需要有效 Key；邮件需要 SMTP；在线支付网关尚未接入，订单使用实际付款核对。积分权益支持加密兑换码自动发放，未配置真实库存时不能兑换。指纹支持可信基线采集、独立校准与候选匹配；未校准或无法区分时不判断型号。新增功能配置与验收见 [功能补全记录](docs/FEATURE-COMPLETION.md)。

架构与维护见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，部署、备份和外部服务配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，验证记录见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

前台英文入口 `/en/`，后台英文校对 `/admin/content/translations/`。中文更新自动排队，不阻塞发布；免 Key 翻译通道存在限流，失败可退避重试或人工校对。路径、SEO、配置与服务器说明见 [docs/LOCALIZATION.md](docs/LOCALIZATION.md)。

模型与报价自动同步、采集健康、渠道来源核查、英文完成度和 SEO 巡检见 [docs/DATA-OPERATIONS.md](docs/DATA-OPERATIONS.md)。后台入口分别为 `/admin/collection/health/`、`/admin/content/translation-health/` 和 `/admin/content/seo-inspections/`。
