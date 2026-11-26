import { modelBrand } from "../model-catalog.mjs";
import { sourceDate, sourceLink } from "./station-source-ui.mjs";
import { orderedCallTrend } from "./channel-calls-ui.mjs";

const key = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
const genericGroup = (value) => ["", "—", "公开", "目录"].includes(value);
const brand = (channel) =>
  (
    modelBrand(channel.modelIds?.[0]) ||
    modelBrand(channel.name || channel.group) ||
    modelBrand(channel.platform)
  )?.key || "";
const groupName = (channel) => channel.name || channel.group || "未命名渠道";
const sameGroup = (row, channel) =>
  key(row.cells[1]) === key(groupName(channel));
// Keep current monitored groups visible before unmatched historical price names.
// Reordering must never establish a relationship between different group names.
const monitoredFirst = (rows) =>
  rows.sort((a, b) => Number(Boolean(b.channel)) - Number(Boolean(a.channel)));

// Only exact API model IDs may inherit a model monitor. Brand membership alone
// never establishes which upstream group/model a request actually uses.
export function modelChannelRows(site, mode = "model") {
  const prices = site.publicModelTable?.rows || [];
  const snapshot = site.channelSnapshot;
  const channels = snapshot?.channels || [];
  const modelChannels = [
    ...(snapshot?.modelChannels || []),
    ...channels.filter((c) => c.modelIds?.length),
  ];
  if (mode === "model") {
    const used = new Set();
    const rows = prices.flatMap((row) => {
      const matches = modelChannels.filter(
        (c) =>
          c.modelIds.some((m) => key(m) === key(row.cells[0])) &&
          (genericGroup(row.cells[1]) || sameGroup(row, c)),
      );
      if (!matches.length) return [{ ...row, group: row.cells[1] }];
      return matches.map((channel) => {
        used.add(channel.id || channel);
        return { ...row, group: groupName(channel), channel };
      });
    });
    for (const channel of modelChannels) {
      if (used.has(channel.id || channel)) continue;
      for (const model of channel.modelIds) {
        rows.push({
          brand: brand(channel),
          cells: [model, groupName(channel), "—", "—", "—", "未测", "—"],
          group: groupName(channel),
          channel,
        });
      }
    }
    return monitoredFirst(rows);
  }
  const groups = new Map();
  for (const row of prices) {
    if (genericGroup(row.cells[1])) continue;
    const name = row.cells[1];
    if (!groups.has(key(name))) groups.set(key(name), { name, prices: [] });
    groups.get(key(name)).prices.push(row);
  }
  for (const channel of channels) {
    const name = groupName(channel);
    const group = groups.get(key(name)) || { name, prices: [] };
    group.channel = channel;
    groups.set(key(name), group);
  }
  return monitoredFirst(
    [...groups.values()].map(({ name, prices, channel }) => {
      const value = (i) => {
        const values = [
          ...new Set(
            prices.map((r) => r.cells[i]).filter((v) => v && v !== "—"),
          ),
        ];
        return values.length > 1 ? "多档报价" : values[0] || "—";
      };
      const models = [
        ...new Set([
          ...prices.map((r) => r.cells[0]),
          ...(channel?.modelIds || []),
          ...modelChannels
            .filter((c) => key(groupName(c)) === key(name))
            .flatMap((c) => c.modelIds),
        ]),
      ];
      return {
        brand: channel ? brand(channel) : prices[0]?.brand || "",
        group: name,
        channel,
        models,
        cells: [name, name, value(2), value(3), value(4), value(5), value(6)],
      };
    }),
  );
}

const ms = (value) => {
  if (!value) return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z");
};
const tone = (state) =>
  ({
    正常: "good",
    异常: "bad",
    部分故障: "bad",
    性能下降: "warn",
    维护中: "warn",
    等待中: "warn",
  })[state] || "unknown";
const rank = { unknown: 0, good: 1, warn: 2, bad: 3 };

export function channelTrend(channel, snapshot, range, esc) {
  if (!channel) {
    const message = snapshot?.channels?.length
      ? "该型号或分组暂无对应监测"
      : snapshot
        ? "来源未返回渠道数据"
        : "尚未接入渠道监控";
    return `<div class="channel-trend" data-range="${esc(range)}"><small class="channel-source-state">${esc(message)}</small></div>`;
  }
  const ordered = orderedCallTrend(channel, snapshot, range, esc);
  if (ordered) return ordered;
  const end = ms(snapshot?.collectedAt) || 0,
    days = { "24h": 1, "7d": 7, "30d": 30 }[range] || 1;
  const start = end - days * 86400000,
    count = days === 1 ? 24 : days === 7 ? 28 : 30;
  const step = (end - start) / count;
  const window = channel?.windows?.[range];
  const points = (
    window?.history ||
    channel?.windows?.["24h"]?.history ||
    channel?.history ||
    []
  ).filter(
    (p) => ms(p.at) + (p.seconds || 0) * 1000 >= start && ms(p.at) <= end,
  );
  const known = points.filter((p) => tone(p.status) !== "unknown");
  let metric = window?.successRate,
    label = "来源成功率";
  if (window?.latestAvailability != null) {
    metric = window.latestAvailability;
    label = "最近时段可用率";
  }
  if (metric == null && !channel?.windows) {
    metric =
      range === "7d"
        ? channel?.uptime7d
        : range === "24h"
          ? channel?.uptime24h
          : null;
    label = "来源可用率";
    if (metric == null && known.length) {
      metric =
        (known.filter((p) => p.status === "正常").length / known.length) * 100;
      label = "采样可用率";
    }
  }
  const formatted =
    typeof metric === "number" && Number.isFinite(metric)
      ? `${Number(metric.toFixed(2))}%`
      : "—";
  const at = channel?.heartbeatAt;
  const historyAt = points
    .map((p) => p.at)
    .sort()
    .at(-1);
  const updated = at
    ? sourceDate(at).slice(5)
    : historyAt
      ? "按日历史"
      : "来源未提供历史";
  const segments = Array.from({ length: count }, (_, i) => {
    const from = start + i * step,
      to = from + step;
    const observed = points.filter((p) => {
      const t = ms(p.at);
      return p.seconds
        ? t < to && t + p.seconds * 1000 > from
        : t >= from && (t < to || (i === count - 1 && t === to));
    });
    const state = observed.reduce(
      (state, p) =>
        rank[tone(p.status)] > rank[tone(state)] ? p.status : state,
      "未知",
    );
    const title = end
      ? `${sourceDate(new Date(from).toISOString())} – ${sourceDate(new Date(to).toISOString())} · ${observed.length ? state : "无记录"}`
      : "暂无历史记录";
    return `<span class="channel-segment ${tone(state)}" title="${esc(title)}"></span>`;
  }).join("");
  const stale = channel?.status === "未核验" || snapshot?.stale;
  return `<div class="channel-trend" data-range="${esc(range)}"><div class="channel-trend-meta"><b title="${esc(label)}">${esc(formatted)}</b><time title="${esc((stale ? "待更新 · " : "") + "更新时间（北京时间） " + sourceDate(at))}">${stale && at ? '<span class="channel-stale-dot" aria-label="待更新"></span>' : ""}${esc(updated)}</time></div><div class="channel-segments" title="${esc(channel?.note || "来源历史状态")}" role="img" aria-label="${esc(label + " " + formatted + " · " + (points.length ? "来源历史状态" : "暂无历史记录"))}">${segments}</div>${!points.length && channel?.reportedStatus ? `<small class="channel-source-state">来源自报 ${esc(channel.reportedStatus)}${channel.status === "未核验" ? " · 未核验" : ""}</small>` : ""}</div>`;
}

export function channelToolbar(view, snapshot, esc) {
  const ordered = snapshot?.historyKind === "ordered-calls";
  const sourceTitle = ordered
    ? "渠道状态 · 近期调用（非时间轴）"
    : snapshot?.historyScope === "site-wide"
      ? "全站调用统计（不区分渠道）"
      : "渠道状态 · 来源站点监控";
  const legend = ordered
    ? '<i class="good"></i>调用成功<i class="bad"></i>调用失败<i class="unknown"></i>无记录'
    : '<i class="good"></i>正常<i class="warn"></i>性能下降<i class="bad"></i>异常<i class="unknown"></i>无记录';
  const button = (action, value, label, active) =>
    `<button type="button" data-action="${action}" data-value="${esc(value)}" class="${active ? "active" : ""}" aria-pressed="${active}">${label}</button>`;
  return `<div class="model-channel-toolbar"><div class="model-channel-switch" aria-label="展示方式">${[
    ["group", "按分组"],
    ["model", "按模型"],
  ]
    .map(([v, text]) => button("detail-model-mode", v, text, view.mode === v))
    .join(
      "",
    )}</div>${view.group ? `<button type="button" class="model-group-reset" data-action="detail-model-group" data-value="">${esc(view.group)} <span>×</span></button>` : ""}<div class="model-channel-switch model-channel-ranges" aria-label="历史时间范围">${[
    ["90m", "90分钟"],
    ["24h", "24小时"],
    ["7d", "7天"],
    ["30d", "30天"],
  ]
    .filter(([v]) =>
      snapshot?.supportedRanges
        ? snapshot.supportedRanges.includes(v)
        : v !== "90m",
    )
    .map(([v, text]) => button("detail-model-range", v, text, view.range === v))
    .join(
      "",
    )}</div></div>${snapshot ? `<div class="model-channel-source"><span title="${ordered ? "近期调用记录 · 较早 → 最近" : "来源历史状态"}">${sourceTitle}</span><span>更新于 <time>${esc(sourceDate(snapshot.collectedAt))}</time>（北京时间）</span><span class="channel-legend">${legend}</span>${sourceLink(snapshot.sourceUrl, esc)}</div>` : ""}`;
}
