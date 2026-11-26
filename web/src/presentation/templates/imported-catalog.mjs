import {
  catalogIcon,
  modelProfile,
  productProfile,
} from "./catalog-detail.mjs";
import { modelBrandIcon } from "../model-catalog.mjs";
import { createLocalizer, localePath, hasChinese } from "../localization.mjs";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(value);
const size = (value) =>
  value == null
    ? "—"
    : value >= 1000000
      ? number(value / 1000000) + "M"
      : value >= 1000
        ? number(value / 1000) + "K"
        : number(value);
const safeUrl = (value) =>
  /^https:\/\/[^\s<>"']+$/i.test(value || "") ? esc(value) : "";
const types = {
  text: ["文本", "Text"],
  image: ["图像", "Image"],
  video: ["视频", "Video"],
  audio: ["音频", "Audio"],
  embedding: ["嵌入", "Embedding"],
  multimodal: ["多模态", "Multimodal"],
};

export function importedCatalogMeta(payload) {
  const english = createLocalizer(
    "en",
    payload.translations,
    payload.pendingTranslations,
  );
  const identified = (name, id) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ===
    String(id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      ? name
      : name + " · " + id;
  const model = payload.importedModels?.items.find(
    (r) => "/models/" + r.slug === payload.path,
  );
  const product = payload.importedPackages?.items.find(
    (r) => "/coding-plans/" + r.slug === payload.path,
  );
  if (model)
    return {
      title:
        identified(model.name, model.modelId || model.slug) +
        " · 参数、能力与价格",
      description: `${model.name} (${model.modelId}) · ${model.summary || model.model.description?.zh || model.modelId}`,
      englishTitle:
        identified(english.text(model.name), model.modelId || model.slug) +
        " · Specifications and Pricing",
      englishDescription:
        `${english.text(model.name)} (${model.modelId}) · ` +
        (model.model.description?.en ||
          model.model.subtitle?.en ||
          english.text(model.model.description?.zh || model.summary || "")),
      englishReady:
        !hasChinese(model.model.displayName) &&
        !!(model.model.description?.en || model.model.subtitle?.en),
      item: model,
      kind: "model",
    };
  if (product) {
    const variant =
      {
        product_subscription: "Subscription",
        coding_plan: "Coding Plan",
        token_plan: "Token Plan",
        x_subscription: "X Subscription",
        m_plan: "M Plan",
        hy_token_plan: "HY Token Plan",
      }[product.product.productKey] ||
      product.product.productKey.replaceAll("_", " ");
    const name = english.text(product.name);
    const title = name.toLowerCase().includes(variant.toLowerCase())
      ? name
      : name + " · " + variant;
    return {
      title: product.name + " · 套餐价格、额度与权益",
      description: product.summary,
      englishTitle: title + " · AI Plans and Quotas",
      englishDescription: title + ". " + english.text(product.summary),
      englishReady: !hasChinese(
        english.text(product.name) + english.text(product.summary),
      ),
      item: product,
      kind: "product",
    };
  }
  if (payload.path === "/models")
    return {
      title: "模型大全 · AI 模型参数、能力与价格",
      description:
        "浏览 AI 模型的发行商、上下文、输入输出能力、推理、工具调用与公开价格，按型号查找完整参数。",
      englishTitle: "AI Model Directory · Specifications and Pricing",
      englishDescription:
        "Explore AI models, context windows, capabilities, publishers and published prices.",
      englishReady: true,
      kind: "models",
    };
  if (payload.path === "/coding-plans")
    return {
      title: "模型套餐 · 订阅价格、额度与权益对比",
      description:
        "对比官方订阅、Coding Plan 与 Token Plan 的价格、计费周期、调用额度、支持模型、工具及使用限制。",
      englishTitle: "AI Model Plans · Subscriptions and Quotas",
      englishDescription:
        "Compare subscriptions, Coding Plans and Token Plans by price, quota, models and tools.",
      englishReady: (payload.importedPackages?.items || []).every(
        (row) =>
          !hasChinese(english.text(row.name) + english.text(row.summary)),
      ),
      kind: "products",
    };
  return null;
}

export function importedCatalogPage(payload, options = {}) {
  const meta = importedCatalogMeta(payload);
  if (!meta) return null;
  const en = payload.locale === "en";
  const text = (zh, english) => (en ? english : zh);
  const localizer = createLocalizer(
    payload.locale,
    payload.translations,
    payload.pendingTranslations,
  );
  const prose = (value) => {
    const translated = localizer.text(String(value || ""), true);
    return esc(
      en && hasChinese(translated)
        ? "Translation pending. Refer to the linked source for details."
        : translated,
    );
  };
  const localized = (value) =>
    typeof value === "object"
      ? value?.[en ? "en" : "zh"] || value?.en || value?.zh || ""
      : value || "";
  const link = (path) => localePath(path, payload.locale);
  const letter = (id, hint) =>
    en
      ? (String(id || hint).match(/[a-z0-9]/i)?.[0] || "A").toUpperCase()
      : String(hint || id)
          .slice(0, 1)
          .toUpperCase();
  const brand = (id, hint = "", logo = "") =>
    modelBrandIcon(id, "brand-icon", hint) ||
    (/^\/logos\/[a-zA-Z0-9_./-]+\.(?:svg|png|webp)$/.test(logo)
      ? `<img class="brand-icon" src="https://www.hvoyai.com${esc(logo)}" width="30" height="30" loading="lazy" alt="${esc(hint)}">`
      : "") ||
    '<span class="catalog-letter">' + esc(letter(id, hint)) + "</span>";
  const badge = (label) =>
    '<span class="catalog-tag">' + esc(label) + "</span>";
  const external = (url, label) =>
    safeUrl(url)
      ? `<a class="catalog-external" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${catalogIcon("arrow")}</a>`
      : "";
  const date = (value) => (value ? esc(String(value).slice(0, 10)) : "—");
  const intro = (eyebrow, title, description) =>
    `<header class="catalog-heading"><span class="catalog-eyebrow">${eyebrow}</span><h1>${esc(title)}</h1><p>${description}</p></header>`;
  const productType = (value) =>
    ({
      product_subscription: text("官方订阅", "Subscription"),
      coding_plan: "Coding Plan",
      token_plan: "Token Plan",
    })[value] || String(value || "").replaceAll("_", " ");
  const q = new URLSearchParams(payload.query || "");
  const select = (name, label, options) =>
    `<label><span>${esc(label)}</span><select name="${name}"><option value="">${text("全部", "All")}</option>${options.map(([value, label]) => `<option value="${esc(value)}" ${q.get(name) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`;
  const paginate = (list, pageSize = 24) => {
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    const requested = Number(q.get("page") || 1);
    const page = Number.isFinite(requested)
      ? Math.min(pages, Math.max(1, Math.trunc(requested)))
      : 1;
    const href = (value) => {
      const next = new URLSearchParams(q);
      next.set("page", String(value));
      return link(payload.path + "/") + "?" + esc(next.toString());
    };
    const pager = `<nav class="catalog-pagination" aria-label="${text("分页", "Pagination")}"><span>${text("共", "Total")} ${list.length} ${text("条", "items")} · ${page} / ${pages}</span><div>${page > 1 ? `<a href="${href(page - 1)}">← ${text("上一页", "Previous")}</a>` : ""}${page < pages ? `<a href="${href(page + 1)}">${text("下一页", "Next")} →</a>` : ""}</div></nav>`;
    return { rows: list.slice((page - 1) * pageSize, page * pageSize), pager };
  };
  const money = (value, currency = "CNY") =>
    value == null
      ? text("未公开", "Not published")
      : (currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency + " ") +
        number(value);
  const price = (p) => {
    if (!p) return text("未公开价格", "Price not published");
    if (p.primaryBilling !== "token")
      return (
        money(p.unitPriceCny) + " " + prose(localized(p.unitLabel || p.unit))
      );
    return (
      (p.approximate ? "≈ " : "") +
      money(p.inputCny ?? p.inputPriceCny) +
      " / " +
      money(p.outputCny ?? p.outputPriceCny)
    );
  };
  const capabilities = (model) =>
    [
      ["supportsReasoning", "推理", "Reasoning"],
      ["supportsToolCall", "工具调用", "Tools"],
      ["supportsStructuredOutput", "结构化输出", "Structured output"],
      ["openWeights", "开放权重", "Open weights"],
    ]
      .filter(([key]) => model[key] === true)
      .map(([, zh, english]) => badge(text(zh, english)))
      .join("");
  const modalities = (m, prefix) =>
    ["Text", "Image", "Audio", "Video", "Pdf"]
      .filter((k) => m[prefix + k])
      .map((k) =>
        text(
          {
            Text: "文字",
            Image: "图片",
            Audio: "音频",
            Video: "视频",
            Pdf: "PDF",
          }[k],
          k,
        ),
      )
      .join(" · ") || "—";
  const modelTable = (rows) =>
    `<div class="catalog-table-scroll"><table class="catalog-table"><thead><tr>${["模型|Model", "发行商|Publisher", "上下文 / 输出|Context / Output", "输入 / 输出|Input / Output", "能力|Capabilities", "公开价格|Published pricing"].map((s) => `<th>${s.split("|")[en ? 1 : 0]}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => {
        const m = r.model;
        return `<tr><td><a class="catalog-model-name" href="${link("/models/" + r.slug + "/")}">${brand(m.modelId, m.organization.nameEn, m.organization.logoUrl)}<span><strong>${esc(r.name)}</strong><code>${esc(m.modelId)}</code></span></a></td><td>${esc(en ? m.organization.nameEn : m.organization.nameZh)}</td><td><b>${size(m.contextTokens)}</b><small>${text("最大输出", "Max output")} ${size(m.maxOutputTokens)}</small></td><td>${esc(modalities(m, "input"))}<small>${esc(modalities(m, "output"))}</small></td><td><div class="catalog-tags">${capabilities(m) || "—"}</div></td><td><b class="catalog-price">${price(m.officialPricing)}</b><small>${text("官方 · 每百万 Token / 标注单位", "Official · per 1M tokens / stated unit")}</small><span class="catalog-relay">${m.bestRelay ? text("来源最低", "Source minimum") + " " + price({ ...m.bestRelay, primaryBilling: m.bestRelay.primaryBilling }) : ""}</span></td></tr>`;
      })
      .join("")}</tbody></table></div>`;
  const ui = {
    en,
    text,
    esc,
    prose,
    localized,
    brand,
    badge,
    external,
    date,
    link,
    money,
    price,
    capabilities,
    modalities,
    number,
    size,
    productType,
    modelType: (value) => types[value]?.[en ? 1 : 0] || value || "—",
  };
  let html = "";
  if (meta.kind === "models") {
    const all = payload.importedModels?.items || [];
    const providers = [
      ...new Map(
        all.map((r) => [
          r.model.organization.organizationId,
          en ? r.model.organization.nameEn : r.model.organization.nameZh,
        ]),
      ).entries(),
    ];
    const list = all
      .filter((r) => {
        const m = r.model;
        return (
          (!q.get("q") ||
            (r.name + " " + r.modelId + " " + r.summary)
              .toLowerCase()
              .includes(q.get("q").toLowerCase())) &&
          (!q.get("provider") ||
            m.organization.organizationId === q.get("provider")) &&
          (!q.get("type") || m.modelType === q.get("type")) &&
          (!q.get("capability") || m[q.get("capability")] === true)
        );
      })
      .sort((a, b) =>
        String(b.model.releaseDate || "").localeCompare(
          String(a.model.releaseDate || ""),
        ),
      );
    const { rows, pager } = paginate(list);
    html =
      intro(
        "MODEL DIRECTORY",
        text("模型大全", "AI Model Directory"),
        esc(
          text(
            "按发行商、能力与型号查找模型，核对上下文、最大输出和公开价格。",
            "Find models by publisher, capability and model ID; compare context windows and published pricing.",
          ),
        ),
      ) +
      `<div class="catalog-statline"><span><b>${all.length}</b> ${text("个模型", "models")}</span><span><b>${providers.length}</b> ${text("家发行商", "publishers")}</span><span>${text("资料采集", "Collected")} ${date(payload.importedModels?.updatedAt)}</span></div><form class="catalog-filters" data-catalog-filter method="get" action="${link("/models/")}"><label class="catalog-search"><span>${text("搜索型号", "Search models")}</span><input name="q" value="${esc(q.get("q") || "")}" placeholder="${text("模型名称、ID 或关键词", "Model name, ID or keyword")}"></label>${select("provider", text("发行商", "Publisher"), providers)}${select(
        "type",
        text("模型类型", "Type"),
        Object.entries(types).map(([key, v]) => [key, v[en ? 1 : 0]]),
      )}${select("capability", text("能力", "Capability"), [
        ["supportsReasoning", text("推理", "Reasoning")],
        ["supportsToolCall", text("工具调用", "Tool calls")],
        ["openWeights", text("开放权重", "Open weights")],
      ])}<button class="btn primary" type="submit">${text("筛选", "Filter")}</button><a href="${link("/models/")}">${text("重置", "Reset")}</a></form>${pager}${rows.length ? modelTable(rows) : `<p class="catalog-empty">${text("没有符合条件的模型。", "No matching models.")}</p>`}${pager}`;
  } else if (meta.kind === "model") {
    html = modelProfile(meta.item, ui, options.providers?.(meta.item));
  } else if (meta.kind === "products") {
    const all = payload.importedPackages?.items || [];
    const vendors = [
      ...new Map(
        all.map((r) => [r.product.sellerKey, r.product.sellerName]),
      ).entries(),
    ];
    const list = all.filter(
      (r) =>
        (!q.get("q") ||
          (r.name + " " + r.summary + " " + r.vendor)
            .toLowerCase()
            .includes(q.get("q").toLowerCase())) &&
        (!q.get("provider") || r.product.sellerKey === q.get("provider")) &&
        (!q.get("type") || r.product.productType === q.get("type")),
    );
    html =
      intro(
        "MODEL PLANS",
        text("模型套餐", "AI Model Plans"),
        esc(
          text(
            "对比官方订阅、Coding Plan 与 Token Plan，先看价格，再看额度、支持模型和使用限制。",
            "Compare subscriptions, Coding Plans and Token Plans by price, quota, supported models and limitations.",
          ),
        ),
      ) +
      `<div class="catalog-statline"><span><b>${all.length}</b> ${text("组产品", "products")}</span><span><b>${all.reduce((n, r) => n + r.plans.length, 0)}</b> ${text("个套餐档位", "plan tiers")}</span><span>${text("资料采集", "Collected")} ${date(payload.importedPackages?.updatedAt)}</span></div><form class="catalog-filters" data-catalog-filter method="get" action="${link("/coding-plans/")}"><label class="catalog-search"><span>${text("搜索套餐", "Search plans")}</span><input name="q" value="${esc(q.get("q") || "")}" placeholder="${text("厂商、产品或套餐关键词", "Seller, product or keyword")}"></label>${select("provider", text("厂商", "Seller"), vendors)}${select(
        "type",
        text("类型", "Type"),
        [...new Set(all.map((r) => r.product.productType))].map((v) => [
          v,
          productType(v),
        ]),
      )}<button class="btn primary">${text("筛选", "Filter")}</button><a href="${link("/coding-plans/")}">${text("重置", "Reset")}</a></form><div class="catalog-products">${list
        .map((r) => {
          const p = r.product;
          const amounts = r.plans.flatMap((t) =>
            t.prices
              .filter(
                (p) =>
                  p.period === "month" &&
                  p.kind === "exact" &&
                  p.amountCents != null,
              )
              .map((p) => p),
          );
          const cheapest = amounts.sort(
            (a, b) =>
              (a.filterAmountCnyCents ?? a.amountCents) -
              (b.filterAmountCnyCents ?? b.amountCents),
          )[0];
          return `<article class="catalog-product"><header>${brand(p.sellerKey, p.sellerName, p.sellerLogoUrl)}<span>${prose(en ? p.sellerKey.replaceAll("_", " ") : p.sellerName)}</span>${badge(productType(p.productType))}</header><h2><a href="${link("/coding-plans/" + r.slug + "/")}">${prose(r.name)}</a></h2><p>${prose(r.summary)}</p><div class="catalog-product-price"><strong>${cheapest ? money(cheapest.amountCents / 100, cheapest.currency) : text("查看详情", "View details")}</strong><span>${cheapest ? text("起 / 月", "from / month") : ""}</span></div><footer><span>${r.plans.length} ${text("个档位", "tiers")}</span><a href="${link("/coding-plans/" + r.slug + "/")}">${text("套餐详情", "Plan details")} →</a></footer></article>`;
        })
        .join(
          "",
        )}</div>${!list.length ? `<p class="catalog-empty">${text("没有符合条件的套餐。", "No matching plans.")}</p>` : ""}`;
  } else {
    html = productProfile(meta.item, ui);
  }
  const localizedHTML = localizer.html(html, true);
  options.onMissing?.([...localizer.missing]);
  return `<section class="container imported-catalog" translate="no">${localizedHTML}</section>`;
}
