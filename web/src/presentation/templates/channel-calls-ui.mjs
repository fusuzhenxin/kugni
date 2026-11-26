import { sourceDate } from "./station-source-ui.mjs";

// These records are ordered by the provider but have no event timestamps.
// Keep them separate from the time buckets used by channelTrend.
export function orderedCallTrend(channel, snapshot, range, esc) {
  const window = channel.windows?.[range] || {};
  if (
    !Array.isArray(window.recentCalls) &&
    snapshot?.historyKind !== "ordered-calls"
  )
    return null;
  const sample = Object.hasOwn(window, "sampleSuccessRate");
  const label = sample ? "近期样本成功率" : "来源分组成功率";
  const rate = sample ? window.sampleSuccessRate : window.successRate;
  const metric =
    typeof rate === "number" && Number.isFinite(rate)
      ? `${Number(rate.toFixed(2))}%`
      : "—";
  const calls = (window.recentCalls || []).slice(-60);
  const segments = [...Array(60 - calls.length).fill(null), ...calls]
    .map((call) => {
      const status = call
        ? call.success
          ? "调用成功"
          : "调用失败"
        : "暂无调用样本";
      const latency = call?.latencyMs == null ? "" : ` · ${call.latencyMs} ms`;
      const title = call ? `${status} · ${call.modelId}${latency}` : status;
      return `<span class="channel-segment ${call ? (call.success ? "good" : "bad") : "unknown"}" title="${esc(title)}"></span>`;
    })
    .join("");
  const at = window.sourceUpdatedAt;
  const title = "来源更新时间（北京时间） " + sourceDate(at);
  return `<div class="channel-trend" data-range="${esc(range)}"><div class="channel-trend-meta"><b title="${esc(label)}">${esc(metric)}</b><time title="${esc(title)}">${snapshot?.stale ? '<span class="channel-stale-dot" aria-label="待更新"></span>' : ""}${esc(at ? sourceDate(at).slice(5) : "—")}</time></div><div class="channel-segments" data-axis="calls" role="img" aria-label="${esc("近期调用记录 · 较早 → 最近")}" title="${esc(channel.note)}">${segments}</div></div>`;
}
