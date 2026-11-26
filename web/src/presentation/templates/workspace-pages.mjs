import { modelBrand, renderModelField } from "../model-catalog.mjs";
// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const ui = {
    historyQuery: "",
    historyFilter: "all",
    historyOrder: "newest",
    savedQuery: "",
    savedBrand: "all",
    savedOrder: "recent",
    differences: false,
  };
  Object.assign(ui, window.view.workspace || {});

  const svg = (path) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

  const glyph = {
    history: svg('<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>'),
    upload: svg('<path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/>'),
    chevron: svg('<path d="m9 5 7 7-7 7"/>'),
    eye: svg(
      '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    ),
    alert: svg('<path d="m12 3 10 18H2ZM12 9v5m0 3h.01"/>'),
    trash: svg('<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'),
    plus: svg('<path d="M12 4v16M4 12h16"/>'),
  };

  const count = (n) => Number(n).toLocaleString("zh-CN");

  const tools = (c, name) => glyph[name] || c.icon(name);

  const action = (c, text, name, value = "", cls = "wk-button") =>
    c.button(text, name, value, cls);

  const removeButton = (c, s) =>
    `<button type="button" class="wk-remove" data-action="compare" data-value="${s.id}" aria-label="移除 ${c.esc(s.name)}">${c.icon("close")}</button>`;

  const wrap = (kind, body) =>
    `<section class="wk-page wk-${kind}">${body}</section>`;

  const head = (c, label, title, desc, actions = "") =>
    `<header class="wk-head"><div><div class="wk-eyebrow">${label}</div><h1>${title}</h1><p>${desc}</p></div><div class="wk-actions">${actions}</div></header>`;

  const note = (c, text) =>
    `<div class="wk-note">${c.icon("shield")}<p>${text}</p></div>`;

  const empty = (c, title, desc, links) =>
    `<div class="wk-empty">${c.icon("search")}<h2>${title}</h2><p>${desc}</p><div class="wk-actions">${links}</div></div>`;

  const brandOf = (model) => modelBrand(model)?.key;

  function hostOf(endpoint) {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint;
    }
  }

  function check(c, p) {
    const endpoint = p.get("endpoint") || "https://api.example.com/v1",
      model = p.get("model") || window.modelChoices[0]?.id || "";
    const selected = c.sites.find((s) => s.id === p.get("site"));
    const recent = c.history[0];
    return wrap(
      "check",
      head(
        c,
        "CONNECTION LAB",
        "中转站检测",
        "从连接到响应，逐项查看接口的兼容表现。",
        `<a class="wk-button" href="#/check/history">${glyph.history} 检测历史${c.history.length ? ` <span>${c.history.length}</span>` : ""}</a><a class="wk-button wk-quiet" href="#/check/result/demo">查看报告示例 ${c.icon("arrow")}</a>`,
      ) +
        `<div class="wk-demo-note">${c.icon("info")}<span><strong>本地演示</strong> · 不发送 API 请求，不验证真实接口；请使用示例密钥体验流程。</span></div>
 <div class="wk-lab-grid"><form id="check-form" class="wk-check-form" autocomplete="off"><div class="wk-section-title"><h2>${c.icon("sliders")} 配置检测</h2><span>OpenAI 兼容协议</span></div>
 ${selected ? `<p class="wk-selected-site">${c.logo(selected)} 正在查看 ${c.esc(selected.name)}，请自行核对实际接口地址。</p>` : ""}
 <label class="wk-field"><span>API 接口地址 <em>必填</em></span><input type="url" name="endpoint" value="${c.esc(endpoint)}" placeholder="https://api.example.com/v1" required maxlength="2048"><small>填写 Base URL，通常以 /v1 结尾。</small></label>
 <label class="wk-field"><span>示例 API Key <em>必填</em><button class="wk-inline" type="button" data-action="demo-key">填入示例密钥</button></span><span class="wk-key-input">${c.icon("key")}<input name="key" id="api-key" type="password" placeholder="sk-demo-kugni" autocomplete="off" required maxlength="512"><button type="button" data-action="show-key" aria-label="显示密钥">显示</button></span><small>仅在提交瞬间读取，提交后立即清空，不保存密钥。</small></label>
 <label class="wk-field"><span>检测模型 <em>必填</em></span>${renderModelField(window.modelChoices, { id: "check-model", value: model, label: "检测模型" })}<small>可选择常用名称，也可直接输入具体模型 ID。</small></label>
 <label class="wk-scenario"><input type="checkbox" name="scenario"><span><strong>模拟连接失败</strong><small>查看 失败 鉴权异常的报告样式</small></span></label>
 <label class="wk-field"><span>检测项目</span><select name="testType"><option value="基础可用性">基础可用性</option><option value="延迟与成功率">延迟与成功率</option><option value="流式性能">流式性能 · 首字响应与输出速度</option></select></label><div class="wk-run"><span>${c.icon("shield")} 不保存密钥</span><button class="wk-button wk-primary" type="submit">开始模拟检测 ${c.icon("arrow")}</button></div><div id="check-output" aria-live="polite" role="status"></div></form>
 <aside class="wk-lab-aside"><div class="wk-section-title"><h2>这次会检查什么</h2><span>12 项</span></div>
 ${[
   ["globe", "连接与协议", "协议识别、响应结构、模型回显", "01 — 03"],
   ["activity", "响应与一致性", "模型一致性、流式响应、输出控制", "04 — 06"],
   ["brain", "上下文与指令", "上下文记忆、系统指令、工具调用", "07 — 09"],
   ["database", "格式与错误处理", "JSON 格式、用量统计、错误处理", "10 — 12"],
 ]
   .map(
     ([i, t, d, n]) =>
       `<div class="wk-check-group">${c.icon(i)}<div><small>${n}</small><h3>${t}</h3><p>${d}</p></div></div>`,
   )
   .join("")}
 <div class="wk-preview-link"><div><strong>先看看检测报告</strong><p>评分、异常原因和响应证据集中展示。</p></div><a href="#/check/result/demo" aria-label="打开检测报告示例">${c.icon("arrow")}</a></div>
 ${recent ? `<a class="wk-recent-report" href="#/check/result/${c.esc(recent.id)}">${glyph.history}<span>最近一次 · ${c.esc(hostOf(recent.endpoint))}<small>${recent.failed ? "连接失败" : recent.score + " 分 · 1 项未通过"}</small></span>${glyph.chevron}</a>` : ""}</aside></div>
 <div class="wk-process"><span><b>01</b> 填写接口信息</span>${c.icon("arrow")}<span><b>02</b> 运行本地模拟</span>${c.icon("arrow")}<span><b>03</b> 查看独立报告</span></div>`,
    );
  }

  function historyList(c) {
    let records = c.history.filter(
      (r) =>
        (ui.historyFilter === "all" ||
          (ui.historyFilter === "issues" && !r.failed) ||
          (ui.historyFilter === "failed" && r.failed)) &&
        `${r.endpoint} ${r.model} ${r.time}`
          .toLowerCase()
          .includes(ui.historyQuery.toLowerCase().trim()),
    );
    if (ui.historyOrder === "oldest") records = records.slice().reverse();
    return (
      `<div class="wk-result-count" aria-live="polite">显示 <strong>${records.length}</strong> 条记录 <span>账户记录 · 最近 100 次</span></div>` +
      (records.length
        ? `<div class="wk-history-list">${records.map((r) => `<article class="wk-history-row"><div class="wk-history-identity"><span class="wk-history-symbol ${r.failed ? "is-failed" : ""}">${r.failed ? glyph.alert : c.icon("shield")}</span><div><a class="wk-record-title" href="/tools/history/?execution=${c.esc(r.id)}">${c.esc(hostOf(r.endpoint))}</a><span class="wk-record-path" title="${c.esc(r.endpoint)}">${c.esc(r.endpoint)}</span><span class="wk-record-meta">${c.brandIcon(brandOf(r.model))}${c.esc(r.model)}<time>${c.esc(r.time)} UTC+8</time></span></div></div><div class="wk-history-outcome ${r.failed ? "is-failed" : ""}"><strong>${r.failed ? "失败" : (r.score == null ? "—" : r.score) + "<small> / 100</small>"}</strong><span>${r.failed ? "连接失败 · 未评分" : "本次执行记录"}</span></div><div class="wk-history-timing"><span>首响 <strong>${c.esc(r.first)}</strong></span><span>${r.failed ? "未运行能力检查" : "详情以实际报告为准"}</span></div><div class="wk-record-actions"><a class="wk-link" href="/tools/history/?execution=${c.esc(r.id)}">查看报告 ${c.icon("arrow")}</a><a href="#/check?endpoint=${encodeURIComponent(r.endpoint)}&model=${encodeURIComponent(r.model)}">重新检测</a></div></article>`).join("")}</div>`
        : empty(
            c,
            ui.historyQuery || ui.historyFilter !== "all"
              ? "没有匹配的检测记录"
              : "还没有检测记录",
            ui.historyQuery || ui.historyFilter !== "all"
              ? "换个关键词，或清除筛选再试一次。"
              : "运行一次模拟检测，报告就会显示在这里。",
            ui.historyQuery || ui.historyFilter !== "all"
              ? '<button class="wk-button" data-work-action="history-reset">清除筛选</button>'
              : '<a class="wk-button wk-primary" href="#/check">开始检测</a><a class="wk-button" href="#/check/result/demo">查看示例报告</a>',
          ))
    );
  }

  function history(c) {
    const complete = c.history.filter((r) => !r.failed).length,
      failed = c.history.filter((r) => r.failed).length;
    return wrap(
      "history",
      head(
        c,
        "CONNECTION HISTORY",
        "检测历史",
        "把每次连接的表现和异常，放在一起回看。",
        `${c.history.length ? action(c, glyph.upload + " 导出记录", "work-export-history") : ""}<a class="wk-button wk-primary" href="#/check">${glyph.plus} 新建检测</a>`,
      ) +
        `<div class="wk-history-summary"><div>${glyph.history}<span>账户记录 <strong>${c.history.length}</strong></span></div><div>${c.icon("check")}<span>完成检查 <strong>${complete}</strong></span></div><div class="wk-amber">${glyph.alert}<span>连接失败 <strong>${failed}</strong></span></div></div>
 <div class="wk-toolbar"><div class="wk-tabs" aria-label="按检测结果筛选">${[
   ["all", "全部记录", c.history.length],
   ["issues", "有未通过项", complete],
   ["failed", "连接失败", failed],
 ]
   .map(
     ([v, t, n]) =>
       `<button type="button" data-history-filter="${v}" aria-pressed="${ui.historyFilter === v}">${t}<span>${n}</span></button>`,
   )
   .join(
     "",
   )}</div><div class="wk-filter-tools"><label class="wk-search">${c.icon("search")}<input id="wk-history-search" aria-label="搜索检测记录" placeholder="搜索接口、模型" value="${c.esc(ui.historyQuery)}"></label><select id="wk-history-order" aria-label="检测记录排序"><option value="newest" ${ui.historyOrder === "newest" ? "selected" : ""}>最近检测</option><option value="oldest" ${ui.historyOrder === "oldest" ? "selected" : ""}>最早检测</option></select></div></div>
 <div id="wk-history-results">${historyList(c)}</div>` +
        note(c, "执行记录保存在账户中；失败或未评分的项目不按零分处理。"),
    );
  }

  function savedCard(c, s) {
    return `<article class="wk-saved-card"><div class="wk-card-top">${c.logo(s)}<div><h2><a href="#/site/${s.id}">${c.esc(s.name)}</a></h2><span>${c.esc(s.domain)}</span></div>${c.saveBtn(s)}</div><p class="wk-card-desc">${c.descriptionMarkup(s.desc)}</p><div class="wk-card-brands">${s.models
      .slice(0, 6)
      .map((m) => c.brandIcon(m))
      .join(
        "",
      )}<span>${s.modelCount} 个来源模型</span></div><dl class="wk-card-facts"><div><dt>来源可用率</dt><dd class="wk-green">${Number.isFinite(s.uptime) ? s.uptime.toFixed(2) + "<small>%</small>" : "—"}</dd></div><div><dt>来源平均延迟</dt><dd>${c.fmtLatency(s)}</dd></div><div><dt>最低充值</dt><dd>${c.esc(s.minRecharge || "未公开")}</dd></div></dl><div class="wk-card-bottom">${c.compareBtn(s)}<a class="wk-link" href="#/site/${s.id}">查看站点 ${c.icon("arrow")}</a></div></article>`;
  }

  function savedList(c) {
    let list = c.state.saved
      .slice()
      .reverse()
      .map((id) => c.sites.find((s) => s.id === id))
      .filter(Boolean)
      .filter(
        (s) =>
          (ui.savedBrand === "all" || s.models.includes(ui.savedBrand)) &&
          `${s.name} ${s.domain} ${s.desc}`
            .toLowerCase()
            .includes(ui.savedQuery.toLowerCase().trim()),
      );
    if (ui.savedOrder === "latency")
      list.sort((a, b) => (a.latency ?? Infinity) - (b.latency ?? Infinity));
    if (ui.savedOrder === "coverage")
      list.sort((a, b) => b.modelCount - a.modelCount);
    return (
      `<div class="wk-result-count" aria-live="polite">${c.state.saved.length ? "匹配" : "已收藏"} <strong>${list.length}</strong> 家服务商</div>` +
      (list.length
        ? `<div class="wk-saved-grid">${list.map((s) => savedCard(c, s)).join("")}</div>`
        : empty(
            c,
            c.state.saved.length
              ? "没有匹配的收藏"
              : "把值得关注的服务商留下来",
            c.state.saved.length
              ? "试试其他关键词或模型生态。"
              : "点击站点旁的星标收藏，下次就能快速找到。",
            c.state.saved.length
              ? '<button class="wk-button" data-work-action="saved-reset">重置筛选</button>'
              : '<a class="wk-button wk-primary" href="#/sites">浏览服务商 ' +
                  c.icon("arrow") +
                  "</a>",
          )) +
      (!c.state.saved.length
        ? `<section class="wk-saved-discover"><div class="wk-section-title"><h2>从这些服务商开始了解</h2><span>按来源收录顺序</span></div><div class="wk-discover-grid">${c.sites
            .slice(0, 3)
            .map(
              (s) =>
                `<article>${c.logo(s)}<a href="#/site/${s.id}"><strong>${c.esc(s.name)}</strong><small>${s.modelCount} 个来源模型</small></a>${c.saveBtn(s)}</article>`,
            )
            .join("")}</div></section>`
        : "")
    );
  }

  function saved(c) {
    return wrap(
      "saved",
      head(
        c,
        "YOUR COLLECTION",
        '我的收藏 <span class="wk-heading-count">' +
          c.state.saved.length +
          "</span>",
        "留住感兴趣的服务商，随时回来继续比较。",
        `${c.state.saved.length ? action(c, "清空收藏", "clear-saved", "", "wk-button wk-quiet") : ""}<a class="wk-button" href="#/compare">${c.icon("compare")} 站点对比${c.state.compare.length ? " · " + c.state.compare.length : ""}</a><a class="wk-button wk-primary" href="#/sites">发现更多 ${c.icon("arrow")}</a>`,
      ) +
        `<div class="wk-toolbar wk-saved-tools"><label class="wk-search">${c.icon("search")}<input id="wk-saved-search" aria-label="搜索收藏站点" placeholder="搜索名称、域名或简介" value="${c.esc(ui.savedQuery)}"></label><div class="wk-filter-tools"><label><span>模型生态</span><select id="wk-saved-brand"><option value="all">全部模型</option>${c.brands.map((b) => `<option value="${b}" ${ui.savedBrand === b ? "selected" : ""}>${b === "GPT" ? "OpenAI" : b}</option>`).join("")}</select></label><select id="wk-saved-order" aria-label="收藏排序">${[
          ["recent", "最近收藏"],
          ["latency", "来源延迟优先"],
          ["coverage", "模型数量优先"],
        ]
          .map(
            ([v, t]) =>
              `<option value="${v}" ${ui.savedOrder === v ? "selected" : ""}>${t}</option>`,
          )
          .join(
            "",
          )}</select></div></div><div id="wk-saved-results">${savedList(c)}</div>` +
        note(
          c,
          `收藏保存在当前浏览器。可用率、延迟与模型数量为 ${c.esc(c.source.capturedAt)} 来源快照，不是实时检测。`,
        ),
    );
  }

  function comparisonRows(c) {
    const plain = (v) =>
      !v
        ? "未公开"
        : String(v)
            .replace(/^[—–-]\s*/, "")
            .trim() || "未公开";
    return [
      {
        title: "连接与表现",
        rows: [
          {
            label: "来源可用率",
            key: (s) => s.uptime,
            view: (s) =>
              Number.isFinite(s.uptime)
                ? `<strong class="wk-green">${s.uptime.toFixed(2)}<small>%</small></strong>`
                : "未收录",
          },
          {
            label: "来源平均延迟",
            key: (s) => s.latency,
            view: (s) => c.fmtLatency(s),
          },
          {
            label: "中转 / 降智检测",
            key: () => null,
            view: () => '<span class="wk-dim">待检测 / 待检测</span>',
          },
          {
            label: "掺水率",
            key: (s) => c.dilutionLabel(s),
            view: (s) => c.dilutionLabel(s),
          },
        ],
      },
      {
        title: "模型与计费",
        rows: [
          {
            label: "来源模型数量",
            key: (s) => s.modelCount,
            view: (s) =>
              `<strong>${count(s.modelCount)}</strong> <span class="wk-dim">个</span>`,
          },
          {
            label: "模型生态",
            key: (s) => s.models.slice().sort().join("|"),
            view: (s) =>
              `<div class="wk-compare-brands">${s.models.map((b) => `<span>${c.brandIcon(b)} ${c.esc(b)}</span>`).join("")}</div>`,
          },
          {
            label: "公开分组最低倍率",
            help: "不同分组范围不可直接等同于调用总价；0 倍率也不代表免费。",
            key: (s) => c.publicRates(s).min,
            view: (s) =>
              c.publicRates(s).min == null
                ? '<span class="wk-dim">暂无公开倍率</span>'
                : `<strong>${c.publicRates(s).min}×</strong><small class="wk-cell-note">公开分组最低值</small>`,
          },
          {
            label: "最低充值",
            key: (s) => plain(s.minRecharge),
            view: (s) => c.esc(plain(s.minRecharge)),
          },
          {
            label: "支付方式",
            key: (s) =>
              s.payments
                .map((p) => p.key)
                .sort()
                .join("|"),
            view: (s) =>
              s.payments.length
                ? `<div class="wk-compare-payments">${s.payments.map((p) => `<span><img src="${c.esc(p.icon)}" alt="" width="17" height="17">${c.esc(p.name)}</span>`).join("")}</div>`
                : '<span class="wk-dim">未公开</span>',
          },
        ],
      },
      {
        title: "服务与保障",
        rows: [
          { label: "站点类型", key: (s) => s.kind, view: (s) => c.esc(s.kind) },
          {
            label: "发票",
            key: (s) => plain(s.invoice),
            view: (s) => c.esc(plain(s.invoice)),
          },
          {
            label: "退款政策",
            key: (s) => plain(s.refund),
            view: (s) => c.esc(plain(s.refund)),
          },
          {
            label: "来源收录时间",
            key: (s) => s.listedAt,
            view: (s) => c.esc(s.listedAt || "未收录"),
          },
        ],
      },
    ];
  }

  function compare(c) {
    const selected = c.state.compare
      .map((id) => c.sites.find((s) => s.id === id))
      .filter(Boolean);
    const heading = head(
      c,
      "SIDE BY SIDE",
      '站点对比 <span class="wk-heading-count">' +
        selected.length +
        " / 4</span>",
      "并排看清模型、计费与服务差异，再选适合自己的。",
      `${selected.length ? action(c, "清空对比", "clear-compare", "", "wk-button wk-quiet") : ""}${action(c, glyph.plus + " 添加站点", "work-choose-sites", "", "wk-button wk-primary")}`,
    );
    if (!selected.length)
      return wrap(
        "compare",
        heading +
          empty(
            c,
            "先选几个服务商，放在一起看看",
            "最多选择 4 家，也可以先从收藏中挑选。",
            action(
              c,
              glyph.plus + " 选择服务商",
              "work-choose-sites",
              "",
              "wk-button wk-primary",
            ) + '<a class="wk-button" href="#/saved">从收藏中挑选</a>',
          ) +
          `<div class="wk-compare-explain">${[
            ["layers", "模型与计费", "具体模型、公开分组倍率、起充金额"],
            ["activity", "连接与表现", "来源可用率与延迟、待检测状态"],
            ["receipt", "服务与保障", "支付方式、发票、退款与收录时间"],
          ]
            .map(
              ([i, t, d]) =>
                `<div>${c.icon(i)}<strong>${t}</strong><p>${d}</p></div>`,
            )
            .join("")}</div>`,
      );
    const groups = comparisonRows(c).map((g) => ({
      ...g,
      rows: g.rows.map((r) => ({
        ...r,
        equal:
          selected.length > 1 &&
          selected.every((s) => Object.is(r.key(s), r.key(selected[0]))),
      })),
    }));
    const bestLatency = Math.min(
      ...selected.map((s) => s.latency).filter(Number.isFinite),
    );
    const distinctLatency =
      new Set(selected.map((s) => s.latency).filter(Number.isFinite)).size > 1;
    const table = `<div class="wk-matrix-scroll" tabindex="0" role="region" aria-label="站点参数对比，可横向滚动"><table class="wk-matrix" style="--wk-columns:${selected.length}"><thead><tr><th scope="col"><span>比较维度</span><small>${selected.length < 2 ? "再添加一家开始比较" : "同一次来源快照"}</small></th>${selected.map((s) => `<th scope="col"><div class="wk-matrix-identity">${c.logo(s)}${removeButton(c, s)}</div><a href="#/site/${s.id}">${c.esc(s.name)}</a><small>${c.esc(s.domain)}</small><a class="wk-link wk-matrix-detail" href="#/site/${s.id}">查看详情 ${c.icon("arrow")}</a></th>`).join("")}</tr></thead>${groups.map((g) => `<tbody><tr class="wk-matrix-group"><th colspan="${selected.length + 1}">${g.title}</th></tr>${g.rows.map((r) => `<tr data-equal="${r.equal}"><th scope="row">${r.label}${r.help ? `<small>${r.help}</small>` : ""}</th>${selected.map((s) => `<td>${r.view(s)}${r.label === "来源平均延迟" && distinctLatency && s.latency === bestLatency ? '<small class="wk-cell-note wk-green">所选中来源延迟较低</small>' : ""}</td>`).join("")}</tr>`).join("")}</tbody>`).join("")}</table></div>`;
    return wrap(
      "compare",
      heading +
        `<div class="wk-comparison-toolbar"><label><input type="checkbox" id="wk-differences" ${ui.differences && selected.length > 1 ? "checked" : ""} ${selected.length < 2 ? "disabled" : ""}> 只看不同项</label><span>横向比较 ${selected.length} 家服务商${selected.length < 4 ? ` · ${action(c, "继续添加", "work-choose-sites", "", "wk-inline")}` : ""}</span></div><p class="wk-mobile-hint">← 左右滑动查看其他服务商 →</p>${table}<p class="wk-only-equal" hidden>所选服务商的已收录参数相同，取消「只看不同项」可查看全部资料。</p>` +
        note(
          c,
          `公开资料快照 · ${c.esc(c.source.capturedAt)}，不构成实时监测或服务推荐。不同模型、分组与计费规则请在站点详情核对；缺失信息不按 0 处理。`,
        ),
    );
  }

  function picker(c, query = "") {
    return `<div class="wk-compare-picker"><p>最多选择 4 家服务商，已选 <strong>${c.state.compare.length} / 4</strong>。</p><label class="wk-search">${c.icon("search")}<input id="wk-picker-search" placeholder="搜索站点名称、域名" aria-label="搜索待对比站点" value="${c.esc(query)}"></label><div class="wk-picker-list">${c.sites.map((s) => `<button type="button" class="wk-picker-option" data-action="work-pick-compare" data-value="${s.id}" data-search="${c.esc((s.name + " " + s.domain).toLowerCase())}" aria-pressed="${c.state.compare.includes(s.id)}" ${!c.state.compare.includes(s.id) && c.state.compare.length >= 4 ? "disabled" : ""}>${c.logo(s)}<span><strong>${c.esc(s.name)}</strong><small>${c.esc(s.domain)} · ${s.modelCount} 个来源模型</small></span><i>${c.state.compare.includes(s.id) ? c.icon("check") : glyph.plus}</i></button>`).join("")}</div><p id="wk-picker-empty" hidden>没有匹配站点，试试其他关键词。</p><div class="wk-picker-foot"><span>模型与价格信息以服务商为准</span>${action(c, "完成选择", "close", "", "wk-button wk-primary")}</div></div>`;
  }

  function differences(root) {
    const checked = root.querySelector("#wk-differences")?.checked;
    root
      .querySelectorAll("[data-equal]")
      .forEach(
        (row) => (row.hidden = !!checked && row.dataset.equal === "true"),
      );
    let visible = 0;
    root.querySelectorAll(".wk-matrix tbody").forEach((body) => {
      const any = [...body.querySelectorAll("[data-equal]")].some(
        (r) => !r.hidden,
      );
      body.hidden = !any;
      if (any) visible++;
    });
    const notice = root.querySelector(".wk-only-equal");
    if (notice) notice.hidden = visible > 0;
  }
  window.KUGNI_WORKSPACE = {
    check,
    history,
    saved,
    compare,
    picker,
    historyList,
    savedList,
  };
  return window.KUGNI_WORKSPACE;
}
