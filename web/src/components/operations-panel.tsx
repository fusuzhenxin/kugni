"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, send } from "@/lib/client-api";
import { dateText, type Module } from "@/lib/types";
import { ErrorMessage, Icon, Status } from "./ui";
import { WorkspaceSelect } from "./workspace-select";

type StationHealth = {
  id: string;
  slug: string;
  name: string;
  status: string;
  lastRun: string;
  lastSuccess: string;
  nextRun: string;
  channels: number;
  modelChannels: number;
  models: number;
  quotes: number;
  pricingUpdatedAt: string;
  channelUpdatedAt: string;
  consecutiveFailures: number;
  warnings: string[];
  errors: Record<string, string>;
  enabled: number;
  stale: boolean;
  late: boolean;
  finding: { status: string; body: string; sourceUrl: string } | null;
};
type Health = {
  updatedAt: string;
  summary: {
    stations: number;
    withChannels: number;
    withPricing: number;
    attention: number;
    activeJobs: number;
    runs24h: number;
    successRate24h: number | null;
  };
  stations: StationHealth[];
  jobs: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    kind: string;
    warnings: string[];
    errors: Record<string, string> | string;
  }[];
};
type TranslationHealth = {
  updatedAt: string;
  total: number;
  uniquePending: number;
  statuses: Record<string, number>;
  provider: {
    status?: string;
    nextAttempt?: string;
    lastSuccess?: string;
    lastError?: string;
    lastBatchSize?: number;
  };
  modules: {
    module: string;
    total: number;
    ready: number;
    failed: number;
    manual: number;
  }[];
  documents: {
    id: string;
    name: string;
    module: string;
    total: number;
    ready: number;
    pending: number;
    failed: number;
  }[];
  failures: { id: string; name: string; source: string; error: string }[];
};
const names: Record<string, string> = {
  stations: "中转站资料",
  "station-notices": "站点公告",
  "model-packages": "模型套餐",
  "model-directory": "模型大全",
  "page-content": "页面内容",
  categories: "分类",
  models: "模型",
  seo: "SEO 文案",
  ui: "界面文字",
  articles: "文章",
  resources: "资源",
};

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: string;
}) {
  return (
    <article className="ops-metric">
      <span>
        <Icon name={icon} size={18} />
        {label}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export function OperationsPanel({
  active,
  revision,
}: {
  active: Module;
  revision: number;
}) {
  const translation = active.key === "translation-health";
  const [health, setHealth] = useState<Health | null>(null);
  const [english, setEnglish] = useState<TranslationHealth | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      if (translation)
        setEnglish(
          await api<TranslationHealth>("/admin/operations/translation-health/"),
        );
      else setHealth(await api<Health>("/admin/operations/collection-health/"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [translation]);
  useEffect(() => {
    setQuery("");
    setFilter("");
    setMessage("");
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh, revision]);
  async function reconcile() {
    setBusy(true);
    setMessage("");
    try {
      const result = await send<{ reused: number }>(
        "/admin/operations/translation-health/reconcile/",
        {},
      );
      setMessage(
        `已核对现有译文并复用 ${result.reused} 条，剩余内容由后台继续处理。`,
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorMessage error={error} />;
  if (translation) {
    if (!english) return <div className="loading">正在核对英文完成度…</div>;
    const done = english.statuses["已翻译"] || 0;
    return (
      <div className="ops-page">
        <div className="ops-metrics">
          <Metric
            label="英文已完成"
            value={done}
            note={`共 ${english.total} 条文字记录，不等于页面数`}
            icon="globe"
          />
          <Metric
            label="待翻译原文"
            value={english.uniquePending}
            note="相同原文只需翻译一次"
            icon="file"
          />
          <Metric
            label="待处理"
            value={
              (english.statuses["翻译失败"] || 0) +
              (english.statuses["待校对"] || 0)
            }
            note="失败与人工校对分开保留"
            icon="compass"
          />
          <Metric
            label="翻译通道"
            value={english.provider.status || "待执行"}
            note={
              english.provider.lastSuccess
                ? `最近成功 ${dateText(english.provider.lastSuccess)}`
                : "免费通道，无需模型服务"
            }
            icon="link"
          />
        </div>
        <section className="ops-section">
          <header>
            <div>
              <h2>按内容查看完成度</h2>
              <p>英文完整后开放收录；中文发布继续正常执行。</p>
            </div>
            <div className="ops-actions">
              <Link
                className="button secondary small"
                href="/admin/content/translations/"
              >
                查看译文
              </Link>
              {active.actions.includes("retry") && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={reconcile}
                >
                  {busy ? "正在核对…" : "核对并复用译文"}
                </button>
              )}
            </div>
          </header>
          {message && (
            <p className="ops-message" role="status">
              {message}
            </p>
          )}
          {english.provider.lastError && (
            <p className="ops-notice">
              {english.provider.lastError}
              {english.provider.nextAttempt
                ? ` · 下次尝试 ${dateText(english.provider.nextAttempt)}`
                : ""}
            </p>
          )}
          <div className="ops-progress-list">
            {english.modules.map((item) => (
              <article key={item.module}>
                <div>
                  <strong>{names[item.module] || item.module}</strong>
                  <span>
                    {item.ready} / {item.total}
                  </span>
                </div>
                <progress
                  max={item.total || 1}
                  value={item.ready}
                  aria-label={`${names[item.module] || item.module}翻译完成度`}
                />
                <small>
                  待校对 {item.manual} · 失败 {item.failed}
                </small>
              </article>
            ))}
          </div>
        </section>
        <section className="ops-section">
          <header>
            <div>
              <h2>待完成内容</h2>
              <p>可从英文翻译列表按名称搜索并处理。</p>
            </div>
            <small>更新于 {dateText(english.updatedAt)}</small>
          </header>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>内容</th>
                  <th>类型</th>
                  <th>完成度</th>
                  <th>待处理</th>
                </tr>
              </thead>
              <tbody>
                {english.documents.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{names[item.module] || item.module}</td>
                    <td>
                      {item.ready} / {item.total}
                    </td>
                    <td>
                      {item.pending} 条
                      {item.failed ? ` · ${item.failed} 条失败` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!english.documents.length && (
              <p className="ops-empty">当前公开内容的英文已完成。</p>
            )}
          </div>
        </section>
        {english.failures.length > 0 && (
          <section className="ops-section">
            <header>
              <h2>异常与校对</h2>
            </header>
            <div className="ops-failures">
              {english.failures.map((item) => (
                <details key={item.id}>
                  <summary>
                    {item.name}
                    <span>{item.error || "原文发生变化，待校对"}</span>
                  </summary>
                  <p>{item.source}</p>
                  <Link href="/admin/content/translations/">
                    进入译文管理 →
                  </Link>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }
  if (!health) return <div className="loading">正在读取采集健康…</div>;
  const rows = health.stations.filter(
    (row) =>
      `${row.name} ${row.slug}`.toLowerCase().includes(query.toLowerCase()) &&
      (!filter ||
        (filter === "attention"
          ? ["需处理", "部分成功", "需要验证"].includes(row.status)
          : filter === "missing"
            ? !row.channels
            : !!row.pricingUpdatedAt)),
  );
  return (
    <div className="ops-page">
      <div className="ops-metrics">
        <Metric
          label="渠道状态覆盖"
          value={`${health.summary.withChannels} / ${health.summary.stations}`}
          note="区分模型渠道与服务组件"
          icon="chart"
        />
        <Metric
          label="自动报价覆盖"
          value={health.summary.withPricing}
          note="已完成真实报价同步的站点"
          icon="layers"
        />
        <Metric
          label="需要查看"
          value={health.summary.attention}
          note="部分成功、过期或执行失败"
          icon="compass"
        />
        <Metric
          label="正在执行 / 排队"
          value={health.summary.activeJobs}
          note={`近24小时运行 ${health.summary.runs24h} 次`}
          icon="clock"
        />
      </div>
      <section className="ops-section">
        <header>
          <div>
            <h2>站点采集状态</h2>
            <p>成功采集不代表所有来源都返回模型状态；更新时间使用北京时间。</p>
          </div>
          <div className="ops-actions">
            <Link
              className="button secondary small"
              href="/admin/collection/sources/"
            >
              渠道来源核查
            </Link>
            <Link className="button small" href="/admin/collection/stations/">
              管理采集任务
            </Link>
          </div>
        </header>
        <div className="ops-filters">
          <label className="filter-search">
            <Icon name="search" size={16} />
            <input
              aria-label="搜索采集站点"
              placeholder="搜索站点"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <WorkspaceSelect
            label="采集覆盖筛选"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "", label: "全部站点" },
              { value: "attention", label: "需要查看" },
              { value: "missing", label: "暂无渠道状态" },
              { value: "pricing", label: "已同步报价" },
            ]}
          />
          <small>更新于 {dateText(health.updatedAt)}</small>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table ops-stations-table">
            <thead>
              <tr>
                <th>站点 / 状态</th>
                <th>模型与报价</th>
                <th>渠道监控</th>
                <th>最近运行 / 下次更新</th>
                <th>处理说明</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      className="ops-station-name"
                      href={`/stations/${row.slug}/`}
                    >
                      {row.name}
                      <Icon name="arrow" size={13} />
                    </Link>
                    <Status value={row.status} />
                    <small>
                      {row.enabled} 个启用任务
                      {row.consecutiveFailures
                        ? ` · 连续失败 ${row.consecutiveFailures} 次`
                        : ""}
                    </small>
                  </td>
                  <td data-label="模型与报价">
                    <strong>
                      {row.models} 款 / {row.quotes} 条
                    </strong>
                    <small>
                      {row.pricingUpdatedAt
                        ? dateText(row.pricingUpdatedAt)
                        : "尚未自动同步"}
                    </small>
                  </td>
                  <td data-label="渠道监控">
                    <strong>
                      {row.channels} 组 / {row.modelChannels} 条型号记录
                    </strong>
                    <small>
                      {row.channelUpdatedAt
                        ? dateText(row.channelUpdatedAt)
                        : "未取得来源状态"}
                    </small>
                    {row.stale && (
                      <span className="ops-warning">快照已过期</span>
                    )}
                  </td>
                  <td data-label="更新时间">
                    <span>
                      {row.lastRun ? dateText(row.lastRun) : "尚未运行"}
                    </span>
                    <small>
                      下次{" "}
                      {row.nextRun ? dateText(row.nextRun) : "仅手动 / 未启用"}
                    </small>
                    {row.late && (
                      <span className="ops-warning">调度已延迟</span>
                    )}
                  </td>
                  <td data-label="处理说明">
                    <details>
                      <summary>
                        {Object.keys(row.errors).length
                          ? "查看失败原因"
                          : row.warnings.length
                            ? `${row.warnings.length} 项需核对`
                            : row.finding
                              ? row.finding.status
                              : "查看覆盖说明"}
                      </summary>
                      {Object.entries(row.errors).map(([key, value]) => (
                        <p key={key}>
                          {key}：{value}
                        </p>
                      ))}
                      {row.warnings.map((value, i) => (
                        <p key={i}>{value}</p>
                      ))}
                      <p>
                        {row.finding?.body ||
                          (row.channels
                            ? "已有来源状态；具体型号是否有样本请查看站点详情。"
                            : "当前尚未取得渠道数据，不能由此判断该站无监控或发生故障。")}
                      </p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="ops-empty">没有符合条件的站点。</p>}
        </div>
      </section>
      <section className="ops-section">
        <header>
          <div>
            <h2>最近执行</h2>
            <p>完整错误和采集数量保存在运行记录中。</p>
          </div>
          <Link href="/admin/collection/station-runs/">全部运行记录 →</Link>
        </header>
        <div className="ops-run-list">
          {health.jobs.slice(0, 8).map((job) => (
            <article key={job.id}>
              <Icon name="clock" size={17} />
              <div>
                <strong>{job.name}</strong>
                <small>{dateText(job.createdAt)}</small>
              </div>
              <Status value={job.status} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
