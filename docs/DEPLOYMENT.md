# 部署与运维

## 本地

按根目录 README 安装。`scripts/start-local.ps1` 启动或复用端口 8000、3001，并启动 worker；日志在 `.runtime`。`stop-local.ps1` 仅停止脚本记录且命令匹配的进程。旧原型 4173、4186 不受影响。

本地账户的随机密码保存在 `LOCAL-ACCESS.md`。生产不创建本地站长与审核员账号。

## Docker / PostgreSQL

需要 Docker Compose v2 和已准备的 HTTPS 域名。先生成仅本地保存的部署密钥：

```powershell
api/.venv/Scripts/python scripts/configure-production.py
docker compose --env-file production.env config --quiet
docker compose --env-file production.env up -d --build
```

服务包括 PostgreSQL 17、迁移任务、FastAPI、Next.js 与 worker。迁移成功后 API 才启动。API 和数据库不直接发布宿主端口；Web 绑定 `127.0.0.1:3001`。`docs/nginx.conf` 为 HTTPS 反向代理示例，需填写可用证书路径并在服务器安装 Nginx。

正式域名固定为 `https://www.kugni.com`，Cookie 只通过 HTTPS 发送。生产配置禁止内网检测。内部 Next 回调使用共享密钥，不应把此密钥提供给浏览器。

初始化完成后，生产密码在 `production.env` 的 `BOOTSTRAP_PASSWORD`，立即登录修改。再次 seed 不覆盖已有管理员密码和运营数据。

本机当前没有 Docker/PostgreSQL 运行时，容器启动和 PostgreSQL 在线迁移需在部署环境验收；本地接口测试使用 SQLite。不要把这一点写成已通过生产验收。

## 检测、邮件与权益

- 后台「探测账户」配置 New API / One API 账号密码或管理访问令牌，可手动/定时同步 Key、模型与余额，也可直接维护专用 API Key。计划可选择多 Key/协议/模型组合；真实调用需要有效额度。
- 注册强制邮箱验证码；已有用户可在个人设置验证邮箱。SMTP 未配置时注册发码和找回密码会明确失败。配置 SMTP_HOST、SMTP_PORT、SMTP_USER、SMTP_PASSWORD、SMTP_FROM，验证码支持 587 STARTTLS 和 465 TLS。不得把验证码写进日志。
- 在线支付尚未接网关，使用管理员核对付款；需要接网关时增加签名回调和幂等支付事件，不能开放普通编辑修改付款状态。
- 告警当前写站内消息，不发送 Webhook 或邮件。
- 探测账户支持标准 `/api/user/checkin` 每日签到，不绕过验证码或二次验证；非标准系统需另写适配器。低余额写入「站内通知」，同步失败可在「账户同步记录」查看。
- 积分权益可选人工发放或自动发码。「兑换码库存」每行导入一份真实权益，加密储存，兑换成功自动发给用户；未发出的库存可删，已有发放记录的批次禁止删除。自动发码不等于接入第三方自动开户、充值或支付。
- 指纹基线库绑定可信源 Key、协议、准确模型 ID 和来源，6–30 轮实际采样；至少两种模型独立校准通过后启用。采集会消耗接口额度。不能把中转站自报型号当可信来源。
- 流量统计以公开页面匿名事件为准；90 秒在线窗口，页面每 30 秒刷新统计。同会话按顺序计算漏斗。地区需要 `GEOIP_DATABASE` 指向本地 City MMDB；本机已配置，Docker 需将文件放入 storage 卷并设置容器路径。GeoLite 约 50 MB，无翻译模型或付费定位接口。
- Nginx 入口覆盖 X-Forwarded-For 为真实连接 IP；API 仅允许内部网关访问。若前面还有 CDN，先配置可信 real_ip，再使用该地址，禁止直接相信用户传来的 XFF。

## 备份与恢复

公告、渠道和模型报价采集要求见 [STATION-SOURCES.md](STATION-SOURCES.md) 与 [DATA-OPERATIONS.md](DATA-OPERATIONS.md)。保持 worker 常驻；当前17家每日任务，其中9家启用报价同步。公开来源按任务选择直连或配置的采集代理；登录来源绑定加密保存的账号和会话。代理使用 `STATION_SOURCE_PROXY_URL`，DoH使用 `STATION_SOURCE_DNS_URL`；部署时填写实际可达出口。免费英文翻译可另设 `TRANSLATION_PROXY_URL`，留空复用采集代理。健康面板不发送通知。全站 SEO 已配置北京时间每日06:20，支持问题批量复检。

至少备份 PostgreSQL 数据、上传卷、`production.env` 中的加密主密钥。不要只备份数据库而丢失 ENCRYPTION_KEY。

```bash
docker compose --env-file production.env exec -T db pg_dump -U kugni -d kugni -Fc > kugni.dump
# 恢复前先停 API/worker，在空数据库中恢复，避免覆盖正在写入的业务库。
docker compose --env-file production.env exec -T db pg_restore -U kugni -d kugni --no-owner < kugni.dump
```

升级先备份，再重建镜像并运行迁移。保留原镜像和备份；迁移更改需要新增 Alembic 版本，不要在现有线上版本中直接改表。
