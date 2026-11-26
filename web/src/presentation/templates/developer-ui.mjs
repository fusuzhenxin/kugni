// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const esc = (v) =>
    String(v).replace(
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

  const icon = (body) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;

  const glyphs = {
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    search:
      '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
    shield:
      '<path d="m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Z"/><path d="m8 11 3 3 5-5"/>',
    models: '<path d="m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5"/>',
    prices: '<path d="M4 3v18h17M8 16v-4m5 4V8m5 8V4"/>',
    report:
      '<rect x="4" y="3" width="16" height="19" rx="2"/><path d="m8 10 2 2 5-5m-7 9h8"/>',
    source:
      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M8 3 6 1m10 2 2-2"/>',
    document: '<path d="M14 2H5v20h14V7Zm0 0v5h5M8 11h8m-8 4h8m-8 4h4"/>',
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
    cursor: '<path d="M5 2 21 13l-8 1-4 8Z"/><path d="m13 14 4 7"/>',
  };

  const clients = [
    ["Codex", "openai", "OpenAI"],
    ["Claude Code", "claude", "Anthropic"],
    ["Gemini CLI", "gemini", "Google"],
    ["Cursor", "cursor", "AI 代码编辑器"],
  ];

  const examples = [
    [
      "找合适的站点",
      "用 KUGNI 找出支持 Claude、可以用支付宝付款的站点。",
      "根据 KUGNI 的站点快照，找出支持 Claude 生态且支持支付宝的服务商，列出页面链接和数据日期。",
      "blue",
      "search",
    ],
    [
      "核对一个站点",
      "帮我查查 aruhub 的模型覆盖、支付方式和退款说明。",
      "用 KUGNI 核对 aruhub.com 的公开资料，列出模型生态、支付方式、退款说明，以及尚未检测的内容。",
      "teal",
      "shield",
    ],
    [
      "看模型覆盖",
      "用 KUGNI 看看 OpenAI、Claude、Gemini 都有哪些收录站点支持。",
      "根据 KUGNI 的模型生态索引，比较 OpenAI、Claude、Gemini、DeepSeek 的来源收录覆盖情况。",
      "purple",
      "models",
    ],
    [
      "查公开报价",
      "查一下指定模型的公开分组报价，保留倍率和计费单位。",
      "读取 KUGNI 公开分组报价，找出包含我指定模型 ID 的原始行；保留分组、倍率和单位，不比较单位不明的价格。",
      "amber",
      "prices",
    ],
    [
      "读懂一份测试报告",
      "糖果测试、模型指纹，分别能测出什么？",
      "根据 KUGNI 的评测与评分说明，解释基础检测、糖果测试、模型指纹分别能说明什么。",
      "rose",
      "report",
    ],
    [
      "了解数据来源",
      "这些资料采集于什么时候？哪些是来源记录，哪些还没有检测？",
      "查看 KUGNI 的数据日期和来源，区分来源可用率快照、本地演示分数与尚未检测的模型身份。",
      "teal",
      "source",
    ],
  ];

  const datasets = [
    [
      "站点资料",
      "/data/v1/stations.json",
      "模型生态、支付方式与公开政策",
      "search",
      "blue",
    ],
    [
      "模型生态",
      "/data/v1/models.json",
      "四类模型生态，对应收录站点",
      "models",
      "purple",
    ],
    [
      "公开报价",
      "/data/v1/pricing.json",
      "分组、倍率与来源原始计费文字",
      "prices",
      "amber",
    ],
    [
      "评测方法",
      "/data/v1/methodology.json",
      "评分口径、证据与结果解释",
      "shield",
      "teal",
    ],
  ];

  const skills = [
    [
      "kugni-find-relay",
      "帮你找站点",
      "按模型生态、支付和预算要求，整理带来源的候选。",
      "search",
      "blue",
    ],
    [
      "kugni-check-relay",
      "帮你核对资料",
      "输入名称或域名，了解站点公开政策与未检测项。",
      "shield",
      "teal",
    ],
  ];

  const resources = [
    ["/agent-kit/install.md", "接入指南"],
    ["/agent-kit/manifest.json", "接入清单"],
    ["/llms.txt", "文档索引"],
    ["/llms-full.txt", "完整说明"],
    ["/stations.md", "站点说明"],
    ["/pricing.md", "价格说明"],
    ["/methodology.md", "评测方法"],
    ["/about.md", "关于 KUGNI"],
  ];

  const endpoint = (path) => window.KUGNI_CONFIG.url + path;

  const prompt = (client) =>
    `请在 ${client} 中阅读 KUGNI 接入说明：${endpoint("/agent-kit/install.md")}。按我的问题读取只读 JSON 快照；引用时保留 dataAsOf、source 与站点链接。`;

  const copyButton = (value, label = "复制") =>
    `<button type="button" class="developer-copy" data-developer-copy="${esc(value)}">${icon(glyphs.copy)}<span>${label}</span></button>`;

  const clientMark = (brand) =>
    brand === "cursor"
      ? `<span class="developer-client-mark developer-cursor">${icon(glyphs.cursor)}</span>`
      : `<img class="developer-client-mark${brand === "openai" ? " developer-monochrome" : ""}" src="/assets/brands/${brand}.svg" alt="" width="32" height="32">`;

  const heading = (number, title, text) =>
    `<header class="developer-section-heading"><span class="developer-section-number">${number}</span><div><h2>${title}</h2><p>${text}</p></div></header>`;

  const clientSlug = (name) => name.toLowerCase().replaceAll(" ", "-");

  function artwork(name, width, height, alt = "", eager = false) {
    const load = eager
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy"';
    return (
      '<span class="developer-visual">' +
      ["light", "dark"]
        .map(
          (theme) =>
            '<img class="developer-visual-' +
            theme +
            '" src="/assets/illustrations/developers/' +
            name +
            "-" +
            theme +
            '.webp" width="' +
            width +
            '" height="' +
            height +
            '" alt="' +
            esc(alt) +
            '" ' +
            load +
            ' decoding="async">',
        )
        .join("") +
      "</span>"
    );
  }

  function installCommand(name, shell) {
    const remote = endpoint("/agent-kit/skills/" + name + "/SKILL.md");
    return shell === "powershell"
      ? `$skillDir = Join-Path $HOME '.agents/skills/${name}'\nNew-Item -ItemType Directory -Force -Path $skillDir | Out-Null\nInvoke-WebRequest -Uri '${remote}' -OutFile (Join-Path $skillDir 'SKILL.md')`
      : `mkdir -p ~/.agents/skills/${name} && curl -fsSL ${remote} -o ~/.agents/skills/${name}/SKILL.md`;
  }

  function page() {
    const pictures = [
      "find",
      "station",
      "models",
      "pricing",
      "reports",
      "sources",
    ];
    return `<article class="developer-page">
  <header class="developer-intro"><span class="developer-eyebrow">KUGNI DEVELOPERS</span><h1>开发者与 <em>AI Agent</em> 接入</h1><p>让你常用的 AI 帮你找站点、看模型、查公开报价。选好客户端，把接入说明发给它，就能开始。</p><div class="developer-badges"><span>只读 · 无需密钥</span><span>公开快照 ${window.KUGNI_CONFIG.sourceDate}</span></div></header>
  <section class="developer-section developer-connect" id="developer-connect">
   ${heading("01", "接入你的 AI 客户端", "支持读取网页的 Agent，可直接使用 KUGNI 的公开资料。")}
   <div class="developer-onboarding">
    <div class="developer-client-visual" id="developer-selected-visual">${artwork("client-codex", 640, 400, "Codex 客户端标识配图", true)}</div>
    <div class="developer-setup">
     <div class="developer-clients" id="developer-client" role="group" aria-label="选择 AI 客户端">${clients.map(([name, brand], i) => `<button type="button" data-developer-client="${name}" aria-pressed="${i === 0}" aria-controls="developer-connection">${clientMark(brand)}<strong>${name}</strong></button>`).join("")}</div>
     <div class="developer-connection" id="developer-connection"><div class="developer-connection-heading"><span>让 <b id="developer-current-client">Codex</b> 读取 KUGNI 资料</span><span id="developer-install-copy">${copyButton(prompt(clients[0][0]), "复制接入说明")}</span></div><p id="developer-install-prompt" class="developer-prompt">${esc(prompt(clients[0][0]))}</p></div>
     <details class="developer-manual"><summary>手动接入与 MCP 状态 <span>+</span></summary><div><p>将 <a href="/agent-kit/install.md" target="_blank" rel="noopener">接入指南</a> 发给 Agent，或直接读取下面的 JSON 资料。当前提供静态快照、文档与查询 Skills；远程 MCP 尚未接入。</p></div></details>
    </div>
   </div>
  </section>
  <section class="developer-section">
   ${heading("02", "接入后，可以这样问", "复制一个问题，发给你的 AI。也可以换成你关心的模型或站点。")}
   <div class="developer-examples">${examples.map(([title, question, text], i) => `<article>${artwork("example-" + pictures[i], 1200, 240)}<div class="developer-example-body"><header><h3>${title}</h3>${copyButton(text, "复制问题")}</header><p>${question}</p></div></article>`).join("")}</div>
   <p class="developer-image-note">配图为站内界面示意；来源指标与示例报告请以对应页面说明为准。</p>
  </section>
  <section class="developer-section">
   ${heading("03", "能查到哪些资料？", "四份只读 JSON，带上来源和日期，方便继续核对。")}
   <div class="developer-datasets">${datasets.map(([name, path, description, glyph, tone]) => `<a href="${path}" target="_blank" rel="noopener" data-tone="${tone}"><span class="developer-dataset-name">${icon(glyphs[glyph])}<strong>${name}</strong></span><p>${description}</p><span class="developer-dataset-link"><code>${path.replace("/data/v1/", "")}</code>${icon(glyphs.arrow)}</span></a>`).join("")}</div>
   <p class="developer-data-note">资料版本 <code>v1</code> · 非实时监测；未检测和未公开的字段保持未知。</p>
  </section>
  <section class="developer-section">
   <div class="developer-heading-row">${heading("04", "把常用查询装成 Skill", "经常找站点、核对资料时，可以安装对应的查询技能。")}<label class="developer-shell">安装方式<select id="developer-shell"><option value="powershell">Windows PowerShell</option><option value="shell">macOS / Linux</option></select></label></div>
   <div class="developer-skills">${skills.map(([name, title, description, glyph, tone]) => `<article data-tone="${tone}"><header><span class="developer-skill-icon">${icon(glyphs[glyph])}</span><div><h3>${title}</h3><code>${name}</code></div></header><p>${description}</p><div class="developer-skill-actions"><a href="/agent-kit/skills/${name}/SKILL.md" target="_blank" rel="noopener">查看 SKILL.md ${icon(glyphs.arrow)}</a></div><details class="developer-skill-install"><summary>查看安装命令 <span>+</span></summary><div class="developer-command" data-developer-skill="${name}"><pre>${esc(installCommand(name, "powershell"))}</pre>${copyButton(installCommand(name, "powershell"), "复制命令")}</div></details></article>`).join("")}</div>
   <p class="developer-data-note">默认目录 <code>~/.agents/skills/</code>，请按客户端支持情况放置；页面不会自动修改本机配置。</p>
  </section>
  <details class="developer-documentation"><summary><span>${icon(glyphs.document)}开发文档与机器可读入口</span><span>查看全部资料 +</span></summary><div class="developer-documentation-body"><nav class="developer-resources" aria-label="机器可读文档">${resources.map(([path, label]) => `<a href="${path}" target="_blank" rel="noopener"><strong>${label}</strong><code>${path}</code>${icon(glyphs.arrow)}</a>`).join("")}</nav><p class="developer-data-note">引用时保留数据日期与出处。模型生态覆盖不等于具体型号可用；倍率不等于 Token 单价。未检测、空值和本地示例不能作为模型身份或服务质量保证。</p></div></details>
  <p id="developer-status" class="developer-status" role="status" aria-live="polite"></p><label class="developer-copy-fallback" hidden>请手动复制<textarea readonly></textarea></label>
 </article>`;
  }

  function selectClient(button) {
    const name = button.dataset.developerClient;
    document
      .querySelectorAll("[data-developer-client]")
      .forEach((node) =>
        node.setAttribute("aria-pressed", String(node === button)),
      );
    document.getElementById("developer-current-client").textContent = name;
    document.getElementById("developer-selected-visual").innerHTML = artwork(
      "client-" + clientSlug(name),
      640,
      400,
      name + " 客户端标识配图",
      true,
    );
    document.getElementById("developer-install-prompt").textContent =
      prompt(name);
    document.getElementById("developer-install-copy").innerHTML = copyButton(
      prompt(name),
      "复制接入说明",
    );
  }

  let copyTimer;

  function resetFeedback() {
    clearTimeout(copyTimer);
    const status = document.getElementById("developer-status");
    if (status) status.textContent = "";
  }
  window.KUGNI_DEVELOPERS = {
    page,
    artwork,
    clientSlug,
    prompt,
    copyButton,
    installCommand,
  };
  return window.KUGNI_DEVELOPERS;
}
