import { configuredModelChoices, modelBrand } from "./model-catalog.mjs";
import { importedCatalogPage } from "./templates/imported-catalog.mjs";
import approved from "./approved-content.json" with { type: "json" };
import navigation from "./templates/header-navigation.mjs";
import site from "./templates/site-ui.mjs";
import artwork from "./templates/page-art.mjs";
import developers from "./templates/developer-ui.mjs";
import workspace from "./templates/workspace-pages.mjs";
import benefits from "./templates/benefits-ui.mjs";
import accounts from "./templates/account-ui.mjs";
import points from "./templates/points-ui.mjs";
import submission from "./templates/submission-ui.mjs";
import modelTests from "./templates/model-test-ui.mjs";
import reports from "./templates/tool-report-ui.mjs";
import directory from "./templates/directory.mjs";
import priceDemo from "./templates/demo-price-ui.mjs";
import { createLocalizer, localePath } from "./localization.mjs";

const paymentNames = {
  支付宝: ["alipay", "alipay.svg"],
  微信支付: ["wechatpay", "wechatpay.svg"],
  微信: ["wechatpay", "wechatpay.svg"],
  USDT: ["usdt", "usdt.svg"],
  银行卡: ["bankcard", "bankcard.svg"],
  对公转账: ["corporate", "corporate.svg"],
  PayPal: ["paypal", "paypal.svg"],
};
const categoryKeys = {
  "public-service": "public",
  enterprise: "enterprise",
  "newly-listed": "new",
  "signup-bonus": "bonus",
};
const clean = (p) => p.replace(/\/$/, "") || "/";

export function createPresentation(payload, view = {}) {
  const modelChoices = configuredModelChoices(payload);
  const locale = payload.locale || "zh-CN";
  const localizer = createLocalizer(
    locale,
    payload.translations || {},
    payload.pendingTranslations || [],
  );
  const rows = payload.stations || [];
  const source = payload.pricing?.source || [];
  const sites = rows.map((s) => {
    const pricing = s.sourcePricing || source.find((p) => p.station === s.slug);
    const modelRows = (pricing?.rows || []).map((r) => ({
      ...r,
      brand:
        modelBrand(r.cells?.[0], r.ecosystem || r.brand)?.key ||
        r.ecosystem ||
        r.brand ||
        "",
    }));
    return {
      ...s,
      url: s.registerUrl || s.domain,
      domain: s.domain.replace(/^https?:\/\//, ""),
      desc: s.summary || "",
      description: s.description || s.summary || "",
      uptime: s.sourceUptime ?? null,
      latency: s.sourceLatency ?? null,
      modelCount:
        s.modelCount ??
        s.sourceModelCount ??
        (modelRows.length || s.models?.length || 0),
      models: s.models || [],
      payments: (s.payments || []).map((n) => {
        const [key, file] = paymentNames[n] || [n, "bankcard.svg"];
        return { name: n, key, icon: "/assets/payments/" + file };
      }),
      publicModelTable: { headers: pricing?.headers || [], rows: modelRows },
      pricingSnapshot: pricing || null,
      kind: s.kind || "未公开",
      sourceUrl: s.sourceUrl || s.source || "",
      minRecharge: s.minRecharge || "—",
      invoice: s.invoice || "未确认",
      refund: s.refund || "未确认",
      publicUpdates: (s.notices || []).map((n) => ({
        title: n.name,
        text: n.body,
        sourceUrl: n.sourceUrl,
        publishedAt: n.sourcePublishedAt,
        collectedAt: n.collectedAt,
      })),
      tags: s.tags || [],
    };
  });
  const route = approved.routes.find((r) => r.path === clean(payload.path));
  let internal = route?.internal || clean(payload.path);
  if (/^\/models\/[^/]+\/?$/.test(payload.path)) {
    const model = payload.catalog.models.find(
      (m) => m.slug === clean(payload.path).split("/").at(-1),
    );
    if (model)
      internal = "/model/" + (model.slug === "openai" ? "gpt" : model.slug);
  }
  if (/^\/stations\/[^/]+\/?$/.test(payload.path)) {
    const s = sites.find(
      (s) => s.slug === clean(payload.path).split("/").at(-1),
    );
    if (s) internal = "/site/" + s.id;
  }
  if (/^\/stations\/categories\//.test(payload.path))
    internal =
      "/sites/" +
      (categoryKeys[clean(payload.path).split("/").at(-1)] ||
        clean(payload.path).split("/").at(-1));
  const categories = payload.catalog.categories.map((c) => ({
    ...c,
    slug: categoryKeys[c.slug] || c.slug,
  }));
  const member = {
    saved: [],
    compare: [],
    applications: [],
    reviews: rows.flatMap((s) =>
      (s.reviews || []).map((r) => ({
        site: s.id,
        name: r.author || "用户",
        text: r.body,
        rating: r.rating,
        date: r.created?.slice(0, 10) || "",
      })),
    ),
    user: null,
    ...view.member,
  };
  if (member.user)
    member.user = {
      ...member.user,
      ...member.user.profile,
      joined: member.user.created?.slice(0, 10) || "—",
    };
  member["member.notifications"] = member.user?.notifications || {
    review: true,
    benefits: false,
  };
  const window = {
    translate: localizer.text,
    modelChoices,
    KUGNI_CONFIG: {
      ...approved.config,
      categories,
      contact: { ...approved.config.contact, ...payload.catalog.settings },
    },
    KUGNI_CONTENT: {
      pages: structuredClone(approved.pages),
      documents: structuredClone(approved.documents),
    },
    KUGNI_SOURCE: { sites, capturedAt: payload.catalog.sourceDate },
    KUGNI_ROUTER: {
      hash: "#" + internal + (payload.query ? "?" + payload.query : ""),
      pathURL: toPath,
      legacy: false,
    },
    KUGNI_TOOL_REPORT_DATA: {
      history: () => [],
      resolve: () => {
        if (!view.report) throw new Error("报告不存在");
        return view.report;
      },
      shareURL: (r) => "/tools/api-check/reports/" + r.id + "/",
    },
    member,
    view: {
      ...view,
      model:
        view.model ??
        (new URLSearchParams(payload.query || "").get("model") || "全部"),
      kind:
        categories.find((c) => internal === "/sites/" + c.slug)?.name || "全部",
    },
    models: payload.catalog.models.map((m) => ({
      id: m.slug === "openai" ? "gpt" : m.slug,
      slug: m.slug,
      name: m.name,
      brand:
        {
          openai: "GPT",
          claude: "Claude",
          gemini: "Gemini",
          deepseek: "DeepSeek",
          grok: "Grok",
          qwen: "Qwen",
          kimi: "Kimi",
          glm: "GLM",
        }[m.slug] ||
        m.vendor ||
        m.name,
      desc: m.summary || "",
      type: m.type || "模型生态",
      context: "未公开",
      input: null,
      output: null,
    })),
    plans: (payload.plans || []).map((p) => ({
      ...p,
      seller: rows.find((s) => s.id === p.station)?.name || "服务商",
      type: "Coding Plan",
      quota: p.limits,
      price: p.price ?? "未公开",
      models: Array.isArray(p.models) ? p.models : [],
      brand: p.brand || "GPT",
    })),
    reports: payload.reports || [],
    location: { origin: "https://www.kugni.com" },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      documentElement: { dataset: {}, classList: { add() {} } },
    },
    matchMedia: (q) => ({
      matches: q.includes("min-width")
        ? (view.width || 1440) > 760
        : (view.width || 1440) <= 760,
    }),
  };
  const modelIDs = [
    ...new Set((payload.pricing?.items || []).map((q) => q.modelId)),
  ];
  const selectedModel = view.pricing?.model || modelIDs[0];
  const activeQuotes = (payload.pricing?.items || []).filter(
    (q) =>
      q.modelId === selectedModel &&
      q.currency === "CNY" &&
      ["百万 Token", "千 Token"].includes(q.unit),
  );
  window.KUGNI_DEMO_QUOTES = {
    models: (modelIDs.length ? modelIDs : ["暂未发布标准报价"]).map((id) => ({
      id,
      brand: modelBrand(id)?.key || "",
      factor: 1,
    })),
    scenarios: {
      daily: { label: "编程开发", input: 10000, output: 2000 },
      writing: { label: "长文生成", input: 2000, output: 8000 },
      cache: { label: "长上下文", input: 30000, output: 1000 },
    },
    channels: activeQuotes.map((q, i) => ({
      id: q.id,
      name: q.stationName || q.name,
      mark: (q.stationName || q.name).slice(0, 1),
      color: ["#2563eb", "#14866d", "#8b5cf6", "#cc8541"][i % 4],
      group: q.name,
      rates:
        q.input != null && q.output != null
          ? Object.fromEntries(
              ["input", "output", "cache"].map((k) => [
                k,
                q[k] == null
                  ? null
                  : Number(q[k]) *
                    (q.unit === "千 Token" ? 1000 : 1) *
                    Number(q.multiplier ?? 1),
              ]),
            )
          : null,
    })),
  };
  const api = toPath;
  function toPath(value) {
    if (!value.startsWith("#/") && !value.startsWith("/")) return value;
    const normalized = value.replace(/^#/, "");
    const [path, query] = normalized.split("?");
    const record = approved.routes.find((r) => r.internal === path);
    let target = record?.path || path;
    if (path.startsWith("/model/")) {
      const model = window.models.find((m) => m.id === path.slice(7));
      if (model) target = "/models/" + model.slug;
    }
    if (path.startsWith("/site/"))
      target =
        "/stations/" +
        (sites.find((s) => s.id === path.slice(6))?.slug || path.slice(6));
    if (path.startsWith("/sites/"))
      target =
        "/stations/categories/" +
        (payload.catalog.categories.find(
          (c) => (categoryKeys[c.slug] || c.slug) === path.slice(7),
        )?.slug || path.slice(7));
    return (
      (target === "/" ? "/" : target.replace(/\/$/, "") + "/") +
      (query ? "?" + query : "")
    );
  }
  for (const create of [
    navigation,
    site,
    artwork,
    developers,
    workspace,
    benefits,
    accounts,
    points,
    submission,
    modelTests,
    reports,
    priceDemo,
  ])
    create(window);
  const templates = directory(window);
  const context = templates.accountContext();
  const accountRoutes = window.KUGNI_ACCOUNT.routes(context);
  if (view.settingsTab) window.member.settingsTab = view.settingsTab;
  if (payload.content?.page) {
    const old = window.KUGNI_CONTENT.pages[internal];
    if (old) Object.assign(old, { ...payload.content.page });
  }
  const sections = internal.split("/").filter(Boolean),
    section = sections[0] || "home";
  function main() {
    const imported = importedCatalogPage(payload, {
      onMissing: (values) =>
        values.forEach((value) => localizer.missing.add(value)),
      providers: (record) => {
        const result = templates.modelProviders(record);
        return { ...result, html: localizer.html(result.html, true) };
      },
    });
    if (imported !== null) return imported;
    if (internal === "/") return templates.home();
    if (section === "sites")
      return templates.home(
        true,
        categories.find((c) => c.slug === sections[1]),
      );
    if (section === "site") return templates.detail(sections[1]);
    if (section === "models") return templates.modelsPage();
    if (section === "model") return templates.modelDetail(sections[1]);
    if (section === "coding-plans") return templates.codingPlans();
    if (section === "prices") {
      if (
        view.priceMode === "snapshot" ||
        ((payload.query || "").includes("model=") && !view.priceMode)
      )
        return templates
          .snapshotPrices()
          .replace(
            '<div id="price-result" aria-live="polite"></div>',
            '<div id="price-result" aria-live="polite">' +
              templates.snapshotResults() +
              "</div>",
          );
      return templates.page(
        window.KUGNI_PRICE_DEMO.page(templates)
          .replace("效果演示", "预算与用量")
          .replace("来源快照", "来源快照")
          .replace("虚构数据演示", "标准化报价")
          .replace(
            /以下服务商、渠道及价格全部虚构[^<]+/,
            "仅使用已发布、同型号、人民币且单位明确的标准化报价。预算按场景预设估算，来源分组报价另列。",
          )
          .replace(
            '<div id="price-result" aria-live="polite"></div>',
            '<div id="price-result" aria-live="polite">' +
              priceResults() +
              "</div>",
          ),
      );
    }
    if (section === "developers")
      return templates.page(window.KUGNI_DEVELOPERS.page());
    if (section === "sponsor")
      return templates.page(window.KUGNI_SITE.business());
    if (section === "benefits") return templates.benefits();
    if (section === "submit") return templates.submitPage();
    if (section === "saved") return templates.saved();
    if (section === "compare") return templates.compare();
    if (section === "check") {
      if (sections[1] === "history") return templates.checkHistoryPage();
      if (sections[1] === "candy" || sections[1] === "fingerprint")
        return templates.page(
          sections[2] === "result"
            ? window.KUGNI_TOOL_REPORTS.page(sections[1])
            : window.KUGNI_MODEL_TEST.page(sections[1]),
        );
      return templates.check();
    }
    if (accountRoutes[section]) return accountRoutes[section]();
    if (payload.content?.article) {
      const a = payload.content.article;
      return templates.page(
        '<article class="site-document"><header class="site-page-heading"><h1>' +
          templates.esc(a.name) +
          "</h1><p>" +
          templates.esc(a.summary || "") +
          '</p></header><div class="site-prose">' +
          String(a.body || "")
            .split("\n")
            .filter(Boolean)
            .map((p) => "<p>" + templates.esc(p) + "</p>")
            .join("") +
          "</div></article>",
      );
    }
    if (window.KUGNI_CONTENT.documents[section])
      return templates.page(window.KUGNI_SITE.documentPage(section));
    return "";
  }
  function priceResults() {
    const estimator = window.KUGNI_PRICE_DEMO,
      state = { ...estimator.state, ...view.pricing };
    const model =
      window.KUGNI_DEMO_QUOTES.models.find((m) => m.id === state.model) ||
      window.KUGNI_DEMO_QUOTES.models[0];
    const scenario =
      window.KUGNI_DEMO_QUOTES.scenarios[state.scenario] ||
      window.KUGNI_DEMO_QUOTES.scenarios.daily;
    const usage =
      state.method === "budget"
        ? { ...scenario, hit: Number(state.hit), calls: 1 }
        : {
            input: Number(state.input),
            output: Number(state.output),
            calls: Number(state.calls),
            hit: Number(state.hit),
          };
    const result = window.KUGNI_DEMO_QUOTES.channels
      .map((c) => ({
        ...c,
        cost:
          state.method === "budget"
            ? estimator.purchasingPower(c, model, usage, Number(state.budget))
            : estimator.quote(c, model, usage),
      }))
      .filter((r) => r.cost);
    if (!result.length)
      return '<div class="relay-empty"><h3>暂未公开可计算的标准报价</h3><p>可以切换来源快照核对公开分组；缺失价格和计费单位不按零元处理。</p></div>';
    state.base = result.find((r) => r.id === state.base)?.id || result[0].id;
    Object.assign(estimator.state, state);
    result.sort((a, b) =>
      state.method === "budget"
        ? b.cost.totalTokens - a.cost.totalTokens
        : a.cost.total - b.cost.total,
    );
    return (
      estimator.summary(result, state.method === "budget") +
      estimator.ranking(result, state.method === "budget")
    );
  }
  function finalizeSource(html) {
    return html
      .replace(
        /href="#(\/[^"\s]*)"/g,
        (_, href) => 'href="' + api("#" + href) + '"',
      )
      .replace(/(src|href)="(assets\/|favicon\.)/g, '$1="/$2')
      .replace(
        /(?:本地模拟 · 不发送请求|界面演示 · 不发送 API 请求，报告中的示例均有标注。)/g,
        "真实接口检测 · 请使用专用测试凭证",
      )
      .replace(
        /请使用测试用示例 Key，密钥不会保存。/g,
        "密钥加密处理，检测完成后清除临时凭证。",
      )
      .replaceAll("填入示例密钥", "获取可用模型")
      .replaceAll("填入示例", "获取模型")
      .replaceAll("开始模拟检测", "开始接口检测")
      .replaceAll("示例 API Key", "API Key")
      .replaceAll("运行本地模拟", "运行真实检测")
      .replace(/<label class="wk-scenario">[\s\S]*?<\/label>/g, "")
      .replace(/<div class="wk-demo-note">[\s\S]*?<\/div>/g, "")
      .replace(
        /href="\/tools\/api-check\/reports\/(?:undefined|null)\/"/g,
        'href="/tools/api-check/"',
      )
      .replace(
        /当前申请仅保存在本浏览器，可在个人中心查看。/g,
        "提交后进入平台审核，可在个人中心查看进度。",
      )
      .replace(/当前申请仅在本浏览器保存/g, "申请将提交平台审核")
      .replace(
        /当前为前端体验，账户资料与操作仅保存在此浏览器。/g,
        "账户资料、收藏和记录与你的登录账户同步。",
      )
      .replace(
        /当前为界面预览，不验证真实账户，不发送邮件。<br>请使用演示信息，密码仅用于本次表单校验。/g,
        "通过加密连接登录账户，密码不会保存在浏览器。",
      )
      .replace(
        /<div class="member-auth-divider">[\s\S]*?<p class="member-auth-note">/g,
        '<p class="member-auth-note">',
      )
      .replace(/了解当前为本地体验/g, "服务条款")
      .replace(/minlength="8"/g, 'minlength="10"')
      .replaceAll("至少 8 位", "至少 10 位")
      .replaceAll("本地体验", "账户空间")
      .replaceAll("演示积分", "积分")
      .replaceAll("本地演示，不发送请求", "真实接口 · 独立请求")
      .replaceAll("sk-…（请使用示例信息）", "sk-…")
      .replaceAll("显示示例密钥", "显示密钥")
      .replaceAll(
        "Key 只留在这次打开的页面里，不保存",
        "临时凭证加密处理，检测完成后清除",
      )
      .replaceAll(
        "当前展示本地示例，报告包含逐题答案、解释和四项正确率",
        "实际逐题请求模型，报告包含答案、解释和四项正确率",
      )
      .replaceAll(
        "当前仅预览数字样本报告，不发起 API 请求，Key 不写入记录。",
        "会发起真实 API 请求，Key 不写入报告。",
      )
      .replaceAll(
        "当前可整理数字分布；真实 API 采集与模型指纹库匹配尚未接入。",
        "支持真实 API 采样与可信指纹基线对照；样本不足或候选过近时不判断型号。",
      )
      .replaceAll(
        "本地示例 · 未调用接口，以下分数和答案用于展示报告布局。",
        "依据本轮实际回答判定，结果仅代表本轮样本。",
      )
      .replaceAll("示例模型答案", "模型答案")
      .replaceAll("本轮示例得分", "本轮得分")
      .replaceAll("示例判定", "本轮判定")
      .replaceAll("示例答对", "答对")
      .replaceAll("示例答错", "答错")
      .replaceAll("这只是固定示例。", "这是本轮实际答题记录。")
      .replaceAll("收藏保存在当前浏览器。", "收藏与你的账户同步。")
      .replaceAll(
        "仅保存在当前浏览器 · 最近 20 份 · 不保存 Key 或原始回答",
        "检测记录与你的账户同步 · 报告不包含 API Key",
      )
      .replace(/<a class="tool-example-report"[^>]*>[\s\S]*?<\/a>/g, "")
      .replace(/<a[^>]*href="[^" ]*example=1[^" ]*"[^>]*>[\s\S]*?<\/a>/g, "")
      .replaceAll(
        "模型参数与价格为示例 · 服务商为来源快照",
        "模型参数以具体型号为准 · 服务商为来源快照",
      )
      .replaceAll("示例价格", "公开价格")
      .replaceAll("每百万 tokens · 示例", "每百万 tokens · 待核对")
      .replace(
        /(<form id="member-profile-form">[\s\S]*?name="email"[^>]*)(>)/,
        "$1 readonly$2",
      )
      .replaceAll(
        "当前为本地申请记录，审核状态可在演示管理台中体验。",
        "申请进度以平台实际审核为准。",
      )
      .replace(
        /<a href="\/admin\/" class="member-button member-secondary"[^>]*>[\s\S]*?<\/a>/g,
        "",
      )
      .replaceAll("积分功能为本地演示", "积分按任务规则发放")
      .replaceAll(
        "积分、任务与兑换为当前浏览器的本地体验，正式发奖与权益开通尚未接入。",
        "任务与积分以账户实际记录为准，兑换按权益库存与审核状态处理。",
      );
  }
  function finalize(html, track = false) {
    return localizer.html(finalizeSource(html), track);
  }
  let markup = main();
  const art = {
    home: ["connection-intro", "network", "page-art-home"],
    models: ["atlas-heading", "models", ""],
    "coding-plans": ["plan-recommend", "code", ""],
    check: ["wk-head", sections[1] === "history" ? "history" : "shield", ""],
    saved: ["wk-head", "folder", ""],
    compare: ["wk-head", "compare", ""],
  }[section];
  if (art)
    markup = markup.replace(
      new RegExp(
        '(<(?:section|div|header)[^>]*class="[^"]*\\b' +
          art[0] +
          '\\b[^"]*)("[^>]*>)',
      ),
      (_, a, b) =>
        a + " has-page-art" + b + window.KUGNI_PAGE_ART.render(art[1], art[2]),
    );
  const faq = window.KUGNI_CONTENT.pages[internal]?.faq;
  if (faq?.length)
    markup +=
      '<div class="container">' + window.KUGNI_SITE.faq({ faq }) + "</div>";
  const languages = [
    { code: "zh-CN", label: "简体中文", short: "中文" },
    { code: "en", label: "English", short: "EN" },
  ];
  const currentLanguage = languages.find(
    (language) => language.code === locale,
  );
  const languageLabel = locale === "en" ? "Choose language" : "选择语言";
  const languageIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/></svg>';
  const switcher = `<details class="language-menu" data-language-menu><summary class="language-switch" data-language-toggle aria-label="${languageLabel}">${languageIcon}<span>${currentLanguage.short}</span><svg class="language-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="language-options" role="group" aria-label="${languageLabel}"><p>${locale === "en" ? "Language" : "语言"}</p>${languages
    .map((language) => {
      const selected = language.code === locale;
      const href =
        localePath(
          payload.path === "/" ? "/" : payload.path + "/",
          language.code,
        ) + (payload.query ? "?" + payload.query : "");
      return `<a class="language-option" data-language-option ${selected ? 'aria-current="true"' : "data-language-switch"} href="${templates.esc(href)}" hreflang="${language.code}" lang="${language.code}"><span class="language-code">${language.short}</span><span>${language.label}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></a>`;
    })
    .join("")}</div></details>`;
  const header = finalize(templates.header(), true).replace(
    '<div class="header-actions">',
    '<div class="header-actions">' + switcher,
  );
  const footer = finalize(templates.footer(), true);
  const content = finalize(markup, true);
  return {
    header,
    footer,
    main: content,
    missingTranslations: [...localizer.missing],
    translate: localizer.text,
    modelChoices,
    tray: finalize(templates.tray()),
    socialRow: () => finalize(window.KUGNI_SUBMISSION.socialRow()),
    modelTable: (id) =>
      finalize(templates.sourceModelTable(sites.find((s) => s.id === id))),
    report: (tool) => finalize(window.KUGNI_TOOL_REPORTS.page(tool)),
    templates,
    window,
    finalize,
  };
}
