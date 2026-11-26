// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const filters = { category: "all", query: "", brand: "all", order: "source" };
  Object.assign(filters, window.view.benefits || {});

  const categories = [
    ["all", "全部福利"],
    ["signup", "注册赠额"],
    ["recharge", "充值优惠"],
    ["community", "入群加赠"],
  ];

  const editorial = {
    "3-aicodemirror-ai": {
      amount: "8",
      unit: "元",
      label: "注册体验额度",
      tone: "blue",
      categories: ["signup", "recharge"],
      intro: "先用注册额度体验模型调用，充值前再核对线路与计费规则。",
      condition: "新用户注册",
      extra: "来源另载：首充 8 折",
      steps: [
        "前往服务商，查看当前新用户活动。",
        "完成账号注册，按站方规则领取体验额度。",
        "充值前确认首充折扣是否仍有效、适用哪些分组。",
      ],
      quote: "注册即送8元体验额度，同时首充8折。",
    },
    "1852-aruhub-com": {
      amount: "测试额度",
      unit: "金额未说明",
      label: "注册试用礼遇",
      tone: "violet",
      categories: ["signup"],
      intro:
        "用测试额度了解文本、图像和视频模型的接入方式。具体赠送金额由站方说明。",
      condition: "新用户注册",
      extra: "赠额金额需向站方确认",
      steps: [
        "进入服务商页面，核对注册赠额说明。",
        "按活动提示完成注册或必要验证。",
        "确认获赠额度、有效期和可用模型后再开始调用。",
      ],
      quote:
        "注册送测试额度！一个站点通用大语言模型、图像生成模型、视频生成模型。",
    },
    "1354-qiuqiutoken-net": {
      amount: "2",
      unit: "美元",
      label: "新用户试用额度",
      tone: "teal",
      categories: ["signup", "community"],
      intro: "注册赠额与入群加赠分开领取，适合先小额体验，再决定是否继续使用。",
      condition: "新用户注册；加赠需入群",
      extra: "来源另载：入群再赠 5 美元",
      steps: [
        "前往服务商，核实新用户注册赠额。",
        "按规则注册并确认 2 美元试用额度是否到账。",
        "如需入群加赠，另行核对官方社群及领取条件。",
      ],
      quote: "新用户注册即赠 2 美元试用额度，加入用户群再自动赠5美元赠礼。",
    },
    "1383-closedai-kylenqaq-com": {
      amount: "1",
      unit: "美元",
      label: "新人体验额度",
      tone: "rose",
      categories: ["signup", "community"],
      intro:
        "适合想先体验多模型 API 或编程工作流的用户，入群福利内容需单独确认。",
      condition: "新人注册",
      extra: "入群福利：金额未说明",
      steps: [
        "访问服务商，查看新人注册赠额规则。",
        "注册后确认体验额度及允许使用的分组。",
        "如参加入群活动，向站方确认额外福利内容。",
      ],
      quote: "新人注册即赠 1 美元体验额度，入群再领福利！",
    },
    "4659-fluxlane-cn": {
      amount: "2",
      unit: "美元",
      label: "新人注册额度",
      tone: "indigo",
      categories: ["signup"],
      intro: "从一笔体验额度开始，了解服务商的模型线路、用量记录和调用流程。",
      condition: "新人注册",
      extra: "未说明其他领取条件",
      steps: [
        "前往服务商，检查新人赠额活动是否仍在。",
        "完成注册，按站方要求领取试用额度。",
        "确认有效期与适用模型，留意不同线路的计费差异。",
      ],
      quote: "新人注册赠送2美元额度。",
    },
    "1367-wawazz-xyz": {
      amount: "1",
      unit: "美元",
      label: "新用户体验额度",
      tone: "amber",
      categories: ["signup", "recharge"],
      intro: "注册试用和充值加赠是两项不同活动，后者需要满足单笔充值门槛。",
      condition: "新用户注册",
      extra: "另有：单笔满 ¥300 加赠 5%",
      steps: [
        "先核对新用户注册可领取的体验额度。",
        "体验后如需充值，阅读单笔满额加赠规则。",
        "确认人民币充值与美元额度的结算口径，不直接相加比较。",
      ],
      quote:
        "单笔充值满 ¥300，额外赠送 5% 充值额度。新用户注册即送 $1 体验额度。",
    },
    "1455-api-0elog-com": {
      amount: "1",
      unit: "美元",
      label: "注册留言测试额度",
      tone: "sky",
      categories: ["signup", "recharge"],
      intro:
        "测试赠额需要注册后留言邮箱；另有下单优惠，参与方式与结算单位需向站方核对。",
      condition: "注册并留言邮箱",
      extra: "来源另载：下单 10 得 11",
      steps: [
        "查看服务商当前的注册测试活动。",
        "按站方要求注册并留言邮箱，确认获赠测试额度。",
        "另行核对下单优惠的购买入口、单位与适用范围。",
      ],
      quote: "注册留言邮箱送 1 刀测试，小铺下单 10 得 11。",
    },
  };

  function offers(c) {
    return c.sites
      .filter((s) => s.tags.includes("新用户赠额"))
      .map((s) => ({
        s,
        ...(editorial[s.id] || {
          amount: "注册礼遇",
          unit: "金额未说明",
          label: "新用户活动",
          tone: "blue",
          categories: ["signup"],
          intro: "来源已标记新用户赠额，具体规则需向服务商确认。",
          condition: "新用户，条件待确认",
          extra: "未说明",
          steps: ["前往服务商查看当前规则。"],
          quote: s.description || s.desc,
        }),
      }));
  }

  const arrow = (c) => c.icon("arrow");

  function card(c, o) {
    const { s } = o;
    const unknown = o.unit === "金额未说明";
    return `<article class="perk-card perk-${o.tone}" data-perk-id="${s.id}"><div class="perk-card-top">${c.logo(s)}<div class="perk-provider"><h3><a href="#/site/${s.id}">${c.esc(s.name)}</a></h3><span>${c.esc(s.domain)}</span></div>${c.saveBtn(s)}</div>
 <div class="perk-value-row"><div><span class="perk-label">${o.label}</span><p class="perk-amount ${unknown ? "perk-unknown" : ""}">${o.amount}<small>${o.unit}</small></p></div><span class="perk-category">${c.icon("gift")} ${o.categories.includes("community") ? "注册 + 入群" : o.categories.includes("recharge") ? "注册 + 充值" : "注册赠额"}</span></div>
 <p class="perk-intro">${o.intro}</p><div class="perk-conditions"><div>${c.icon("user")}<span><small>参与条件</small><strong>${o.condition}</strong></span></div><div>${c.icon(o.categories.includes("community") ? "chat" : "gift")}<span><small>额外礼遇</small><strong>${o.extra}</strong></span></div></div>
 <div class="perk-models"><div>${s.models
   .slice(0, 6)
   .map((b) => c.brandIcon(b))
   .join(
     "",
   )}</div><span>${s.modelCount} 个来源模型</span><small>有效期未说明</small></div><div class="perk-card-foot"><button type="button" class="perk-detail" data-perk-detail="${s.id}">领取规则 ${arrow(c)}</button><a class="perk-visit" href="${c.esc(s.url)}" target="_blank" rel="noopener noreferrer">前往服务商 ${arrow(c)}</a></div></article>`;
  }

  function list(c) {
    let all = offers(c),
      visible = all.filter(
        (o) =>
          (filters.category === "all" ||
            o.categories.includes(filters.category)) &&
          (filters.brand === "all" || o.s.models.includes(filters.brand)) &&
          `${o.s.name} ${o.s.domain} ${o.intro} ${o.condition} ${o.extra}`
            .toLowerCase()
            .includes(filters.query.toLowerCase().trim()),
      );
    if (filters.order === "coverage")
      visible.sort((a, b) => b.s.modelCount - a.s.modelCount);
    if (filters.order === "recent")
      visible.sort((a, b) =>
        (b.s.listedAt || "").localeCompare(a.s.listedAt || ""),
      );
    return (
      `<div class="perk-result-line" aria-live="polite"><span>共 <strong>${visible.length}</strong> 家福利服务商</span><span>金额按来源币种展示，不折算、不相加</span></div>` +
      (visible.length
        ? `<div class="perk-grid">${visible.map((o) => card(c, o)).join("")}${visible.length % 2 ? `<aside class="perk-reading-card"><span class="perk-reading-eyebrow">BEFORE YOU CLAIM</span><h3>领取之前，先确认这三件事。</h3><ol><li><b>01</b><div><strong>额度可以用在哪些模型？</strong><p>赠额可能只适用指定分组，先看范围，再开始体验。</p></div></li><li><b>02</b><div><strong>是否有有效期或额外门槛？</strong><p>留意验证要求、充值条件与额度过期时间。</p></div></li><li><b>03</b><div><strong>体验以后，实际调用要花多少？</strong><p>把正式单价和用量一起核对，别只看赠送金额。</p></div></li></ol><a href="#/prices">再看看价格怎么比 ${arrow(c)}</a></aside>` : ""}</div>`
        : `<div class="perk-empty">${c.icon("search")}<h3>暂时没有匹配的福利</h3><p>换个名称或模型生态，看看其他活动。</p><button type="button" data-perk-reset>重置筛选 ${arrow(c)}</button></div>`)
    );
  }

  function page(c) {
    const all = offers(c),
      brands = new Set(all.flatMap((o) => o.s.models));
    return `<section class="benefits-page"><header class="perk-hero"><div class="perk-hero-copy"><span class="perk-eyebrow">A LITTLE EXTRA, A BETTER START</span><h1>福利羊毛<span>给你的下一次探索，加点额度。</span></h1><p>发现服务商的新用户赠额、充值优惠与社群礼遇。<br>先了解，再体验，找到适合自己的 API 连接。</p><div class="perk-hero-action"><a href="#/benefits" data-perk-browse>看看有哪些福利 ${arrow(c)}</a><span>${c.icon("gift")} 小额开始，认真体验</span></div></div>${window.KUGNI_PAGE_ART.gift()}</header>
 <div class="perk-overview"><div><strong>${all.length}</strong><span>家福利服务商</span></div><div><strong>3</strong><span>类活动方式</span></div><div><strong>${brands.size}</strong><span>类模型生态</span></div><p>${c.icon("calendar")} 来源快照 ${c.esc(c.source.capturedAt)}<span>当前活动以服务商说明为准</span></p></div>
 <section class="perk-directory" aria-labelledby="perk-directory-title"><div class="perk-section-head"><div><h2 id="perk-directory-title">把福利看清楚，再出发。</h2><p>赠额、条件和参与方式，都放在卡片里。</p></div><span>${c.icon("shield")} 仅整理公开活动，不代领、不保存密钥</span></div>
 <div class="perk-controls"><div class="perk-tabs" aria-label="福利类型">${categories.map(([v, t]) => `<button type="button" data-perk-category="${v}" aria-pressed="${filters.category === v}">${t}<span>${v === "all" ? all.length : all.filter((o) => o.categories.includes(v)).length}</span></button>`).join("")}</div><div class="perk-filter-tools"><label class="perk-search">${c.icon("search")}<input id="perk-search" value="${c.esc(filters.query)}" placeholder="搜索服务商、福利或条件" aria-label="搜索福利"></label><select id="perk-brand" aria-label="筛选福利模型生态"><option value="all">全部模型</option>${c.brands
   .filter((b) => brands.has(b))
   .map(
     (b) =>
       `<option value="${b}" ${filters.brand === b ? "selected" : ""}>${b === "GPT" ? "OpenAI" : b}</option>`,
   )
   .join("")}</select><select id="perk-sort" aria-label="福利排序">${[
   ["source", "来源顺序"],
   ["coverage", "模型数量"],
   ["recent", "最近收录"],
 ]
   .map(
     ([v, t]) =>
       `<option value="${v}" ${filters.order === v ? "selected" : ""}>${t}</option>`,
   )
   .join(
     "",
   )}</select></div></div><div id="perk-results">${list(c)}</div></section>
 <section class="perk-how"><div><span>HOW IT WORKS</span><h2>一份礼遇，三步开始。</h2><p>先确认规则，再决定是否参与。</p></div><div class="perk-how-steps">${[
   ["01", "找到想试的服务商", "查看赠额、支持模型和参与条件。"],
   ["02", "前往站方确认活动", "核对当前有效期、门槛和适用分组。"],
   ["03", "领取后，小额体验", "留意用量记录，再决定后续充值。"],
 ]
   .map(([n, t, d]) => `<div><b>${n}</b><h3>${t}</h3><p>${d}</p></div>`)
   .join(
     "",
   )}</div></section><p class="perk-source-note">${c.icon("info")} 本页使用已保存的公开资料，未实时验证活动是否仍有效；缺失金额与有效期不作推测。不同币种、模型与分组的赠额不可直接比较。</p></section>`;
  }

  function details(c, id) {
    const o = offers(c).find((o) => o.s.id === id);
    if (!o) return;
    const { s } = o;
    c.modal(
      s.name + " · 福利规则",
      `<div class="perk-modal"><div class="perk-modal-amount"><span>${o.label}</span><strong>${o.amount}<small>${o.unit}</small></strong></div><p>${o.intro}</p><h3>如何参与</h3><ol>${o.steps.map((t) => `<li>${t}</li>`).join("")}</ol><dl><div><dt>参与条件</dt><dd>${o.condition}</dd></div><div><dt>额外礼遇</dt><dd>${o.extra}</dd></div><div><dt>活动有效期</dt><dd>来源未说明，需向服务商确认</dd></div><div><dt>模型范围</dt><dd>赠额适用分组未说明；站点模型生态不等于赠额可用范围。</dd></div></dl><details><summary>查看来源原文 · ${c.esc(c.source.capturedAt)}</summary><blockquote>${c.esc(o.quote)}</blockquote><a href="${c.esc(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看来源页面 ↗</a></details><div class="perk-modal-actions"><a href="#/site/${s.id}" data-action="close">站点详情 ${arrow(c)}</a><a class="perk-visit" href="${c.esc(s.url)}" target="_blank" rel="noopener noreferrer">前往服务商 ${arrow(c)}</a></div></div>`,
    );
  }
  window.KUGNI_BENEFITS = { page, list, details };
  return window.KUGNI_BENEFITS;
}
