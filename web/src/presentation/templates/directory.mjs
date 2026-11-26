import {
  modelBrands,
  modelBrandIcon,
  matchModelProviders,
  renderModelField,
} from "../model-catalog.mjs";
import {
  stationNotices,
  sourceDate,
  sourceLink,
} from "./station-source-ui.mjs";
import {
  modelChannelRows,
  channelTrend,
  channelToolbar,
} from "./model-channel-ui.mjs";
// Pure presentation extracted from the approved front end.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const localStorage = { getItem: () => null };
  const read = (key, fallback) => window.member[key] ?? fallback;
  const write = () => {};
  const state = {
    saved: [],
    compare: [],
    applications: [],
    reviews: [],
    user: null,
    theme: "light",
    query: "",
    kind: "全部",
    payment: "全部",
    model: "全部",
    sort: "recommended",
    view: "list",
    limit: 100,
    modelQuery: "",
    brand: "全部",
    benefit: "全部",
    ...window.member,
    ...window.view,
  };
  const models = window.models;
  const planExamples = window.plans || [];
  const checkHistory = window.member.history || [];
  const detailModelViews = new Map(window.view.detailViews || []);
  const render = () => {};
  const modal = () => {};
  const toast = () => {};

  const $ = (s, root = document) => root.querySelector(s);

  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  function descriptionMarkup(value) {
    const text = window.translate(String(value ?? ""));
    let html = "",
      cursor = 0;
    const keywords =
      /Claude(?:\s*code)?|Codex|GPT(?:[-\s]?\d[\w.-]*)?|Gemini|DeepSeek|Grok|Qwen|Kimi|GLM|支付宝|微信(?:付款|支付)?|国内支付|支持开票|极速开票|高并发|高稳定|多模态|注册(?:送测试额度|赠额)|测试额度|新用户赠额/gi;
    for (const match of text.matchAll(keywords)) {
      const word = match[0],
        tone = /^Claude/i.test(word)
          ? "orange"
          : /^(GPT|DeepSeek|Grok)/i.test(word)
            ? "teal"
            : /^(Codex|Gemini|Qwen|Kimi|GLM)/i.test(word)
              ? "purple"
              : "blue";
      html +=
        esc(text.slice(cursor, match.index)) +
        `<span class="description-accent accent-${tone}">${esc(word)}</span>`;
      cursor = match.index + word.length;
    }
    return html + esc(text.slice(cursor));
  }

  let storageWarning = false;

  const icons = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',
    compare:
      '<path d="M8 3v18m8-18v18M3 7h10M11 17h10M5 5 3 7l2 2m14 6 2 2-2 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M4 5h16M4 12h16M4 19h16"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    globe:
      '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    shield:
      '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  };

  const icon = (n) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.arrow}</svg>`;

  icons.wallet =
    '<path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7"/><path d="M21 12h-6v4h6"/>';

  icons.calendar =
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>';

  icons.receipt =
    '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6m-6 4h3"/>';

  icons.sliders =
    '<path d="M3 6h5m4 0h9M3 18h9m4 0h5"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>';

  const brandFiles = Object.fromEntries(
    modelBrands.map((b) => [b.key, b.file]),
  );
  const brandIcon = modelBrandIcon;

  icons.key =
    '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 4 3 3m-6 0 3 3"/>';

  icons.user =
    '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>';

  icons.book =
    '<path d="M12 6c-3-3-7-3-9-2v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2Zm0 0v15"/>';

  icons.gift =
    '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 4-3Zm0 0h4a3 3 0 1 0-4-3Z"/>';

  Object.assign(icons, {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    calculator:
      '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h2m4 0h2M8 14h2m4 0h2M8 18h2m4 0h2"/>',
    categoryAll:
      '<path d="M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z"/>',
    categoryCare:
      '<path d="M12 18 4.5 11A4.7 4.7 0 0 1 12 5.4 4.7 4.7 0 0 1 19.5 11ZM3 20h18"/>',
    categoryEnterprise:
      '<path d="M4 21V7l8-4v18M12 9h8v12M2 21h20M7 9h2m-2 4h2m-2 4h2m6-4h2m-2 4h2"/>',
    categoryRocket:
      '<path d="M13 5c3-3 7-2 7-2s1 4-2 7l-6 6-5-5Zm-5 5H4l-2 5h5m7 1v4l-5 2v-5M5 18l-2 3"/><circle cx="15.5" cy="7.5" r="1.5"/>',
    categoryBonus:
      '<path d="M3 10h18v4H3Zm2 4v7h14v-7M12 10v11M12 10H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3M20 2v4m-2-2h4"/>',
    building:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h1m6 0h1M8 11h1m6 0h1"/>',
    wallet:
      '<path d="M20 7V5a2 2 0 0 0-2-2L5 5a3 3 0 0 0-2 3v10a3 3 0 0 0 3 3h14V7H6a2 2 0 0 1 0-4"/><path d="M20 11h-6v6h6m-3-3h.01"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6m-6 4h6m-6 4h3"/>',
    refund: '<path d="M3 9h11a6 6 0 0 1 0 12h-4M3 9l5-5M3 9l5 5"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    database:
      '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>',
    activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z"/><path d="M8 10h8m-8 4h5"/>',
    quote: '<path d="M10 5H4v7h5c0 4-2 6-5 7m16-14h-6v7h5c0 4-2 6-5 7"/>',
    news: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h10M7 12h4m-4 4h4m4-4h2m-2 4h2"/>',
    sliders:
      '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  });

  const sourceMeta = window.KUGNI_SOURCE;

  const sites = sourceMeta.sites.map((s) => ({
    ...s,
    pay: s.payments.map((p) => p.name).join(" / ") || "未公开",
  }));

  const brandOptions = [
    "GPT",
    "Claude",
    "Gemini",
    "DeepSeek",
    "Grok",
    "Qwen",
    "Kimi",
    "GLM",
  ];

  const fmtLatency = (s) =>
    s.latency == null
      ? "未记录"
      : s.latency >= 1000
        ? (s.latency / 1000).toFixed(1) + " s"
        : s.latency + " ms";

  const rateLabel = (s) => (s.rate == null ? "未公开" : s.rate + "×");

  const dilutionValue = (s) =>
    typeof s.dilutionRate === "number" &&
    Number.isFinite(s.dilutionRate) &&
    s.dilutionRate >= 0 &&
    s.dilutionRate <= 100 &&
    Number.isInteger(s.dilutionSampleCount) &&
    s.dilutionSampleCount > 0
      ? s.dilutionRate
      : null;

  const dilutionLabel = (s) =>
    dilutionValue(s) == null ? "未检测" : dilutionValue(s).toFixed(1) + "%";

  const dilutionMetric = (s) =>
    `<div class="dilution-metric ${dilutionValue(s) == null ? "unmeasured" : "measured"}"><strong>${dilutionValue(s) == null ? "—" : dilutionValue(s).toFixed(1) + "<small>%</small>"}</strong><span>${dilutionValue(s) == null ? "未检测" : s.dilutionSampleCount + " 次检测"}</span></div>`;

  icons.brain =
    '<path d="M12 5a3 3 0 0 0-5-2 3 3 0 0 0-3 4 4 4 0 0 0-1 7 4 4 0 0 0 4 6 3 3 0 0 0 5 1V5Zm0 0a3 3 0 0 1 5-2 3 3 0 0 1 3 4 4 4 0 0 1 1 7 4 4 0 0 1-4 6 3 3 0 0 1-5 1M7 8l2 2m-4 5h3m9-7-2 2m4 5h-3"/>';

  const testingStatus = () =>
    `<div class="testing-status" aria-label="中转检测待检测，降智检测待检测"><div class="test-status-row relay-status"><span class="test-type">${icon("shield")}<span>中转</span></span><span class="test-result pending"><i></i>待检测</span></div><div class="test-status-row capability-status"><span class="test-type">${icon("brain")}<span>降智</span></span><span class="test-result pending"><i></i>待检测</span></div></div>`;

  const paymentIcons = (s) =>
    s.payments.length
      ? `<div class="payment-icons">${s.payments.map((p) => `<img src="${esc(p.icon)}" alt="${esc(p.name)}" title="${esc(p.name)}" width="20" height="20">`).join("")}</div>`
      : '<span class="not-published">未公开</span>';

  let toastTimer;

  let pendingHomeCheck = null;

  const detailModelPageSize = 12;

  const button = (text, action, value = "", cls = "btn") =>
    `<button type="button" class="${cls}" data-action="${action}" data-value="${esc(value)}">${text}</button>`;

  const brand = `<a class="brand" href="#/" aria-label="KUGNI 首页"><span class="brand-mark" aria-hidden="true"><img src="favicon.svg" alt="" width="36" height="36"></span><span class="brand-word">UGNI</span></a>`;

  const empty = (title, desc, link = "#/", label = "去发现站点") =>
    `<div class="empty">${icon("search")}<h3>${title}</h3><p>${desc}</p><a class="btn light small" href="${link}">${label} ${icon("arrow")}</a></div>`;

  const notice = (text) =>
    `<div class="notice">${icon("shield")}<span>${text}</span></div>`;

  const pageHead = (en, title, desc, action = "") =>
    `<div class="page-head"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;

  const page = (content) => `<div class="container page">${content}</div>`;

  const logo = (s) =>
    `<span class="site-logo"><img data-site-logo src="${esc(s.logo)}" alt="${esc(s.name)} Logo" width="40" height="40"><span class="logo-fallback">${icon("globe")}</span></span>`;

  const saveBtn = (s) =>
    `<button class="save-btn ${state.saved.includes(s.id) ? "saved" : ""}" data-action="save" data-value="${s.id}" aria-label="${state.saved.includes(s.id) ? "取消收藏" : "收藏"} ${esc(s.name)}" aria-pressed="${state.saved.includes(s.id)}">${icon("star")}</button>`;

  const compareBtn = (s) =>
    button(
      `${icon("compare")} ${state.compare.includes(s.id) ? "已加入" : "加入对比"}`,
      "compare",
      s.id,
      `compare-btn ${state.compare.includes(s.id) ? "on" : ""}`,
    );

  function card(s) {
    return `<article class="site-card"><div class="card-top"><span class="card-rank">${String(s.rank).padStart(2, "0")}</span>${logo(s)}<div class="site-title"><h3><a href="#/site/${s.id}">${esc(s.name)}</a></h3><small>${esc(s.domain)}</small></div>${saveBtn(s)}</div><p class="card-desc">${esc(s.desc)}</p><div class="card-metrics"><div><div class="metric-value green">${s.uptime == null ? "—" : s.uptime.toFixed(2)}<small>%</small></div><div class="metric-label">来源可用率</div></div><div><div class="metric-value">${fmtLatency(s)}</div><div class="metric-label">平均延迟</div></div><div><div class="metric-value">${dilutionValue(s) == null ? "—" : dilutionLabel(s)}</div><div class="metric-label">掺水率${dilutionValue(s) == null ? " · 未检测" : ""}</div></div></div><div class="card-bottom"><div class="model-dots">${s.models
      .slice(0, 5)
      .map((m) => brandIcon(m, "model-dot"))
      .join(
        "",
      )}<small>${s.modelCount} 个模型</small></div>${compareBtn(s)}</div></article>`;
  }

  const publicRateSummaries = new Map();

  function publicRates(s) {
    if (publicRateSummaries.has(s.id)) return publicRateSummaries.get(s.id);
    const table = s.publicModelTable,
      index = table?.headers.indexOf("倍率") ?? -1;
    const entries =
      index < 0
        ? []
        : table.rows.flatMap((r) => {
            const match = String(r.cells[index] || "")
              .trim()
              .match(/^(\d+(?:\.\d+)?)\s*[x×]$/i);
            return match
              ? [{ brand: r.brand || "其他", value: Number(match[1]) }]
              : [];
          });
    const brands = [...new Set(entries.map((r) => r.brand))].sort((a, b) => {
      const ai = brandOptions.indexOf(a),
        bi = brandOptions.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    const groups = brands.map((brand) => {
      const values = entries
        .filter((r) => r.brand === brand)
        .map((r) => r.value);
      return { brand, min: Math.min(...values), max: Math.max(...values) };
    });
    const result = {
      min: entries.length ? Math.min(...entries.map((r) => r.value)) : null,
      groups,
    };
    publicRateSummaries.set(s.id, result);
    return result;
  }

  const rateNumber = (n) => String(Number(n.toFixed(4)));

  function ledgerStability(s) {
    const availability = Number.isFinite(s.uptime)
      ? Math.min(100, Math.max(0, s.uptime))
      : null;
    return `<div class="ledger-stability"><div class="stability-value"><b>${availability == null ? "—" : availability.toFixed(2) + "<small>%</small>"}</b><span>可用率</span></div><div class="snapshot-status-bar" role="meter" aria-label="来源可用率快照，不代表分时监测历史" aria-valuemin="0" aria-valuemax="100" ${availability == null ? "" : `aria-valuenow="${availability}"`} title="来源可用率快照 ${availability == null ? "未公开" : availability.toFixed(2) + "%"}；非分时历史">${Array.from({ length: 20 }, (_, i) => `<i aria-hidden="true"><span style="width:${Math.min(100, Math.max(0, (availability ?? 0) * 20 - i * 100))}%"></span></i>`).join("")}</div><small class="stability-source">来源快照 · 11.12</small><div class="stability-latency">${icon("clock")}<span>平均延迟</span><b>${fmtLatency(s)}</b></div></div>`;
  }

  function siteTable(list) {
    return `<div class="table-wrap station-table service-ledger"><table><colgroup>${["provider", "rate", "description", "testing", "stability", "models", "actions"].map((column) => `<col class="ledger-col-${column}">`).join("")}</colgroup><thead><tr><th>服务商</th><th title="公开模型分组中的最低值，仅适用于对应模型与分组">最低倍率</th><th>服务简介</th><th title="中转站测试与模型降智测试的结果状态">检测状态</th><th>稳定性 / 延迟</th><th>模型覆盖</th><th>操作</th></tr></thead><tbody>${list
      .map(
        (s) =>
          `<tr><td><div class="provider-cell"><span class="provider-order">${String(s.rank).padStart(2, "0")}</span><a class="table-name" href="#/site/${s.id}">${logo(s)}<span>${esc(s.name)}<small class="table-sub">${esc(s.domain)}</small></span></a></div></td><td class="lowest-rate-cell"><div class="lowest-model-rate ${publicRates(s).min == null ? "unknown" : ""}" title="仅表示公开分组最低值，具体模型报价请查看详情">${publicRates(s).min == null ? "—" : rateNumber(publicRates(s).min) + "<small>×</small>"}</div><span>${publicRates(s).min == null ? "暂无公开倍率" : "公开分组最低"}</span></td><td class="ledger-description-cell"><p class="ledger-description" title="${esc(s.desc)}">${descriptionMarkup(s.desc)}</p></td><td class="testing-cell">${testingStatus()}</td><td>${ledgerStability(s)}</td><td class="ledger-models"><div class="model-dots">${s.models
            .slice(0, 6)
            .map((m) => brandIcon(m, "model-dot"))
            .join(
              "",
            )}${s.models.length > 6 ? `<span class="more-brands" title="${esc(s.models.slice(6).join(" / "))}">+${s.models.length - 6}</span>` : ""}</div><span class="model-total">${s.modelCount} 个模型</span></td><td><div class="ledger-actions">${saveBtn(s)}${compareBtn(s)}<a class="ledger-open" href="#/site/${s.id}" aria-label="查看 ${esc(s.name)} 详情">${icon("arrow")}</a></div></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  }

  function accountContext() {
    return {
      state,
      read,
      write,
      esc,
      icon,
      render,
      toast,
      modal,
      sites,
      checkHistory,
      models,
      brands: brandOptions,
      brandIcon,
      logo,
    };
  }

  function header() {
    const section =
      window.KUGNI_ROUTER.hash.slice(1).split("?")[0].split("/")[1] || "home";

    return `<div class="container header-inner">${brand}
  ${window.KUGNI_NAVIGATION.render(section)}
  <button type="button" class="header-search search-launcher" id="global-search-trigger" aria-label="搜索站点或模型" aria-haspopup="dialog" aria-controls="discovery-search">${icon("search")}<span>搜索站点 / 模型</span><kbd>Ctrl K</kbd></button>
  <div class="header-actions"><button class="icon-btn" data-action="theme" aria-label="切换明暗主题">${icon("sun")}</button>${window.KUGNI_ACCOUNT.header(accountContext())}${window.KUGNI_NAVIGATION.toggle()}</div>
 </div>`;
  }

  function footer() {
    return window.KUGNI_SITE.footer(brand, brandIcon);
  }

  function tray() {
    return !/^#\/(?:compare|check)(?:[/?]|$)/.test(window.KUGNI_ROUTER.hash) &&
      state.compare.length
      ? `<div class="compare-tray"><span>${icon("compare")} 已选择 ${state.compare.length} / 4</span><div class="selected-items">${state.compare
          .map((id) => {
            const s = sites.find((s) => s.id === id);
            return button(`${esc(s.name)} ×`, "compare", id, "selected-chip");
          })
          .join(
            "",
          )}</div>${button("清空", "clear-compare", "", "text-link")}<a class="btn lime small" href="#/compare">开始对比 ${icon("arrow")}</a></div>`
      : "";
  }

  function pills(values, current, action) {
    return `<div class="pills">${values.map((v) => button(`${brandIcon(v)}${v}`, action, v, `pill ${current === v ? "active" : ""}`)).join("")}</div>`;
  }

  function filteredSites() {
    return sites
      .filter(
        (s) =>
          (state.kind === "全部" ||
            s.kind === state.kind ||
            (state.kind === "企业稳定站" && s.tags.includes("稳定企业向")) ||
            s.tags.some((t) => t.includes(state.kind)) ||
            (state.kind === "可开发票" && s.invoice.includes("是")) ||
            (state.kind === "国内支付" &&
              s.payments.some((p) =>
                [
                  "alipay",
                  "wechat",
                  "bankcard",
                  "bank",
                  "banktransfer",
                ].includes(p.key),
              ))) &&
          (state.payment === "全部" ||
            s.payments.some((p) => p.key === state.payment)) &&
          (state.model === "全部" || s.models.includes(state.model)) &&
          `${esc(s.name)} ${s.domain} ${esc(s.desc)} ${s.models.join(" ")} ${s.tags.join(" ")}`
            .toLowerCase()
            .includes(state.query.toLowerCase().trim()),
      )
      .sort((a, b) =>
        state.sort === "latency"
          ? (a.latency ?? Infinity) - (b.latency ?? Infinity)
          : state.sort === "uptime"
            ? b.uptime - a.uptime
            : state.sort === "models"
              ? b.modelCount - a.modelCount
              : a.rank - b.rank,
      );
  }

  function filterMenu(menu, label, options, current) {
    const text =
      options.find(([value]) => value === current)?.[1] || options[0][1];
    const set =
      menu === "payment" ? current !== "全部" : current !== "recommended";
    return `<div class="filter-menu${set ? " is-set" : ""}"><button type="button" class="filter-trigger" data-action="menu" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(label)}：${esc(text)}">${menu === "payment" ? `<span class="filter-kicker">${esc(label)}</span>` : ""}<span class="filter-value">${esc(text)}</span><svg class="filter-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="filter-panel" role="listbox" aria-label="${esc(label)}">${options.map(([value, name]) => `<button type="button" role="option" class="filter-option${value === current ? " active" : ""}" aria-selected="${value === current}" data-action="menu-pick" data-menu="${menu}" data-value="${esc(value)}"><span>${esc(name)}</span>${icon("check")}</button>`).join("")}</div></div>`;
  }

  function directoryToolbar(filtered) {
    const categories = [
      { name: "全部", icon: "categoryAll", tone: "neutral" },
      ...window.KUGNI_CONFIG.categories,
    ];
    const payments = [
      ["全部", "不限"],
      ["alipay", "支付宝"],
      ["wechatpay", "微信"],
      ["usdt", "USDT"],
      ["bankcard", "银行卡"],
      ["corporate", "对公转账"],
      ["paypal", "PayPal"],
    ];
    const order = [
      ["recommended", "默认顺序"],
      ["latency", "延迟优先"],
      ["uptime", "可用率优先"],
      ["models", "模型数量优先"],
    ];
    const active = [
      state.query ? `搜索：${state.query}` : "",
      state.model !== "全部" ? `模型：${state.model}` : "",
    ].filter(Boolean);
    return `<div class="catalog-toolbar"><nav class="catalog-categories" aria-label="站点分类"><div class="pills">${categories.map((category) => `<a class="category-chip ${state.kind === category.name ? "active" : ""}" href="#/sites${category.slug ? "/" + category.slug : ""}" data-tone="${category.tone}" data-value="${category.name}" ${state.kind === category.name ? 'aria-current="page"' : ""}><span class="category-symbol">${icon(category.icon)}</span><span>${category.name}</span></a>`).join("")}</div></nav><div class="catalog-controls">${filtered ? button("重置筛选", "reset", "", "text-link") : ""}<div class="catalog-payment">${filterMenu("payment", "支付方式", payments, state.payment)}</div><div class="result-controls">${filterMenu("sort", "站点排序", order, state.sort)}<div class="view-switch">${[
      ["grid", "卡片视图"],
      ["list", "表格视图"],
    ]
      .map(
        ([view, label]) =>
          `<button type="button" aria-label="${label}" data-action="view" data-value="${view}" aria-pressed="${state.view === view}" class="${state.view === view ? "active" : ""}">${icon(view)}</button>`,
      )
      .join(
        "",
      )}</div></div></div>${active.length ? `<p class="catalog-active-filters" role="status">${active.map(esc).join(" · ")}</p>` : ""}</div>`;
  }

  function homeModelHub() {
    const entry = (m) => {
      const model = models.find((model) => model.brand === m);
      const name = m === "GPT" ? "OpenAI" : m,
        count = sites.filter((s) => s.models.includes(m)).length;
      if (!model) return "";
      return `<a class="model-index-item" href="#/model/${model.id}" aria-label="查看 ${name} 模型资料及 ${count} 家服务商"><span class="index-brand">${brandIcon(m)}</span><span class="index-identity"><b>${name}</b><small><strong>${count}</strong> 家服务商</small></span></a>`;
    };
    return `<div class="hero-model-hub" aria-label="按模型筛选服务商"><div class="model-index" aria-label="常用模型入口"><div class="model-index-list">${brandOptions.map(entry).join("")}<details class="model-index-more"><summary>更多 <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="model-index-overflow" aria-label="更多模型入口">${brandOptions.map(entry).join("")}<a class="model-index-all" href="#/models">查看全部模型 ${icon("arrow")}</a></div></details></div></div></div>`;
  }

  function home(directoryOnly = false, category = null) {
    const list = filteredSites();
    const availability = sites.map((s) => s.uptime).filter(Number.isFinite);
    const averageAvailability = availability.length
      ? (
          availability.reduce((sum, value) => sum + value, 0) /
          availability.length
        ).toFixed(2)
      : "—";
    // Homepage test cards are UI fixtures until public measurements are connected.
    const recent = window.reports.length
      ? window.reports.slice(0, 3).map((r) => ({
          site: sites.find((s) => s.id === r.stationId) || {
            id: "",
            name: r.model,
            logo: "/favicon.svg",
          },
          model: r.model,
          score: r.score,
          id: r.id,
        }))
      : sites
          .slice(0, 3)
          .map((s) => ({ site: s, model: s.models[0], score: null, id: null }));
    const filtered =
      state.query || state.model !== "全部" || state.payment !== "全部";
    return `<div class="container catalog-home">
  ${
    directoryOnly
      ? `<header class="catalog-list-heading"><h1>${esc(category?.title || "API 中转站列表")}</h1><p>${esc(category?.description || window.KUGNI_CONTENT.pages["/sites"].description)}</p></header>`
      : `<section class="connection-intro" aria-label="API 服务发现"><div class="connection-intro-copy"><div class="connection-eyebrow"><span></span> KUGNI · API 服务排行与检测</div><h1>API 中转站<span>排行</span></h1><p>比较模型覆盖、价格与可用率，查看中转检测和降智检测状态。</p><div class="home-search-wrap"><button type="button" class="home-search-launcher" data-action="home-search" aria-label="搜索中转站、模型或服务商" aria-haspopup="dialog" aria-controls="discovery-search">${icon("search")}<span>搜索中转站、模型或服务商</span><span class="home-search-arrow" aria-hidden="true">${icon("arrow")}</span></button></div><div class="connection-caption" aria-label="目录概况"><span class="hero-stat provider-stat">${icon("building")}<span><b>${sites.length}</b> 家服务商</span></span><span class="hero-stat availability-stat" title="收录服务商来源可用率的算术平均值，非实时监测">${icon("activity")}<span><b>${averageAvailability}%</b> 平均可用率</span></span><span class="hero-stat ecosystem-stat">${icon("layers")}<span><b>${brandOptions.length}</b> 类模型生态</span></span></div></div>${homeModelHub()}</section>
  <section class="home-api-test" aria-label="基础接口测试"><form id="home-check-form" autocomplete="off"><div class="home-test-fields"><label><span>${icon("globe")} API 接口地址</span><div class="home-test-input">${icon("search")}<input type="url" name="endpoint" id="home-endpoint" autocomplete="url" required placeholder="https://api.example.com/v1" aria-label="API 接口地址"></div></label><label><span>${icon("key")} API Key</span><div class="home-test-input">${icon("key")}<input type="password" name="key" required placeholder="sk-…" autocomplete="new-password" aria-label="API Key" id="home-api-key"><button type="button" class="home-key-toggle" data-action="home-show-key" aria-label="显示密钥">显示</button></div></label><label><span>${icon("layers")} 目标模型</span>${renderModelField(window.modelChoices, { id: "home-model", value: window.modelChoices.find((m) => m.id === "claude-sonnet-4-5")?.id || window.modelChoices.find((m) => m.brand === "Claude" && m.id !== "Claude")?.id || window.modelChoices[0]?.id || "" })}</label></div><div class="home-test-submit"><button class="home-test-example" type="button" data-action="home-demo-key">填入示例</button><span>本地模拟 · 不发送请求</span><button type="submit" class="btn primary">开始基础测试 ${icon("arrow")}</button></div></form><div class="home-test-note"><span>请使用测试用示例 Key，密钥不会保存。结果将在独立报告页展示。</span><a href="#/check/history">${icon("clock")} 检测历史 ${icon("arrow")}</a></div></section>
  <section class="workspace-updates recent-tests" aria-label="最近实测"><div class="workspace-updates-head"><h2>最近实测</h2><span>审核通过的公开报告</span></div><div class="workspace-update-list">${recent.map(({ site: s, model, score }) => `<a href="/tools/api-check/reports/${recent.find((r) => r.site === s)?.id}/" class="workspace-update" aria-label="查看 ${esc(s.name)} 站点详情，实测评分 ${score} 分"><div class="update-identity">${logo(s)}<div><strong>${esc(s.name)}</strong><span class="recent-test-model">${brandIcon(model)}${esc(model === "GPT" ? "OpenAI" : model)}</span></div><span class="update-open">${icon("arrow")}</span></div><div class="update-foot recent-test-metrics"><span class="recent-test-score"><small>评分</small><b>${score == null ? "待检测" : score}<small>${score == null ? "" : " / 100"}</small></b></span></div></a>`).join("")}</div></section>`
  }
  <section class="directory catalog-directory" id="directory" aria-label="服务商一览">
   ${directoryToolbar(filtered)}
   ${list.length ? (state.view === "grid" ? `<div class="site-grid">${list.map(card).join("")}</div>` : siteTable(list)) : empty("未找到匹配站点", category ? "当前来源快照没有符合条件的记录，可重置附加筛选或查看全部站点。" : "试试其他关键词，或重置筛选。", "#/sites", "查看全部站点")}
   <div class="catalog-data-note"><span>倍率取自公开模型分组；状态条表示来源可用率快照，非分时历史。中转与降智测试暂未接入，检测状态为待检测。</span></div>
  </section>
  <section class="catalog-next"><div><span>${icon("bolt")}</span><div><h2>找到服务商，接下来试试连接。</h2><p>查看接入步骤，或体验一次接口检测流程。</p></div></div><a href="#/guide">接入指南 ${icon("arrow")}</a><a href="#/check" class="btn light">体验接口检测 ${icon("arrow")}</a></section>
 </div>`;
  }

  function detailInfo(s) {
    const unknown = (v) =>
      !v || ["—", "未公开"].includes(v)
        ? '<span class="detail-unknown">未公开</span>'
        : esc(v);
    const facts = [
      {
        key: "kind",
        glyph: "building",
        tone: "purple",
        label: "站点类型",
        value: esc(s.kind),
      },
      {
        key: "payment",
        glyph: "wallet",
        tone: "blue",
        label: "支付方式",
        value: s.payments.length
          ? `<div class="detail-payment-methods">${s.payments.map((p) => `<span title="${esc(p.name)}"><img src="${esc(p.icon)}" alt="${esc(p.name)}" width="20" height="20"><small>${esc(p.name)}</small></span>`).join("")}</div>`
          : unknown(null),
      },
      {
        key: "recharge",
        glyph: "bolt",
        tone: "amber",
        label: "最低充值",
        value: `<span class="detail-money">${unknown(s.minRecharge)}</span>`,
      },
      {
        key: "invoice",
        glyph: "receipt",
        tone: "blue",
        label: "发票",
        value: unknown(s.invoice),
      },
      {
        key: "refund",
        glyph: "refund",
        tone: "green",
        label: "退款政策",
        value: unknown(s.refund),
      },
      {
        key: "listed",
        glyph: "calendar",
        tone: "purple",
        label: "收录时间",
        value: unknown(s.listedAt),
      },
      {
        key: "models",
        glyph: "layers",
        tone: "purple",
        label: "模型生态",
        value: s.models.length
          ? `<div class="detail-brand-marks">${s.models.map((m) => `<span title="${esc(m)}">${brandIcon(m)}<small>${esc(m === "GPT" ? "OpenAI" : m)}</small></span>`).join("")}</div>`
          : unknown(null),
      },
      {
        key: "rate",
        glyph: "sliders",
        tone: "amber",
        label: "统一倍率",
        value: s.rate == null ? unknown(null) : esc(rateLabel(s)),
      },
      {
        key: "source",
        glyph: "database",
        tone: "green",
        label: "数据来源",
        value: `<span class="detail-source-name">公开资料</span><small class="detail-source-date">${esc(s.sourceDate || "")} 资料快照</small>`,
      },
    ];
    return `<dl class="detail-facts">${facts.map(({ key, glyph, tone, label, value }) => `<div class="detail-fact tone-${tone}" data-fact="${key}"><dt><span class="fact-symbol">${icon(glyph)}</span><span class="fact-label">${label}</span></dt><dd class="fact-value">${value}</dd></div>`).join("")}</dl>`;
  }

  function detail(id) {
    const s = sites.find((s) => s.id === id);
    if (!s)
      return page(empty("这个站点还没有收录", "返回目录，探索其他连接。"));
    const sections = [
      ["overview-heading", "building", "站点概览"],
      ["models-heading", "layers", "模型与价格"],
      ["monitor-heading", "activity", "监测记录"],
      ["updates-heading", "news", "站点公告"],
      ["reviews-heading", "chat", "用户评价"],
    ];
    const title = (id, glyph, text) =>
      `<h2 id="${id}" tabindex="-1"><span class="detail-title-icon">${icon(glyph)}</span>${text}</h2>`;
    return `<div class="container page detail-page">
  <div class="breadcrumbs"><a href="#/">发现站点</a> / ${esc(s.name)}</div>
  <section class="detail-hero">
   <div class="detail-identity">${logo(s)}<div><h1>${esc(s.name)}</h1><p>${icon("globe")} ${esc(s.domain)}<span class="identity-separator">·</span>${esc(s.kind)}</p></div>
    <div class="detail-actions"><a class="btn primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">访问官网 ${icon("arrow")}</a>${button(`${icon("star")} ${state.saved.includes(id) ? "已收藏" : "收藏站点"}`, "save", id, "btn light")}${button(`${icon("compare")} 对比`, "compare", id, "btn light")}</div>
   </div>
   <p class="detail-desc">${esc(s.desc)}</p>
   <div class="detail-stats">${[
     [
       (s.uptime == null ? "—" : s.uptime.toFixed(2)) + "%",
       "来源可用率",
       "activity",
       "green",
     ],
     [fmtLatency(s), "平均延迟", "clock", "blue"],
     [s.modelCount, "支持模型", "layers", "purple"],
     [
       s.minRecharge === "—" ? "未公开" : s.minRecharge,
       "最低充值",
       "wallet",
       "amber",
     ],
   ]
     .map(
       ([v, t, glyph, tone]) =>
         `<div class="tone-${tone}"><span class="stat-symbol">${icon(glyph)}</span><div><strong>${esc(v)}</strong><p>${t}</p></div></div>`,
     )
     .join("")}</div>
  </section>
  <nav class="detail-tabs" aria-label="详情页导航">${sections.map(([key, glyph, text], i) => `<button type="button" data-action="detail-section" data-value="${key}" ${i === 0 ? 'class="active" aria-current="location"' : ""}>${icon(glyph)}<span>${text}</span>${key === "models-heading" ? `<small>${s.modelCount}</small>` : ""}</button>`).join("")}</nav>
  <div class="detail-content">
   ${notice("公开资料快照；可用率和延迟为记录值，请结合资料日期核对。")}
   <section class="panel detail-overview" aria-labelledby="overview-heading" data-detail-section="overview-heading">
    <div class="detail-panel-head">${title("overview-heading", "building", "站点概览")}<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">服务商官网 ${icon("arrow")}</a></div>
    <div class="overview-body">${detailInfo(s)}
    <section class="source-description"><span class="source-quote">${icon("quote")}</span><div><h3>服务介绍</h3><p>${esc(s.description || s.desc)}</p>${s.assessmentSummary ? `<h3>来源测评摘要</h3><p>${esc(s.assessmentSummary)}</p>` : ""}</div></section></div>
    <div class="detail-next"><span>${icon("shield")} 以上为服务商公开资料，请以当前公示为准。</span><a class="btn light small" href="#/check?site=${id}">${icon("bolt")} 体验接口检测 ${icon("arrow")}</a></div>
   </section>
   <section class="detail-section" aria-labelledby="models-heading" data-detail-section="models-heading">
    <div class="section-head"><div>${title("models-heading", "layers", "模型与价格")}<p>模型报价与渠道状态，一处查看。</p></div></div>

    <div id="source-model-browser" data-site="${esc(s.id)}">${sourceModelTable(s)}</div>
   </section>
   <section class="panel detail-monitor" aria-labelledby="monitor-heading" data-detail-section="monitor-heading"><div class="section-head"><div>${title("monitor-heading", "activity", "监测记录")}<p>公开资料快照 · ${esc(s.sourceDate || "")}</p></div><span class="snapshot-mark">${icon("clock")} 资料快照</span></div><div class="source-monitor"><div class="tone-purple"><span class="monitor-symbol">${icon("shield")}</span><b>${dilutionValue(s) == null ? "—" : dilutionLabel(s)}</b><span>掺水率${dilutionValue(s) == null ? " · 未检测" : ""}</span></div><div class="tone-green"><span class="monitor-symbol">${icon("activity")}</span><b>${s.uptime == null ? "—" : s.uptime.toFixed(2)}<small>%</small></b><span>来源可用率</span></div><div class="tone-blue"><span class="monitor-symbol">${icon("clock")}</span><b>${fmtLatency(s)}</b><span>来源平均延迟</span></div></div><p class="detail-desc">${s.channelSnapshot?.channels?.length ? "以上为资料快照，渠道历史请查看模型与价格。" : "当前公开资料未提供连续监测历史。"}</p></section>
   <section class="panel source-update" aria-labelledby="updates-heading" data-detail-section="updates-heading"><div class="detail-panel-head">${title("updates-heading", "news", "站点公告")}<span class="notice-count">${s.publicUpdates?.length || 0} 条公告</span></div>${s.publicUpdates?.length ? stationNotices(s.publicUpdates, esc) : `<p class="detail-desc">暂未采集到站点公告。</p>`}</section>
   ${reviews(id)}
  </div>
 </div>`;
  }

  function detailModelView(s) {
    if (!detailModelViews.has(s.id))
      detailModelViews.set(s.id, { brand: "全部", page: 1 });
    const view = {
      mode: s.channelSnapshot?.channels?.length ? "group" : "model",
      range: "24h",
      ...detailModelViews.get(s.id),
    };
    const ranges = s.channelSnapshot?.supportedRanges;
    if (ranges?.length && !ranges.includes(view.range)) view.range = ranges[0];
    return view;
  }

  function sourceModelTable(s) {
    const view = detailModelView(s),
      rows = modelChannelRows(s, view.mode);
    const toolbar = channelToolbar(view, s.channelSnapshot, esc);
    const brands = brandOptions.filter((m) => rows.some((r) => r.brand === m));
    const other = rows.filter((r) => !brandOptions.includes(r.brand));
    const options = ["全部", ...brands, ...(other.length ? ["其他"] : [])];
    if (!options.includes(view.brand)) {
      view.brand = "全部";
      view.page = 1;
    }
    const list = rows.filter(
      (r) =>
        (!view.group || r.group === view.group) &&
        (view.brand === "全部" ||
          (view.brand === "其他"
            ? !brandOptions.includes(r.brand)
            : r.brand === view.brand)),
    );
    const pages = Math.max(1, Math.ceil(list.length / detailModelPageSize));
    view.page = Math.min(Math.max(1, view.page), pages);
    const start = (view.page - 1) * detailModelPageSize,
      visible = list.slice(start, start + detailModelPageSize);
    const filters = `<div class="detail-model-filters" aria-label="按模型生态筛选">${options.map((m) => `<button type="button" class="detail-model-filter ${view.brand === m ? "active" : ""}" data-action="detail-model-brand" data-value="${esc(m)}" aria-pressed="${view.brand === m}">${brandIcon(m)}<span>${esc(m)}</span><small>${m === "全部" ? rows.length : m === "其他" ? other.length : rows.filter((r) => r.brand === m).length}</small></button>`).join("")}</div>`;
    const summary = `<div class="source-model-count" role="status">${view.brand === "全部" ? "公开模型 / 分组明细" : esc(view.brand) + " 模型 / 分组明细"} <b>${list.length}</b> 条${list.length ? `<span>显示 ${start + 1}–${start + visible.length} 条</span>` : ""}</div>`;
    const pricingMeta = s.pricingSnapshot?.collectedAt
      ? `<p class="source-pricing-meta">报价更新于 <time>${esc(sourceDate(s.pricingSnapshot.collectedAt))}</time>（北京时间） · ${s.pricingSnapshot.unitVerified ? "币种与计费单位已核对" : "倍率与动态计费以来源说明为准"} ${sourceLink(s.pricingSnapshot.sourceUrl, esc)}</p>`
      : "";
    if (!rows.length)
      return (
        toolbar +
        filters +
        '<p class="detail-desc">来源页面未列出具体模型与价格。</p>'
      );
    if (!list.length)
      return (
        toolbar +
        filters +
        summary +
        '<div class="detail-model-empty">当前生态没有公开的模型明细，可切换其他模型查看。</div>'
      );
    const numbers = [
      ...new Set([
        1,
        pages,
        ...Array.from({ length: 3 }, (_, i) => view.page + i - 1).filter(
          (n) => n > 0 && n <= pages,
        ),
      ]),
    ].sort((a, b) => a - b);
    const pager = `<nav class="detail-model-pagination" aria-label="模型列表分页"><span>第 ${view.page} / ${pages} 页 · 每页 ${detailModelPageSize} 条</span><div><button type="button" data-action="detail-model-page" data-value="${view.page - 1}" ${view.page === 1 ? "disabled" : ""}>上一页</button>${numbers.map((n, i) => `${i && n - numbers[i - 1] > 1 ? '<span class="page-gap">…</span>' : ""}<button type="button" data-action="detail-model-page" data-value="${n}" ${view.page === n ? 'class="active" aria-current="page"' : ""} aria-label="第 ${n} 页">${n}</button>`).join("")}<button type="button" data-action="detail-model-page" data-value="${view.page + 1}" ${view.page === pages ? "disabled" : ""}>下一页</button></div></nav>`;
    return (
      toolbar +
      filters +
      summary +
      pricingMeta +
      `<div class="table-wrap source-model-table"><table><thead><tr>${[view.mode === "group" ? "分组 / 监测项" : "模型 / 分组", "倍率", "输入/输出", "缓存", "纯度", "延迟", "可用率 / 趋势"].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${visible.map((r) => `<tr><td><span class="source-model-name">${brandIcon(r.brand)}<span>${view.mode === "group" && r.models?.length ? `<button type="button" class="model-group-link" data-action="detail-model-group" data-value="${esc(r.group)}">${esc(r.cells[0])} <span>›</span></button><small>${r.models.length} 个模型</small>` : `<b>${esc(r.cells[0])}</b>${view.mode === "model" ? `<small>${esc(r.group)}</small>` : `<small>来源监测项</small>`}`}</span></span></td>${[2, 3, 4, 5, 6].map((i) => `<td>${esc(r.cells[i] || "—")}</td>`).join("")}<td>${channelTrend(r.channel, s.channelSnapshot, view.range, esc)}</td></tr>`).join("")}</tbody></table></div>` +
      pager
    );
  }

  function reviews(id) {
    const all = state.reviews.filter((r) => r.site === id);
    return `<section class="panel detail-reviews" aria-labelledby="reviews-heading" data-detail-section="reviews-heading"><h2 id="reviews-heading" tabindex="-1"><span class="detail-title-icon">${icon("chat")}</span>用户评价</h2><p class="detail-desc">分享你的使用感受。评价经审核后公开。</p>${all.length ? all.map((r) => `<article class="review"><div class="review-head"><span class="avatar">${icon("user")}</span><b>${esc(r.name)}</b><span class="stars">${"★".repeat(r.rating)}</span><time>${esc(r.date)}</time></div><p class="detail-desc">${esc(r.text)}</p></article>`).join("") : '<p class="detail-desc">还没有公开评价，来写下第一条吧。</p>'}<form class="review-form" id="review-form" data-site="${id}"><label class="field"><span>你的评分</span><select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} 星</option>`).join("")}</select></label><textarea name="text" required maxlength="500" aria-label="评价内容" placeholder="哪些地方让你印象深刻？（最多 500 字）"></textarea><div class="review-controls"><span class="table-sub">评价提交后进入审核</span><button class="btn small">发布评价</button></div></form></section>`;
  }

  function modelCards(list) {
    return `<div class="model-grid">${list.map((m) => `<article class="model-card"><div class="model-brand"><span class="model-identity">${brandIcon(m.brand)}<span>${m.brand === "GPT" ? "OpenAI" : m.brand}</span></span><span class="tag">${m.context}</span></div><h3><a href="#/model/${m.id}">${m.name}</a></h3><p>${m.desc}</p><div class="tags"><span class="tag">${m.type}</span><span class="tag">${m.context} 上下文</span></div><div class="model-price">$${m.input}<small>/ 百万输入 tokens · 演示价格</small></div><div class="card-bottom"><span>${sites.filter((s) => s.models.includes(m.brand)).length} 个站点支持</span><a href="#/model/${m.id}" class="text-link">探索模型 ${icon("arrow")}</a></div></article>`).join("")}</div>`;
  }

  const modelFilters = {
    type: "全部",
    input: "全部",
    output: "全部",
    reasoning: "全部",
    tools: "全部",
    json: "全部",
    weights: "全部",
  };

  let modelOrder = "default",
    providerQuery = window.view.providerQuery || "";

  const modelSpecs = {
    gpt: {
      publisher: "OpenAI",
      output: "16K",
      inputs: ["文字", "图片"],
      reasoning: false,
    },
    claude: {
      publisher: "Anthropic",
      output: "32K",
      inputs: ["文字", "图片", "PDF", "文件"],
      reasoning: false,
    },
    gemini: {
      publisher: "Google",
      output: "8K",
      inputs: ["文字", "图片", "音频", "视频", "PDF"],
      reasoning: false,
    },
    deepseek: {
      publisher: "DeepSeek",
      output: "8K",
      inputs: ["文字"],
      reasoning: true,
    },
  };

  const spec = (m) => ({
    publisher: m.brand === "GPT" ? "OpenAI" : m.brand,
    output: "未公开",
    inputs: ["文字"],
    reasoning: null,
    ...modelSpecs[m.id],
  });

  const capsule = (text, on = true) =>
    `<span class="atlas-tag ${on ? "supported" : "unknown"}">${esc(text)}</span>`;

  const atlasBrand = (m) =>
    `<span class="atlas-brand">${brandIcon(m.brand)}${esc(spec(m).publisher)}</span>`;

  function atlasTable(list) {
    return `<div class="atlas-table-scroll"><table class="atlas-table"><colgroup>${["model", "publisher", "type", "providers", "context", "output-limit", "input", "output", "capabilities", "price", "action"].map((column) => `<col class="atlas-col-${column}">`).join("")}</colgroup><thead><tr><th>模型</th><th>发行商</th><th>类型</th><th>服务商</th><th>上下文</th><th>最大输出</th><th>输入</th><th>输出</th><th>能力</th><th><button data-action="atlas-sort">示例价格 ${modelOrder === "price" ? "↑" : "↕"}</button><small>输入 / 输出 · USD</small></th><th></th></tr></thead><tbody>${list
      .map(
        (m) =>
          `<tr><td><a class="atlas-model-name" href="#/model/${m.id}">${esc(m.name)}</a><code>${m.id}</code></td><td>${atlasBrand(m)}</td><td>${m.id === "gemini" ? "多模态" : "文本"}</td><td><a class="atlas-count" href="#/model/${m.id}">${sites.filter((s) => s.models.includes(m.brand)).length} 家</a></td><td class="atlas-number">${m.context}</td><td class="atlas-number">${spec(m).output}</td><td><div class="atlas-tags">${spec(
            m,
          )
            .inputs.map((t) => capsule(t))
            .join(
              "",
            )}</div></td><td>${capsule("文字")}</td><td><div class="atlas-tags">${capsule("推理", spec(m).reasoning)}${capsule("工具 · 未收录", false)}${capsule("JSON · 未收录", false)}</div></td><td><strong class="atlas-price">${m.input == null ? "未公开报价" : "$" + m.input + " / $" + m.output}</strong><small>每百万 tokens · 示例</small></td><td><a class="atlas-open" href="#/model/${m.id}" aria-label="查看 ${esc(m.name)} 详情">${icon("arrow")}</a></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  }

  function modelsPage() {
    const list = models
      .filter(
        (m) =>
          (state.brand === "全部" || state.brand === m.brand) &&
          `${m.name} ${m.id} ${spec(m).publisher} ${m.desc}`
            .toLowerCase()
            .includes(state.modelQuery.toLowerCase()) &&
          (modelFilters.type === "全部" ||
            (m.id === "gemini" ? "多模态" : "文本") === modelFilters.type) &&
          (modelFilters.input === "全部" ||
            spec(m).inputs.includes(modelFilters.input)) &&
          (modelFilters.output === "全部" || modelFilters.output === "文字") &&
          (modelFilters.reasoning === "全部" ||
            spec(m).reasoning === (modelFilters.reasoning === "支持")) &&
          ["tools", "json", "weights"].every(
            (k) => modelFilters[k] === "全部" || modelFilters[k] === "未收录",
          ),
      )
      .sort((a, b) => (modelOrder === "price" ? a.input - b.input : 0));
    const filters = [
      ["type", "模型类型", ["文本", "多模态"]],
      ["input", "输入能力", ["文字", "图片", "音频", "视频", "PDF", "文件"]],
      ["output", "输出能力", ["文字", "图片", "音频", "视频"]],
      ["reasoning", "推理", ["支持", "不支持"]],
      ["tools", "工具调用", ["支持", "不支持", "未收录"]],
      ["json", "结构化输出", ["支持", "不支持", "未收录"]],
      ["weights", "开放权重", ["支持", "不支持", "未收录"]],
    ];
    return page(
      `<section class="atlas-page"><div class="atlas-heading"><span class="atlas-eyebrow">MODEL DIRECTORY</span><h1>AI 模型资料库</h1><p>一览模型能力、上下文与参考价格，找到适合你的 API 服务商。</p></div><div class="atlas-summary"><div><strong>${models.length}</strong> 收录模型</div><div><strong>${new Set(models.map((m) => m.brand)).size}</strong> 模型发行商</div><div><strong>${sites.length}</strong> 收录服务商</div><span>模型参数与价格为示例 · 服务商为来源快照</span></div><section class="atlas-filter" aria-label="模型筛选"><form id="model-search" class="atlas-search">${icon("search")}<input name="q" value="${esc(state.modelQuery)}" placeholder="搜索模型名称、模型 ID 或发行商" aria-label="搜索模型"><button type="submit">搜索</button></form><div class="atlas-selects">${filters.map(([key, label, options]) => `<label><span>${label}</span><select data-atlas-filter="${key}" aria-label="${label}">${["全部", ...options].map((v) => `<option ${modelFilters[key] === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>`).join("")}</div></section><div class="atlas-results"><span>找到 <b>${list.length}</b> 个模型</span><div><span>价格单位：USD / 1M tokens · 示例价格</span>${button("重置筛选", "atlas-reset", "", "text-link")}</div></div>${list.length ? atlasTable(list) : empty("没有符合条件的模型", "调整搜索词或筛选条件，再试一次。", "#/models", "返回模型资料库")}</section>`,
    );
  }

  function modelProviders(record) {
    const matches = matchModelProviders(record.model, sites);
    const all = matches.exact.length ? matches.exact : matches.related;
    const query = (params().get("q") || "").trim();
    const list = all.filter((site) =>
      `${site.name} ${site.domain}`.toLowerCase().includes(query.toLowerCase()),
    );
    const title = matches.exact.length ? "支持该型号的中转站" : "同系列中转站";
    const description = matches.exact.length
      ? "按已收录的具体型号匹配；价格分组与可用性请查看站点详情。"
      : "按模型系列匹配；尚未收录此型号的精确报价，请到站点详情核对支持情况。";
    return {
      count: all.length,
      exact: matches.exact.length > 0,
      html: `<section class="catalog-providers" id="model-providers"><div class="atlas-provider-heading"><div><h2>${title} <small>${all.length} 家</small></h2><p>${description}</p></div><form class="atlas-search" data-catalog-filter method="get"><input name="q" value="${esc(query)}" placeholder="搜索服务商名称或域名" aria-label="搜索服务商"><button type="submit">${icon("search")} 搜索</button></form></div>${list.length ? siteTable(list) : `<div class="catalog-empty">${query ? "未找到匹配服务商" : "暂未收录匹配的中转站"}<p><a href="/stations/">查看全部中转站 →</a></p></div>`}</section>`,
    };
  }

  function modelDetail(id) {
    const m = models.find((m) => m.id === id);
    if (!m)
      return page(
        empty(
          "模型不存在",
          "返回资料库查看全部模型。",
          "#/models",
          "模型资料库",
        ),
      );
    const list = sites.filter(
      (s) =>
        s.models.includes(m.brand) &&
        `${s.name} ${s.domain}`
          .toLowerCase()
          .includes(providerQuery.toLowerCase()),
    );
    return page(
      `<section class="atlas-page atlas-detail"><div class="breadcrumbs"><a href="#/models">模型资料库</a><span> / ${esc(m.name)}</span></div><div class="atlas-detail-heading"><div>${brandIcon(m.brand, "model-detail-icon")}<div><span class="atlas-eyebrow">MODEL PROFILE</span><h1>${esc(m.name)}</h1><code>${m.id}</code></div></div><a class="btn light small" href="#/models">返回模型列表</a></div><p class="atlas-description">${m.desc}</p><div class="atlas-facts">${[
        ["发行商", spec(m).publisher],
        ["模型类型", m.type],
        ["上下文", m.context],
        ["最大输出", spec(m).output],
        ["知识截止", "未收录"],
        ["开放权重", "未收录"],
        ["License", "未收录"],
        ["发布日期", "未收录"],
      ]
        .map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`)
        .join(
          "",
        )}</div><div class="atlas-capabilities"><section><h3>输入能力</h3><div class="atlas-tags">${spec(
        m,
      )
        .inputs.map((t) => capsule(t + " · 支持"))
        .join(
          "",
        )}</div></section><section><h3>输出能力</h3><div class="atlas-tags">${capsule("文字 · 支持")}</div></section><section><h3>API 能力</h3><div class="atlas-tags">${capsule("推理 · " + (spec(m).reasoning ? "支持" : "不支持"), spec(m).reasoning)}${capsule("工具调用 · 未收录", false)}${capsule("结构化输出 · 未收录", false)}</div></section></div><section class="atlas-pricing"><header><h2>${icon("receipt")} 模型参考价格 <span>USD</span></h2><small>示例单价，非官方实时报价</small></header><div>${[
        ["输入", m.input],
        ["输出", m.output],
        ["缓存读取", null],
      ]
        .map(
          ([k, v]) =>
            `<div><span>${k}</span><p><strong>${v == null ? "未收录" : "$" + v}</strong>${v == null ? "" : " / 1M tokens"}</p></div>`,
        )
        .join(
          "",
        )}</div></section><div class="atlas-provider-heading"><div><h2>支持该模型的服务商 <small>${list.length} 家</small></h2><p>按模型生态匹配收录站点，具体型号与分组报价请查看站点详情。</p></div><form id="provider-search" class="atlas-search">${icon("search")}<input name="q" value="${esc(providerQuery)}" placeholder="搜索服务商名称或域名" aria-label="搜索服务商"><button>搜索</button></form></div>${list.length ? siteTable(list) : empty("未找到服务商", "试试其他站点名称或域名。", "#/model/" + m.id, "返回模型详情")}<p class="atlas-footnote">模型规格为界面演示值；服务商资料为公开信息快照，不代表该站支持此生态的全部具体型号。</p></section>`,
    );
  }

  const planFilters = {
    seller: "全部",
    type: "全部",
    brand: "全部",
    model: "全部",
    price: "全部",
  };

  let selectedPlans = [];

  const planEditorial = {
    p1: {
      brief: "围绕单个问题反复讨论，从代码解释到文档整理。",
      uses: ["代码问答", "文档解读"],
      billing: "月度订阅",
      access: "对话式协作",
      note: "适合个人日常使用",
    },
    p2: {
      brief: "面向连续调试与代码梳理，保持较长的协作过程。",
      uses: ["仓库梳理", "多轮调试"],
      billing: "月度订阅",
      access: "长任务协作",
      note: "适合频繁切换开发任务",
    },
    p3: {
      brief: "把需求说明、内容写作与代码辅助放在同一流程。",
      uses: ["需求整理", "代码解释"],
      billing: "月度订阅",
      access: "通用工作助手",
      note: "适合写作与开发交替使用",
    },
    p4: {
      brief: "先拆解复杂目标，再逐步比较方案、推进任务。",
      uses: ["任务拆解", "方案推演"],
      billing: "月度订阅",
      access: "复杂项目协作",
      note: "适合需要深入推演的项目",
    },
    p5: {
      brief: "围绕编辑器中的小任务，完成补全、修改和排错。",
      uses: ["轻量补全", "错误排查"],
      billing: "月度编程套餐",
      access: "编辑器工作流",
      note: "适合从轻量开发开始",
    },
    p6: {
      brief: "同一工作流中切换模型，为不同任务分配用量。",
      uses: ["模型切换", "用量分配"],
      billing: "月度 Token 套餐",
      access: "多模型工作流",
      note: "适合比较不同模型表现",
    },
  };

  function planModelTags(p) {
    return p.models
      .map((id) => {
        const m = models.find((m) => m.id === id);
        return `<a class="plan-model-tag model-tone-${m.brand.toLowerCase()}" href="#/model/${id}">${brandIcon(m.brand)}${esc(m.name)}</a>`;
      })
      .join("");
  }

  function planFilterRow(key, label, options) {
    return `<div class="plan-filter-row"><span>${label}</span><div>${["全部", ...options].map((v) => `<button data-action="plan-filter" data-key="${key}" data-value="${esc(v)}" class="${planFilters[key] === v ? "active" : ""}" aria-pressed="${planFilters[key] === v}">${v === "全部" ? "" : key === "brand" ? brandIcon(v) : key === "seller" ? (v === "Claude" ? brandIcon("Claude") : v === "ChatGPT" ? brandIcon("GPT") : icon("layers")) : key === "type" ? icon(v === "Coding Plan" ? "calculator" : v === "Token Plan" ? "database" : "user") : ""}${esc(v)}</button>`).join("")}</div></div>`;
  }

  function codingPlans() {
    const list = planExamples.filter(
      (p) =>
        (planFilters.seller === "全部" || p.seller === planFilters.seller) &&
        (planFilters.type === "全部" || p.type === planFilters.type) &&
        (planFilters.brand === "全部" ||
          p.models.some(
            (id) => models.find((m) => m.id === id).brand === planFilters.brand,
          )) &&
        (planFilters.model === "全部" ||
          p.models.includes(planFilters.model)) &&
        (planFilters.price === "全部" ||
          (planFilters.price === "under" ? p.price <= 30 : p.price > 30)),
    );
    const chosen = Object.entries(planFilters).filter(([, v]) => v !== "全部");
    return page(
      `<section class="plans-page"><section class="plan-recommend"><div><span class="atlas-eyebrow">FIND YOUR CODING PLAN</span><h2>找到适合你的编程套餐</h2><p>从支持模型、订阅方式与预算出发，比较你的选择。</p></div>${button("选购参考 " + icon("arrow"), "plan-guide", "", "btn primary")}</section><div class="plan-title"><h1>AI 编程套餐对比</h1><div><a class="btn light small" href="#/models">模型能力参考 ${icon("arrow")}</a>${button(icon("compare") + " 套餐对比" + (selectedPlans.length ? " (" + selectedPlans.length + ")" : ""), "plan-compare", "", "btn primary small")}</div></div><section class="plan-filters" aria-label="套餐筛选"><div class="plan-selection"><span>已选择</span><div>${chosen.length ? chosen.map(([k, v]) => `<button data-action="plan-filter" data-key="${k}" data-value="全部">${esc(k === "model" ? models.find((m) => m.id === v)?.name : k === "price" ? (v === "under" ? "$30 及以下" : "$30 以上") : v)} ×</button>`).join("") : "<small>暂无筛选条件</small>"}</div>${button("清空全部", "plan-reset", "", "text-link")}</div>${planFilterRow("seller", "售卖厂商", [...new Set(planExamples.map((p) => p.seller))])}${planFilterRow("type", "套餐类型", ["Coding Plan", "Token Plan", "官方订阅"])}${planFilterRow("brand", "模型厂商", ["GPT", "Claude", "Gemini", "DeepSeek"])}<div class="plan-filter-row"><span>模型</span><div>${["全部", ...models.map((m) => m.id)].map((id) => `<button data-action="plan-filter" data-key="model" data-value="${id}" class="${planFilters.model === id ? "active" : ""}" aria-pressed="${planFilters.model === id}">${id === "全部" ? "全部" : brandIcon(models.find((m) => m.id === id).brand) + esc(models.find((m) => m.id === id).name.split(" · ")[0])}</button>`).join("")}</div></div><div class="plan-filter-row"><span>月度预算</span><div><select id="plan-price" aria-label="月度预算">${[
        ["全部", "全部价格"],
        ["under", "$30 及以下"],
        ["over", "$30 以上"],
      ]
        .map(
          ([v, t]) =>
            `<option value="${v}" ${planFilters.price === v ? "selected" : ""}>${t}</option>`,
        )
        .join(
          "",
        )}</select><small>USD / 月</small></div></div></section><div class="atlas-results"><span>找到 <b>${list.length}</b> 个示例套餐</span><span>以下名称、价格与权益仅用于展示套餐对比，非当前在售报价。</span></div>${list.length ? `<div class="atlas-table-scroll plan-table-wrap"><table class="plan-table"><thead><tr><th>售卖厂商 / 类型</th><th>套餐</th><th>示例价格</th><th>支持模型</th><th>适用场景</th><th>操作</th></tr></thead><tbody>${list.map((p) => `<tr class="plan-row ${selectedPlans.includes(p.id) ? "is-selected" : ""}" data-plan-type="${p.type}"><td><div class="plan-seller"><span class="plan-seller-mark model-tone-${p.brand.toLowerCase()}">${brandIcon(p.brand)}</span><div><strong>${p.seller}</strong><span class="plan-type-badge">${icon(p.type === "Coding Plan" ? "calculator" : p.type === "Token Plan" ? "database" : "user")}${p.type}</span></div></div></td><td><div class="plan-name-line"><strong>${p.name}</strong></div><p class="plan-brief">${planEditorial[p.id].brief}</p></td><td><strong class="plan-price"><span class="plan-currency">$</span>${p.price}<small> / 月</small></strong><span class="plan-price-caption">${planEditorial[p.id].billing}</span></td><td><div class="atlas-tags">${planModelTags(p)}</div><span class="plan-model-count">${p.models.length} 类模型生态</span><div class="plan-billing-note">${planEditorial[p.id].access}</div></td><td class="plan-quota"><div class="plan-scenario">${icon(p.price >= 100 ? "bolt" : p.models.length > 1 ? "layers" : "book")}<span>${p.quota}</span></div><div class="plan-use-tags">${planEditorial[p.id].uses.map((t) => `<span>${t}</span>`).join("")}</div></td><td><div class="plan-actions">${button("查看详情", "plan-detail", p.id, "plan-detail-btn")}${button(selectedPlans.includes(p.id) ? "已选对比" : "加入对比", "plan-pick", p.id, selectedPlans.includes(p.id) ? "plan-pick active" : "plan-pick")}</div></td></tr>`).join("")}</tbody></table></div>` : empty("没有符合条件的套餐", "调整筛选条件，查看其他选择。", "#/coding-plans", "返回套餐对比")}</section>`,
    );
  }

  const relayQuoteRows = sites
    .flatMap((site) =>
      (site.publicModelTable?.rows || []).map((row) => ({
        site,
        brand: row.brand,
        model: String(row.cells[0] || "").trim(),
        group: String(row.cells[1] || "公开"),
        rate: String(row.cells[2] || "—"),
        price: String(row.cells[3] || "—"),
        cache: String(row.cells[4] || "—"),
      })),
    )
    .filter((r) => r.model);

  const relayModelOptions = [...new Set(relayQuoteRows.map((r) => r.model))]
    .map((id) => {
      const rows = relayQuoteRows.filter((r) => r.model === id);
      return {
        id,
        brand: rows.find((r) => brandFiles[r.brand])?.brand || "",
        sites: new Set(rows.map((r) => r.site.id)).size,
      };
    })
    .sort((a, b) => b.sites - a.sites || a.id.localeCompare(b.id));

  const quoteView = { model: "", query: "", priced: false, sort: "source" };

  function relayPriceKnown(r) {
    return /[¥￥$]\s*\d/.test(r.price);
  }

  function initialQuoteModel() {
    if (window.view.quote?.model) return window.view.quote.model;
    const id = params().get("model");
    if (relayModelOptions.some((m) => m.id === id)) return id;
    const brand = models.find((m) => m.id === id)?.brand;
    if (brand)
      return (
        relayModelOptions.find((m) => m.brand === brand)?.id ||
        relayModelOptions[0]?.id ||
        ""
      );
    return quoteView.model || relayModelOptions[0]?.id || "";
  }

  function snapshotPrices() {
    quoteView.model = initialQuoteModel();
    const m = relayModelOptions.find((m) => m.id === quoteView.model);
    return page(
      `<section class="cost-page relay-prices"><header class="cost-heading"><div><span class="cost-eyebrow">RELAY PRICE COMPARISON</span><h1>价格对比<span>同一个模型，比较不同渠道</span></h1><p>按具体型号查看中转站分组、输入 / 输出报价和缓存价格。</p></div><div class="cost-heading-art" aria-hidden="true">${["GPT", "Claude", "Gemini", "DeepSeek"].map((b) => brandIcon(b)).join("")}<span>${icon("compare")}</span></div></header><form id="price-form" class="relay-quote-controls"><label class="relay-model-field"><span>${icon("layers")} 具体模型型号</span><div class="cost-model-select"><span id="cost-model-mark">${m ? brandIcon(m.brand) : ""}</span><select name="model" id="cost-model" aria-label="选择具体模型">${relayModelOptions.map((m) => `<option value="${esc(m.id)}" ${m.id === quoteView.model ? "selected" : ""}>${esc(m.id)} · ${m.sites} 家</option>`).join("")}</select></div></label><label class="relay-search-field"><span>${icon("search")} 服务商 / 分组</span><input name="q" aria-label="搜索服务商或分组" placeholder="搜索站点名称、域名或分组" value="${esc(quoteView.query)}"></label><label class="relay-only-priced"><input type="checkbox" name="priced" ${quoteView.priced ? "checked" : ""}> 只看有报价</label><label class="relay-order"><span>排列方式</span><select name="order" aria-label="报价排列方式"><option value="source" ${quoteView.sort === "source" ? "selected" : ""}>来源顺序</option><option value="priced" ${quoteView.sort === "priced" ? "selected" : ""}>有报价优先</option></select></label></form><div class="cost-disclosure">${icon("info")}<span><strong>服务商公开报价快照</strong> · ${esc(sourceMeta.capturedAt || "2026-11-12")} 收录；价格保留来源值。计价单位与计费规则待核对，不推算调用总价。</span><span class="cost-unit">来源快照</span></div><div id="price-result" aria-live="polite"></div></section>`,
    );
  }

  function prices() {
    const d = window.KUGNI_PRICE_DEMO;
    if (d.state.mode === "snapshot")
      return snapshotPrices().replace(
        '<section class="cost-page relay-prices">',
        '<section class="cost-page relay-prices">' + d.tabs(),
      );
    return page(d.page({ icon, brandIcon }));
  }

  function workspaceContext() {
    return {
      sites,
      state,
      history: checkHistory,
      source: sourceMeta,
      brands: brandOptions,
      esc,
      icon,
      brandIcon,
      logo,
      saveBtn,
      compareBtn,
      paymentIcons,
      publicRates,
      fmtLatency,
      dilutionLabel,
      descriptionMarkup,
      button,
      toast,
    };
  }

  function checkHistoryPage() {
    return page(
      window.KUGNI_WORKSPACE.history(workspaceContext()) +
        window.KUGNI_TOOL_REPORTS.historyPanel(),
    );
  }

  function check() {
    return page(window.KUGNI_WORKSPACE.check(workspaceContext(), params()));
  }

  function benefits() {
    return page(window.KUGNI_BENEFITS.page(workspaceContext()));
  }

  function compare() {
    return page(window.KUGNI_WORKSPACE.compare(workspaceContext()));
  }

  function saved() {
    return page(window.KUGNI_WORKSPACE.saved(workspaceContext()));
  }

  const field = (
    title,
    name,
    placeholder = "",
    type = "text",
    required = true,
  ) =>
    `<label class="field"><span>${title}${required ? ' <b class="required">*</b>' : ""}</span><input type="${type}" name="${name}" placeholder="${placeholder}" ${required ? "required" : ""} maxlength="200"></label>`;

  function submitPage() {
    return window.KUGNI_SUBMISSION.page(accountContext());
  }

  function account() {
    return window.KUGNI_ACCOUNT.routes(accountContext()).account();
  }

  function params() {
    return new URLSearchParams(window.KUGNI_ROUTER.hash.split("?")[1] || "");
  }

  let routeKey = "";

  let detailScrollFrame = 0;
  function snapshotResults() {
    const m = relayModelOptions.find((m) => m.id === quoteView.model);
    const all = relayQuoteRows.filter((r) => r.model === quoteView.model);
    const q = quoteView.query.toLowerCase().trim();
    const rows = all
      .filter(
        (r) =>
          (!quoteView.priced || relayPriceKnown(r)) &&
          `${r.site.name} ${r.site.domain} ${r.group}`
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) =>
        quoteView.sort === "priced"
          ? Number(relayPriceKnown(b)) - Number(relayPriceKnown(a))
          : 0,
      );
    const quoted = all.filter(relayPriceKnown);
    const siteCount = new Set(all.map((r) => r.site.id)).size;
    return `<div class="relay-quote-overview"><div class="relay-current-model">${m ? brandIcon(m.brand) : icon("layers")}<div><span>正在比较</span><h2>${esc(quoteView.model)}</h2></div></div><div class="relay-quote-stats"><span><b>${siteCount}</b> 家服务商</span><span><b>${all.length}</b> 条分组记录</span><span class="has-price"><b>${quoted.length}</b> 条公开报价</span></div></div><div class="relay-results-count">当前显示 ${rows.length} 条记录<span>不同分组的接入限制、额度与计费规则可能不同</span></div>${rows.length ? `<div class="relay-quote-scroll"><table class="relay-quote-table"><thead><tr><th>服务商</th><th>渠道 / 分组</th><th><span class="quote-input-dot"></span> 输入 / 输出报价</th><th>缓存报价</th><th>来源倍率</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><a class="cost-provider-name" href="#/site/${r.site.id}">${logo(r.site)}<span><strong>${esc(r.site.name)}</strong><small>${esc(r.site.domain)}</small></span></a></td><td><span class="relay-group-name">${esc(r.group)}</span></td><td>${relayPriceKnown(r) ? `<strong class="relay-quote-price">${esc(r.price)}</strong><small class="relay-unit-note">来源价格 · 单位待核对</small>` : '<span class="relay-missing-price">暂无公开价格</span>'}</td><td><span class="relay-cache-price">${r.cache === "—" ? "未公开" : esc(r.cache)}</span></td><td><span class="relay-source-rate">${r.rate === "—" ? "未公开" : esc(r.rate)}</span></td><td><a href="#/site/${r.site.id}" class="cost-provider-link">查看站点 ${icon("arrow")}</a></td></tr>`).join("")}</tbody></table></div>` : `<div class="relay-empty">${icon("search")}<h3>没有匹配的报价记录</h3><p>调整搜索词或取消“只看有报价”。</p></div>`}<p class="cost-provider-note">${icon("shield")} 按模型 ID 精确匹配；型号后缀不同的记录分别展示。来源倍率不再乘以示例单价，缺少报价不按 0 元处理。渠道名称为来源原文，不代表本站验证或背书。</p>`;
  }
  Object.assign(quoteView, window.view.quote || {});
  Object.assign(modelFilters, window.view.modelFilters || {});
  Object.assign(planFilters, window.view.planFilters || {});
  modelOrder = window.view.modelOrder || "default";
  state.brand = window.view.brand || "全部";
  selectedPlans = window.view.selectedPlans || [];
  for (const p of planExamples)
    planEditorial[p.id] ||= {
      brief: p.description || "查看服务商发布的套餐资料",
      billing: p.billing || "以服务商说明为准",
      access: p.access || "详见服务商文档",
      uses: [],
      note: "以实际发布信息为准",
    };
  return {
    header,
    footer,
    tray,
    home,
    detail,
    modelsPage,
    modelDetail,
    modelProviders,
    codingPlans,
    snapshotPrices,
    snapshotResults,
    sourceModelTable,
    check,
    checkHistoryPage,
    benefits,
    compare,
    saved,
    submitPage,
    account,
    accountContext,
    workspaceContext,
    page,
    icon,
    brandIcon,
    empty,
    params,
    esc,
  };
}
