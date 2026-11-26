const paths = {
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  layers:
    '<path d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  servers:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  input: '<path d="M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5"/>',
  output: '<path d="M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5"/>',
};
export const catalogIcon = (key) =>
  `<svg class="catalog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key] || paths.info}</svg>`;

function shell(record, ui, kind, brandMarkup, actions, stats) {
  const { text, esc, prose, link } = ui;
  return `<a class="catalog-back" href="${link(kind === "model" ? "/models/" : "/coding-plans/")}">${catalogIcon("back")}${text(kind === "model" ? "模型大全" : "模型套餐", kind === "model" ? "Model directory" : "Model plans")}</a><header class="catalog-detail-hero"><div class="catalog-detail-title"><div class="catalog-brand-orbit">${brandMarkup}</div><div><span class="catalog-eyebrow">${text(kind === "model" ? "模型档案" : "订阅与套餐", kind === "model" ? "MODEL PROFILE" : "PLANS & SUBSCRIPTIONS")}</span><h1>${esc(record.name)}</h1></div></div><p class="catalog-detail-description">${prose(record.summary)}</p><div class="catalog-detail-actions">${actions}</div>${stats ? `<div class="catalog-detail-stats">${stats}</div>` : ""}</header>`;
}

const sectionHeading = (icon, title, tone = "blue") =>
  `<h3 class="catalog-block-heading"><span class="catalog-symbol tone-${tone}">${catalogIcon(icon)}</span>${title}</h3>`;

export function modelProfile(r, ui, providers) {
  const {
    text,
    esc,
    prose,
    localized,
    brand,
    external,
    date,
    link,
    money,
    price,
    capabilities,
    modalities,
    size,
  } = ui;
  const m = r.model;
  const facts = [
    [
      text("发行商", "Publisher"),
      ui.en ? m.organization.nameEn : m.organization.nameZh,
    ],
    [text("上下文窗口", "Context window"), size(m.contextTokens)],
    [text("最大输入", "Max input"), size(m.maxInputTokens)],
    [text("最大输出", "Max output"), size(m.maxOutputTokens)],
    [text("模型类型", "Model type"), ui.modelType(m.modelType)],
    [text("发布日期", "Release date"), m.releaseDate || "—"],
    [text("知识截止", "Knowledge cutoff"), m.knowledgeCutoff || "—"],
    [text("许可证", "License"), m.license || "—"],
  ];
  const quote = (label, value, tone) =>
    `<div class="catalog-inline-quote ${tone}"><span>${catalogIcon(tone === "official" ? "globe" : "servers")}${label}</span><strong>${price(value)}</strong></div>`;
  const description =
    localized(m.description) || (ui.en ? localized(m.subtitle) : r.summary);
  return `<div class="catalog-model-compact"><header class="catalog-model-heading"><div class="catalog-model-title"><div class="catalog-brand-orbit">${brand(m.modelId, m.organization.nameEn, m.organization.logoUrl)}</div><h1>${esc(r.name)}</h1><span class="catalog-model-id"><code>${esc(m.modelId)}</code></span></div><a class="catalog-back" href="${link("/models/")}">${catalogIcon("back")}${text("模型大全", "Model directory")}</a></header><p class="catalog-model-summary">${prose(description)}</p><div class="catalog-model-highlights"><div class="catalog-tags">${capabilities(m)}</div><span>${text("上下文", "Context")} <b>${size(m.contextTokens)}</b></span><span>${text("最大输出", "Max output")} <b>${size(m.maxOutputTokens)}</b></span><span>${text("发布", "Released")} ${date(m.releaseDate)}</span></div><div class="catalog-model-pricebar">${quote(text("官方", "Official"), m.officialPricing, "official")}${quote(text("来源最低", "Source minimum"), m.bestRelay, "relay")}<span class="catalog-price-unit">${text("输入 / 输出 · ¥ / 百万 Token，其他计费以标注单位为准", "Input / output · CNY / 1M tokens; other billing uses the stated unit")}</span></div><div class="catalog-model-links">${external(m.organization.websiteUrl, text("发行商官网", "Publisher website"))}${external(r.sourceUrl, text("资料来源", "Source"))}</div><details class="catalog-model-more"><summary>${text("完整参数与说明", "Full specifications and details")}${catalogIcon("down")}</summary><div class="catalog-model-more-body"><div class="catalog-modality-grid"><div><span>${catalogIcon("input")}${text("输入", "Input")}</span><strong>${esc(modalities(m, "input"))}</strong></div><div><span>${catalogIcon("output")}${text("输出", "Output")}</span><strong>${esc(modalities(m, "output"))}</strong></div></div><p>${prose(description)}</p><dl class="catalog-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${m.officialPricing?.cacheInputCny != null ? `<p>${text("缓存读取", "Cache read")} ${money(m.officialPricing.cacheInputCny)} / 1M Token</p>` : ""}<p class="catalog-model-source-note">${m.bestRelay ? prose(m.bestRelay.siteName) + " · " : ""}${text("来源报价不代表本站实测结论", "Source quotes are not KUGNI test results")} · ${text("资料采集", "Collected")} ${date(r.collectedAt)}</p></div></details></div>${providers?.html || ""}`;
}

export function productProfile(r, ui) {
  const {
    text,
    esc,
    prose,
    brand,
    badge,
    external,
    date,
    link,
    money,
    number,
  } = ui;
  const p = r.product;
  const periods = {
    month: text("月付", "Monthly"),
    year: text("年付总价", "Annual total"),
    quarter: text("季付", "Quarterly"),
    week: text("周付", "Weekly"),
    first_month: text("首月优惠", "First month"),
    one_time: text("一次性", "One-time"),
  };
  const status = {
    on_sale: [text("在售", "On sale"), "teal"],
    limited: [text("限量", "Limited"), "orange"],
    sold_out: [text("售罄", "Sold out"), "muted"],
    discontinued: [text("停售", "Discontinued"), "muted"],
    coming_soon: [text("即将开售", "Coming soon"), "blue"],
  };
  const priceKinds = {
    free: text("免费", "Free"),
    contact: text("联系销售", "Contact sales"),
    unknown: text("未公开", "Not published"),
  };
  const windows = {
    rolling_5h: text("每 5 小时", "Every 5 hours"),
    week: text("每周", "Weekly"),
    month: text("每月", "Monthly"),
    day: text("每日", "Daily"),
  };
  const metrics = {
    request: text("次请求", "requests"),
    token: "Token",
    credit: text("积分额度", "credits"),
  };
  const tiers = r.plans || [];
  const primary = (tier) =>
    tier.prices.find((v) => v.period === "month") || tier.prices[0];
  const amount = (v) =>
    !v
      ? text("未公开", "Not published")
      : v.amountCents == null
        ? prose(
            v.displayText ||
              priceKinds[v.kind] ||
              text("未公开", "Not published"),
          )
        : money(v.amountCents / 100, v.currency);
  const pill = (tier) => {
    const [label, tone] = status[tier.status] || [tier.status, "muted"];
    return `<span class="catalog-status tone-${tone}"><i></i>${esc(label)}</span>`;
  };
  const monthly = tiers
    .flatMap((t) => t.prices)
    .filter((v) => v.period === "month" && v.amountCents != null)
    .sort(
      (a, b) =>
        (a.filterAmountCnyCents ?? a.amountCents) -
        (b.filterAmountCnyCents ?? b.amountCents),
    )[0];
  const stats = `<div>${catalogIcon("layers")}<span>${text("套餐档位", "Plan tiers")}</span><strong>${tiers.length} <small>${text("个档位", "tiers")}</small></strong></div><div>${catalogIcon("coin")}<span>${text("月付起价", "Monthly from")}</span><strong>${amount(monthly)}</strong></div><div>${catalogIcon("spark")}<span>${text("套餐类型", "Plan type")}</span><strong>${ui.productType(p.productType)}</strong></div><div>${catalogIcon("clock")}<span>${text("资料更新", "Updated")}</span><strong>${date(r.sourceUpdatedAt)}</strong></div>`;
  const priceCards = (tier) =>
    tier.prices
      .map(
        (v) =>
          `<div class="catalog-tier-price"><span>${catalogIcon("coin")}${periods[v.period] || esc(v.period)} <small>${esc(v.currency)}</small></span><strong>${amount(v)}</strong>${v.listAmountCents != null && v.listAmountCents !== v.amountCents ? `<small>${text("原价", "List price")} <del>${money(v.listAmountCents / 100, v.currency)}</del></small>` : ""}${v.kind !== "exact" ? `<small>${prose(priceKinds[v.kind] || v.kind)}</small>` : ""}${v.note ? `<p>${prose(v.note)}</p>` : ""}</div>`,
      )
      .join("");
  const quotaCards = (tier) =>
    tier.quotas.length
      ? `<div class="catalog-quotas">${tier.quotas.map((q) => `<div><span>${catalogIcon("clock")}${windows[q.window] || esc(q.window)}</span><b>${q.kind === "unlimited" ? text("不限量", "Unlimited") : q.amountMin == null ? text("以官方说明为准", "See official limits") : number(q.amountMin) + (q.amountMax != null ? " – " + number(q.amountMax) : "")} <small>${esc(metrics[q.metric] || q.metric)}</small></b><small class="${q.estimated ? "catalog-estimate" : ""}">${q.estimated ? text("来源估算，非保证额度", "Source estimate, not a guaranteed quota") : text("来源标注", "As stated by source")}</small>${q.note ? `<p>${prose(q.note)}</p>` : ""}</div>`).join("")}</div>`
      : `<p class="catalog-inline-note">${catalogIcon("info")}${text("来源未公开固定额度，请以官方使用限制为准。", "No fixed quota published; check official usage limits.")}</p>`;
  return (
    shell(
      r,
      ui,
      "product",
      brand(p.sellerKey, p.sellerName, p.sellerLogoUrl),
      `${external(p.officialUrl, text("官方订购 / 定价", "Official pricing"))}${external(p.documentationUrl, text("官方文档", "Documentation"))}<span class="catalog-seller">${prose(p.sellerName)}</span>`,
      stats,
    ) +
    `<div class="catalog-plan-heading"><div><h2>${text("选择适合你的套餐", "Find your plan")}</h2><p>${text("先比较价格与适用场景，展开查看完整额度和权益。", "Compare prices and use cases, then expand a plan for quotas and benefits.")}</p></div><span>${catalogIcon("info")}${text("价格保留原币种", "Prices in original currencies")}</span></div><nav class="catalog-plan-overview" style="--catalog-plan-columns:${Math.min(5, Math.ceil(tiers.length / (tiers.length > 5 ? 2 : 1)))}" aria-label="${text("套餐档位", "Plan tiers")}">${tiers
      .map((t, i) => {
        const v = primary(t);
        return `<a href="#tier-${i}" data-tier-link="tier-${i}" class="catalog-plan-preview ${i === 0 ? "selected" : ""}"><div><span>${prose(t.planName)}</span>${pill(t)}</div><strong>${amount(v)}<small>${v ? periods[v.period] || esc(v.period) : ""}</small></strong><span class="catalog-preview-link">${text("查看权益", "Explore benefits")}${catalogIcon("arrow")}</span></a>`;
      })
      .join("")}</nav><div class="catalog-tiers">${tiers
      .map((tier, i) => {
        const v = primary(tier);
        return `<details class="catalog-tier" id="tier-${i}" ${i === 0 ? "open" : ""}><summary><div class="catalog-tier-title"><span class="catalog-tier-index">${String(i + 1).padStart(2, "0")}</span><div><h2>${prose(tier.planName)}</h2><span>${text(tier.audienceType === "enterprise" ? "团队与企业" : tier.audienceType === "personal" ? "个人使用" : "个人与团队", tier.audienceType === "enterprise" ? "Teams & businesses" : tier.audienceType === "personal" ? "Personal use" : "Individuals & teams")}</span></div></div><span class="catalog-tier-summary-price"><b>${amount(v)}</b><small>${v ? periods[v.period] || esc(v.period) : ""}</small></span>${pill(tier)}${catalogIcon("down")}</summary><div class="catalog-tier-body"><p class="catalog-tier-description">${prose(tier.summary)}</p>${tier.tags?.length ? `<div class="catalog-tags">${tier.tags.map((t) => `<span class="catalog-tag">${prose(t)}</span>`).join("")}</div>` : ""}<div class="catalog-tier-prices">${priceCards(tier)}</div><div class="catalog-tier-information"><section>${sectionHeading("clock", text("使用额度与限制", "Usage quotas and limits"), "orange")}${quotaCards(tier)}</section><section>${sectionHeading("spark", text("支持模型", "Supported models"), "purple")}<div class="catalog-tags catalog-supported-models">${tier.models.map((m) => `<a class="catalog-model-chip" href="${link("/models/?q=" + encodeURIComponent(m.key))}">${brand(m.key, m.vendorName, m.logoUrl)}${esc(m.name)}</a>`).join("")}</div>${tier.tools?.length ? `${sectionHeading("code", text("支持工具", "Supported tools"), "blue")}<div class="catalog-tags">${tier.tools.map((t) => badge(typeof t === "string" ? t : t.name || t.key)).join("")}</div>` : ""}</section></div>${tier.notes?.length ? `<section class="catalog-benefits">${sectionHeading("book", text("权益与注意事项", "Benefits and conditions"), "teal")}<ul class="catalog-notes">${tier.notes.map((n) => `<li><span class="catalog-note-symbol ${n.type === "benefit" ? "tone-teal" : "tone-orange"}">${catalogIcon(n.type === "benefit" ? "check" : "info")}</span><div>${n.title ? `<b>${prose(n.title)}</b> ` : ""}${prose(n.body)}</div></li>`).join("")}</ul></section>` : ""}<div class="catalog-tier-status"><div>${tier.statusNote ? `<p>${prose(tier.statusNote)}</p>` : ""}${tier.restockAt ? `<p>${text("补货时间", "Restock")} ${date(tier.restockAt)}</p>` : ""}${tier.agentConcurrencyMin != null ? `<p>${text("Agent 并发", "Agent concurrency")} ${number(tier.agentConcurrencyMin)}${tier.agentConcurrencyMax != null ? " – " + number(tier.agentConcurrencyMax) : ""}</p>` : ""}${tier.promptToRequestRatio != null ? `<p>${text("Prompt / Request 换算", "Prompt / request ratio")} ${number(tier.promptToRequestRatio)}</p>` : ""}<span>${catalogIcon("clock")}${text("来源核对", "Source verified")} ${date(tier.lastVerifiedAt)}</span></div>${external(tier.officialUrl, text("前往官方", "Visit official site"))}</div></div></details>`;
      })
      .join(
        "",
      )}</div><div class="catalog-source">${catalogIcon("clock")}<span>${text("采集时间", "Collected")} ${date(r.collectedAt)} · ${text("价格、可用性与限制以官方最新页面为准。", "Prices, availability and limits are subject to official updates.")}</span>${external(r.sourceUrl, text("核对来源资料", "View source"))}</div>`
  );
}
