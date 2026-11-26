// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const data = window.KUGNI_DEMO_QUOTES;

  const state = {
    mode: "demo",
    method: "budget",
    scenario: "daily",
    budget: 100,
    model: window.view.pricing?.model || data.models[0].id,
    input: 10000,
    output: 2000,
    calls: 10000,
    hit: 0,
    base: "aurora",
  };
  Object.assign(state, window.view.pricing || {});

  const drafts = {
    budget: "100",
    input: "10000",
    output: "2000",
    calls: "10000",
    hit: "0",
    model: state.model,
  };
  Object.assign(drafts, window.view.pricing || {});

  let helpers;

  const lastResults = { budget: "", usage: "" };

  const money = (n) =>
    "¥" +
    n.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const unitPrice = (n) =>
    "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 6 });

  const number = (n) => n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  const esc = (s) =>
    String(s).replace(
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

  const marker = (c) =>
    `<span class="demo-mark" style="--channel:${c.color}">${c.mark}</span>`;

  function tokens(n) {
    return n >= 1e8
      ? { value: number(n / 1e8), unit: "亿 tokens" }
      : n >= 1e4
        ? { value: number(n / 1e4), unit: "万 tokens" }
        : { value: number(n), unit: "tokens" };
  }

  const tokenText = (n) => {
    const t = tokens(n);
    return t.value + " " + t.unit;
  };

  function quote(channel, model, usage) {
    if (!channel.rates) return null;
    const rates = Object.fromEntries(
      Object.entries(channel.rates)
        .filter(([k]) => ["input", "output", "cache"].includes(k))
        .map(([k, v]) => [k, v == null ? null : v * model.factor]),
    );
    if (
      !Number.isFinite(rates.input) ||
      !Number.isFinite(rates.output) ||
      rates.input < 0 ||
      rates.output < 0
    )
      return null;
    const hit = channel.cacheSupported === false ? 0 : usage.hit / 100;
    if (hit > 0 && (!Number.isFinite(rates.cache) || rates.cache < 0))
      return null;
    const counts = {
      input: usage.input * (1 - hit) * usage.calls,
      output: usage.output * usage.calls,
      cache: usage.input * hit * usage.calls,
    };
    const parts = Object.fromEntries(
      Object.keys(counts).map((k) => [k, (counts[k] * (rates[k] ?? 0)) / 1e6]),
    );
    return {
      ...parts,
      total: parts.input + parts.output + parts.cache,
      rates,
      counts,
      totalTokens: (usage.input + usage.output) * usage.calls,
      cacheSupported: channel.cacheSupported !== false,
    };
  }

  function purchasingPower(channel, model, usage, budget) {
    const unit = quote(channel, model, { ...usage, calls: 1 });
    if (!unit || unit.total <= 0) return null;
    const scale = budget / unit.total;
    return {
      ...unit,
      total: budget,
      input: unit.input * scale,
      output: unit.output * scale,
      cache: unit.cache * scale,
      counts: Object.fromEntries(
        Object.entries(unit.counts).map(([k, n]) => [k, n * scale]),
      ),
      totalTokens: unit.totalTokens * scale,
    };
  }

  function tabs() {
    return `<div class="quote-mode-tabs"><button type="button" data-action="demo-mode" data-value="demo" aria-pressed="${state.mode === "demo"}">效果演示</button><button type="button" data-action="demo-mode" data-value="snapshot" aria-pressed="${state.mode === "snapshot"}">来源快照</button></div>`;
  }

  function inputField(key, title, unit, max, step = "1") {
    return `<label><span>${title}<small>${unit}</small></span><input name="${key}" aria-label="${title}" type="number" min="0" max="${max}" step="${step}" required inputmode="${step === "1" ? "numeric" : "decimal"}" value="${esc(drafts[key])}"></label>`;
  }

  function controls() {
    const { icon, brandIcon } = helpers,
      budget = state.method === "budget";
    return `<div class="demo-method-header"><div class="demo-method-switch" role="group" aria-label="比较方式">${[
      ["budget", "按预算比较", "wallet"],
      ["usage", "自定义用量", "sliders"],
    ]
      .map(
        ([id, label, i]) =>
          `<button type="button" data-action="demo-method" data-value="${id}" aria-pressed="${state.method === id}">${icon(i)}${label}</button>`,
      )
      .join(
        "",
      )}</div><span>${budget ? "填一个金额，比较各家的参考购买力" : "按自己的输入、输出与调用量估算"}</span></div>${
      budget
        ? `<div class="demo-scenarios"><strong>${icon("sliders")} 使用场景</strong><div>${Object.entries(
            data.scenarios,
          )
            .map(
              ([id, s]) =>
                `<button type="button" data-action="demo-scenario" data-value="${id}" aria-pressed="${state.scenario === id}">${s.label}</button>`,
            )
            .join("")}</div><span>自动带入输入 / 输出比例</span></div>`
        : ""
    }<div class="demo-fields ${budget ? "demo-budget-fields" : "demo-custom-fields"}"><label class="demo-model"><span>具体模型</span><div><span id="demo-model-icon">${brandIcon(data.models.find((m) => m.id === drafts.model).brand)}</span><select name="model" aria-label="具体模型">${data.models.map((m) => `<option value="${m.id}" ${m.id === drafts.model ? "selected" : ""}>${m.id}</option>`).join("")}</select></div></label>${budget ? inputField("budget", "使用预算", "元", 1000000, "0.01") : [inputField("input", "每次输入", "tokens", 10000000), inputField("output", "每次输出", "tokens", 10000000), inputField("calls", "每月调用", "次", 10000000)].join("")}${inputField("hit", "输入缓存命中率", "%", 100, "0.1")}</div><div class="demo-usage-caption" id="demo-usage-caption"></div><p id="demo-validation" role="status"></p>`;
  }

  function page(h) {
    helpers = h;
    const { icon } = h;
    return `<section class="price-demo cost-page">${tabs()}<header class="cost-heading"><div><span class="cost-eyebrow">COMPARE WHAT YOUR BUDGET CAN BUY</span><h1>价格对比<span id="demo-method-title">同样的预算，哪家更划算？</span></h1><p>先按预算看参考购买力，也可以填入自己的实际用量。</p></div><span class="demo-data-pill">${icon("layers")} 虚构数据演示</span></header><div class="demo-notice">${icon("info")}<span>以下服务商、渠道及价格全部虚构，仅用于预览对比效果。统一按人民币计算，不代表真实报价；预算结果按所选场景估算，不代表实际对话次数。</span></div><form id="price-form" class="demo-usage" novalidate>${controls()}</form><div id="price-result" aria-live="polite"></div></section>`;
  }

  function remember(form) {
    for (const key of Object.keys(drafts))
      if (form.elements[key]) drafts[key] = form.elements[key].value;
  }

  function summary(rows, budget) {
    const { icon } = helpers,
      best = rows[0],
      base = rows.find((r) => r.id === state.base),
      t = tokens(best.cost.totalTokens),
      delta = budget
        ? best.cost.totalTokens - base.cost.totalTokens
        : base.cost.total - best.cost.total,
      denominator = budget ? base.cost.totalTokens : base.cost.total,
      percent = denominator ? (delta / denominator) * 100 : 0;
    return `<section class="demo-conclusions"><article class="demo-cheapest"><span>${icon("wallet")} ${budget ? "本场景参考用量最多" : "本场景最低预计月费"}</span><strong>${budget ? t.value : money(best.cost.total)}<small> ${budget ? t.unit : "/ 月"}</small></strong><div>${marker(best)}<b>${best.name}</b><span>${best.group}</span></div></article><article><span>${icon("compare")} 相比所选基准</span><strong>${budget ? (delta > 0 ? "+" : "") + tokens(Math.max(0, delta)).value : money(delta)}<small> ${budget ? tokens(Math.max(0, delta)).unit : delta > 0 ? "可节省 / 月" : "差额 / 月"}</small></strong><p>${budget ? `同样 ${money(state.budget)}，参考用量多 ${number(percent)}%` : delta > 0 ? `比 ${base.name} 少 ${percent.toFixed(1)}%` : `${base.name} 已是本场景最低费用之一`}</p></article><article class="demo-baseline"><span>${icon("layers")} 比较基准</span><select id="demo-baseline" aria-label="比较基准">${rows
      .filter((r) => r.cost)
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === state.base ? "selected" : ""}>${r.name} · ${budget ? tokenText(r.cost.totalTokens) : money(r.cost.total) + " / 月"}</option>`,
      )
      .join(
        "",
      )}</select><p>${budget ? "比较相同预算、相同输入 / 输出比例" : "换成你正在用的渠道，直接看差价"}</p></article></section>`;
  }

  function details(row, budget) {
    const { icon } = helpers,
      cost = row.cost;
    return `<details class="demo-detail"><summary>${icon("receipt")} ${cost ? "查看单价与计算明细" : "查看缺失信息"} <span>⌄</span></summary><div class="demo-detail-content">${
      cost
        ? `<p>${budget ? `${money(state.budget)} 预算的参考费用分配；各家保持相同输入 / 输出比例。` : "以下为渠道最终演示单价，统一按上方自定义用量计算。"}${cost.cacheSupported ? "" : "此渠道不支持缓存优惠，全部输入按普通输入价计算。"}</p><div class="demo-detail-grid">${[
            ["input", "普通输入", "di"],
            ["output", "输出", "do"],
            ["cache", "缓存读取", "dc"],
          ]
            .map(
              ([k, title, tone]) =>
                `<div><span class="${tone}">${title}</span><strong>${Number.isFinite(cost.rates[k]) ? unitPrice(cost.rates[k]) + " / 百万 tokens" : "未提供缓存报价"}</strong><small>${tokenText(cost.counts[k])} × 对应单价</small><b>${money(cost[k])}${budget ? "" : " / 月"}</b></div>`,
            )
            .join("")}</div>`
        : "<p>缺少完整报价或当前场景所需的缓存价格，不按零费用计算，不参与排名。</p>"
    }</div></details>`;
  }

  function rowView(r, index, { best, base, max, budget }) {
    const cost = r.cost,
      delta = cost
        ? budget
          ? cost.totalTokens - base.cost.totalTokens
          : base.cost.total - cost.total
        : 0,
      denominator = budget ? base.cost.totalTokens : base.cost.total,
      optimal =
        cost &&
        Math.abs(
          (budget ? cost.totalTokens : cost.total) -
            (budget ? best.cost.totalTokens : best.cost.total),
        ) < 1e-8,
      quantity = cost && tokens(cost.totalTokens);
    return `<article class="demo-rank-row ${optimal ? "lowest" : ""}" data-channel="${r.id}"><div class="demo-row-main"><div class="demo-provider"><span class="demo-rank-number">${cost ? String(index + 1).padStart(2, "0") : "—"}</span>${marker(r)}<div><div class="demo-provider-title"><strong>${r.name}</strong>${optimal ? `<span class="demo-low-badge">${budget ? "参考用量最多" : "最低费用"}</span>` : ""}${r.id === state.base ? '<span class="demo-base-badge">基准</span>' : ""}</div><small>${r.group} · 虚构渠道${cost && !cost.cacheSupported ? " · 无缓存优惠" : ""}</small></div></div><div class="demo-monthly">${cost ? `<div class="demo-monthly-number"><strong>${budget ? quantity.value : money(cost.total)}</strong><small>${budget ? quantity.unit : "/ 月"}</small><span>${budget ? money(state.budget) + " 预算" : "每次 ¥" + (state.calls ? cost.total / state.calls : 0).toFixed(4)}</span></div>${budget ? `<p class="demo-capacity-split">输入 ${tokenText(cost.counts.input + cost.counts.cache)} · 输出 ${tokenText(cost.counts.output)}</p>` : ""}<div class="demo-bar" role="img" aria-label="${r.name}：${["input", "output", "cache"].map((k) => `${{ input: "普通输入", output: "输出", cache: "缓存输入" }[k]} ${budget ? tokenText(cost.counts[k]) : money(cost[k])}`).join("、")}">${["input", "output", "cache"].map((k, i) => `<span class="${["di", "do", "dc"][i]}" style="width:${max ? ((budget ? cost.counts[k] : cost[k]) / max) * 100 : 0}%"></span>`).join("")}</div>` : '<strong class="demo-unknown">暂无法计算</strong><p>缺少报价，不计入排名</p>'}</div><div class="demo-row-savings ${delta > 0 ? "positive" : ""}">${cost ? `<strong>${Math.abs(delta) < 1e-8 ? (budget ? "参考用量相同" : "费用相同") : budget ? (delta > 0 ? "多 " : "少 ") + tokenText(Math.abs(delta)) : (delta > 0 ? "省 " : "多花 ") + money(Math.abs(delta))}</strong><small>${denominator && Math.abs(delta) > 1e-8 ? number((Math.abs(delta) / denominator) * 100) + "% " + (budget ? (delta > 0 ? "更多" : "更少") : delta > 0 ? "更低" : "更高") : "相同场景口径"}</small>` : "<span>不参与比较</span>"}</div></div>${details(r, budget)}</article>`;
  }

  function ranking(rows, budget) {
    const { icon } = helpers,
      settings = {
        best: rows[0],
        base: rows.find((r) => r.id === state.base),
        max: Math.max(
          ...rows
            .filter((r) => r.cost)
            .map((r) => (budget ? r.cost.totalTokens : r.cost.total)),
        ),
        budget,
      },
      count = rows.filter((r) => r.cost).length;
    return `<div class="demo-ranking-head"><div><h2>${budget ? "同预算参考用量排名" : "同用量费用排名"} <small>${count} 家可计算 · ${rows.length - count} 家缺报价</small></h2><p>${budget ? "条形越长，参考用量越多。保持同一场景配比，不换算实际对话次数。" : "从低到高排列，条形越短费用越低。价格排名不代表质量排名。"}</p></div><div class="demo-legend"><span class="di">普通输入</span><span class="do">输出</span><span class="dc">缓存输入</span></div></div><div class="demo-rank-labels"><span>服务商 / 渠道</span><span>${budget ? "预算可购参考用量" : "预计月费 · 费用构成"}</span><span>与 ${settings.base.name} 比较</span></div><div class="demo-rank-list">${rows.map((r, i) => rowView(r, i, settings)).join("")}</div><p class="demo-footnote">${icon("info")} ${budget ? "参考总用量 = 预算 ÷ 场景单位费用 × 场景输入与输出总量。缓存是输入的一部分，不额外计入 Token 总量。" : "月费 = 调用次数 × [普通输入量 × 输入单价 + 缓存输入量 × 缓存读取单价 + 输出量 × 输出单价] ÷ 1,000,000。"} 未含税费、阶梯优惠、缓存写入与最低消费。</p>`;
  }

  function update() {
    const form = document.querySelector("#price-form");
    if (!form) return;
    remember(form);
    const error = document.querySelector("#demo-validation");
    document.querySelector("#demo-method-title").textContent =
      state.method === "budget"
        ? "同样的预算，哪家更划算？"
        : "同样的用量，哪家更省？";
    if (!form.checkValidity()) {
      document.querySelector("#price-result").innerHTML =
        lastResults[state.method];
      error.textContent =
        "请输入有效数值：预算及用量不可为负，缓存命中率为 0–100%。下方保留上次有效结果。";
      return;
    }
    error.textContent = "";
    state.model = drafts.model;
    state.hit = Number(drafts.hit);
    if (state.method === "budget") state.budget = Number(drafts.budget);
    else
      for (const k of ["input", "output", "calls"])
        state[k] = Number(drafts[k]);
    const { icon, brandIcon } = helpers,
      budget = state.method === "budget",
      usage = budget
        ? { ...data.scenarios[state.scenario], hit: state.hit }
        : {
            input: state.input,
            output: state.output,
            calls: state.calls,
            hit: state.hit,
          },
      model = data.models.find((m) => m.id === state.model);
    document.querySelector("#demo-model-icon").innerHTML = brandIcon(
      model.brand,
    );
    document.querySelector("#demo-usage-caption").innerHTML =
      `${icon(budget ? "info" : "calendar")} ${budget ? `参考配比：${number(usage.input)} 输入 : ${number(usage.output)} 输出 · ${state.hit}% 输入缓存命中` : `每月 ${number(state.calls)} 次 × 每次 ${number(state.input)} 输入 / ${number(state.output)} 输出 · ${state.hit}% 输入缓存命中`}`;
    document
      .querySelectorAll("[data-action=demo-scenario]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.value === state.scenario),
        ),
      );
    const rows = data.channels
      .map((c) => ({
        ...c,
        cost: budget
          ? purchasingPower(c, model, usage, state.budget)
          : quote(c, model, usage),
      }))
      .sort((a, b) =>
        a.cost && b.cost
          ? budget
            ? b.cost.totalTokens - a.cost.totalTokens
            : a.cost.total - b.cost.total
          : a.cost
            ? -1
            : b.cost
              ? 1
              : 0,
      );
    if (!rows.some((r) => r.cost)) {
      document.querySelector("#price-result").innerHTML =
        '<p class="demo-notice">当前条件下缺少可计算的完整报价，请调整条件或查看来源快照。</p>';
      return;
    }
    if (!rows.some((r) => r.id === state.base && r.cost))
      state.base = rows[0].id;
    lastResults[state.method] = summary(rows, budget) + ranking(rows, budget);
    document.querySelector("#price-result").innerHTML =
      lastResults[state.method];
  }
  window.KUGNI_PRICE_DEMO = {
    page,
    controls,
    quote,
    purchasingPower,
    summary,
    ranking,
    state,
  };
  return window.KUGNI_PRICE_DEMO;
}
