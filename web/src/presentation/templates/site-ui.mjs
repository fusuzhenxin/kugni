// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
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

  const arrow =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';

  const faq = (meta) =>
    meta.faq?.length
      ? `<section class="site-faq" aria-labelledby="page-faq-heading"><div class="site-section-heading"><span>你可能还想了解</span><h2 id="page-faq-heading">常见问题</h2></div><div>${meta.faq.map(([q, a]) => `<details><summary>${esc(q)}<span aria-hidden="true">＋</span></summary><p>${esc(a)}</p></details>`).join("")}</div></section>`
      : "";

  const contactIcons = {
    github:
      '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.26-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.6 9.6 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65a3.87 3.87 0 0 1 1.03 2.69c0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
    telegram:
      '<path fill="currentColor" stroke="none" d="m21 4-3 16c-.1.8-.7 1-1.3.6l-4.6-3.4-2.2 2.1c-.2.3-.5.4-.8.4l.3-4.7 8.5-7.7c.4-.3-.1-.5-.6-.2L6.8 13.7l-4.5-1.4c-.9-.3-.9-.9.2-1.3L20 4c.7-.3 1.3.1 1 .9Z"/>',
    rss: '<path d="M5 4a15 15 0 0 1 15 15M5 10a9 9 0 0 1 9 9"/><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
  };

  const contactIcon = (kind) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${contactIcons[kind] || '<path d="M4 5h16v14H4zM4 5l8 7 8-7"/>'}</svg>`;

  function assistantLinks(brandIcon) {
    const config = window.KUGNI_CONFIG;
    const question = `KUGNI（${config.url}）是什么？请介绍它收录的 AI API 中转站、模型、公开价格和支付信息，并说明资料来源与采集时间。请先查看 ${config.url}/llms.txt、${config.url}/stations.md 和 ${config.url}/methodology.md，再引用具体页面。没有记录或未检测的内容请说明未知，不要把演示分数当作真实检测。`;
    return config.assistants
      .map(
        ([name, brand, url]) =>
          `<a href="${esc(url + encodeURIComponent(question))}" target="_blank" rel="noopener noreferrer" aria-label="用 ${name} 了解 KUGNI" title="用 ${name} 了解 KUGNI">${brand === "Perplexity" ? '<img class="brand-icon" src="assets/brands/perplexity.svg" alt="" width="20" height="20">' : brandIcon(brand)}</a>`,
      )
      .join("");
  }

  function footer(brand, brandIcon) {
    const config = window.KUGNI_CONFIG,
      contact = config.contact;
    const groups = [
      [
        "导航",
        [
          ["首页", "#/"],
          ["站点排行", "#/sites"],
          ...config.categories.map((category) => [
            category.name,
            "#/sites/" + category.slug,
          ]),
          ["模型大全", "#/models"],
          ["API 价格对比", "#/prices"],
          ["模型套餐", "#/coding-plans"],
          ["申请收录", "#/submit"],
          ["福利广场", "#/benefits"],
        ],
      ],
      [
        "热门模型",
        [
          ["OpenAI / GPT", "#/model/gpt"],
          ["Claude", "#/model/claude"],
          ["Gemini", "#/model/gemini"],
          ["DeepSeek", "#/model/deepseek"],
          ["基础接口检测", "#/check"],
          ["模型指纹测试", "#/check/fingerprint"],
          ["糖果测试", "#/check/candy"],
        ],
      ],
      [
        "参与",
        [
          ["开发者与 AI 接入", "#/developers"],
          ["检测历史", "#/check/history"],
          ["我的积分", "#/account/points"],
          ["我的提交", "#/account/submissions"],
          ["我的收藏", "#/saved"],
          ["站点对比", "#/compare"],
          ["评测方法", "#/methodology"],
          ["评分说明", "#/scoring"],
        ],
      ],
      [
        "联系我们",
        [
          ["关于 KUGNI", "#/about"],
          ["联系我们", "#/contact"],
          ["商务合作", "#/sponsor"],
        ],
      ],
      [
        "法律",
        [
          ["隐私说明", "#/privacy"],
          ["服务条款", "#/terms"],
          ["免责声明", "#/disclaimer"],
        ],
      ],
    ];
    const open = matchMedia("(min-width:761px)").matches ? " open" : "";
    return `<div class="site-footer"><div class="container"><div class="site-footer-grid"><div class="site-footer-brand">${brand}<nav class="site-footer-socials" aria-label="社交与订阅">${[
      ["github", "GitHub", contact.github],
      ["telegram", "Telegram", contact.telegram],
      ["rss", "站点动态 RSS", contact.rss],
    ]
      .map(
        ([kind, label, url]) =>
          `<a href="${esc(url)}" aria-label="${label}" title="${label}" ${kind !== "rss" ? 'target="_blank" rel="noopener noreferrer"' : ""}>${contactIcon(kind)}</a>`,
      )
      .join(
        "",
      )}</nav><small>© ${new Date().getFullYear()} KUGNI · <a href="${config.url}">www.kugni.com</a></small></div>${groups.map(([label, links]) => `<details class="site-footer-group"${open}><summary>${label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><nav aria-label="页脚${label}">${links.map(([text, url]) => `<a href="${url}">${text}</a>`).join("")}</nav></details>`).join("")}</div><div class="site-footer-resources"><nav aria-label="公开资料"><a href="/llms.txt">llms.txt</a><a href="/stations.md">stations.md</a><a href="/methodology.md">methodology.md</a><a href="/sitemap.xml">站点地图</a></nav><nav class="site-footer-models" aria-label="向 AI 了解本站">${assistantLinks(brandIcon)}</nav></div></div></div>`;
  }

  function documentPage(type) {
    const meta = window.KUGNI_CONTENT.pages["/" + type],
      sections = window.KUGNI_CONTENT.documents[type];
    return `<article class="site-document"><header class="site-page-heading"><span>KUGNI · ${type === "contact" ? "联系与反馈" : "资料与说明"}</span><h1>${esc(type === "about" ? "关于 KUGNI" : type === "contact" ? "联系与反馈" : meta.title.split("：")[0])}</h1><p>${esc(meta.description)}</p></header>${type === "contact" ? contactCards() : ""}<div class="site-document-sections">${sections.map(([title, text], i) => `<section><span class="site-section-number">${String(i + 1).padStart(2, "0")}</span><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></section>`).join("")}</div><nav class="site-related" aria-label="继续了解"><a href="#/guide">接入指南 ${arrow}</a><a href="#/methodology">评测方法 ${arrow}</a><a href="#/sponsor">商务合作 ${arrow}</a></nav></article>`;
  }

  function contactCards() {
    const contact = window.KUGNI_CONFIG.contact;
    return `<section class="business-contacts" aria-labelledby="business-contact-heading"><div class="business-section-title"><h2 id="business-contact-heading">联系方式</h2><span>任选一种即可</span></div><div class="business-contact-grid"><a class="business-contact-card" href="mailto:${esc(contact.email)}"><span class="business-contact-icon">${contactIcon("email")}</span><div><span>邮箱</span><strong>${esc(contact.email)}</strong></div><span class="business-contact-action">发邮件 ↗</span></a><div class="business-contact-card"><span class="business-contact-icon business-qq">Q</span><div><span>QQ</span><strong>${esc(contact.qq)}</strong></div><button class="business-contact-action" type="button" data-contact-copy="${esc(contact.qq)}">复制</button></div><a class="business-contact-card" href="${esc(contact.telegram)}" target="_blank" rel="noopener noreferrer"><span class="business-contact-icon">${contactIcon("telegram")}</span><div><span>Telegram</span><strong>${esc(contact.telegramName)}</strong></div><span class="business-contact-action">打开 ↗</span></a></div><p id="contact-status" role="status" aria-live="polite"></p></section>`;
  }

  function business() {
    return `<article class="site-business"><header class="site-page-heading"><span>合作与联系</span><h1>商务合作</h1><p>广告投放、内容合作、中转站收录，以及其他与大模型服务相关的合作。请通过以下任一方式联系我们，并附上品牌或站点名称、合作方向和相关链接。</p></header>${contactCards()}<section class="business-options" aria-labelledby="business-options-heading"><div class="business-section-title"><div><span>可以怎么合作</span><h2 id="business-options-heading">合作方式</h2></div></div><div>${[
      [
        "广告投放",
        "面向正在比较中转站、模型和 API 服务的用户进行品牌展示。广告内容会标明赞助。",
      ],
      [
        "站点收录",
        "提交你的中转站，补充模型、价格和支付方式。收录不收取影响排名的费用。",
      ],
      [
        "数据与内容",
        "方法说明、榜单摘录和模型监测，适合写进文档或社区帖。请保留出处。",
      ],
    ]
      .map(
        ([title, text], i) =>
          `<section><span>0${i + 1} / 03</span><h3>${title}</h3><p>${text}</p>${i === 1 ? '<a href="#/submit">申请收录 ' + arrow + "</a>" : ""}</section>`,
      )
      .join("")}</div></section></article>`;
  }
  window.KUGNI_SITE = { footer, faq, documentPage, business, contactCards };
  return window.KUGNI_SITE;
}
