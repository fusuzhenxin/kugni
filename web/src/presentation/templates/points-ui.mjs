// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  let ctx,
    tab = window.view.pointsTab || "tasks",
    recordFilter = window.view.recordFilter || "all",
    taskFilter = window.view.taskFilter || "all";

  const day = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const stamp = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

  const paths = {
    calendar:
      '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v5m8-5v5M4 11h16m-11 5 2 2 4-4"/>',
    monitor:
      '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-5-11h3l2-3 2 6 2-3h2"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="2"/><path d="M5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 4-3Zm0 0h4a3 3 0 1 0-4-3Z"/>',
    chat: '<path d="M4 4h16v13H9l-5 4Z"/><path d="M8 8h8m-8 4h5"/>',
    link: '<path d="m10 8 3-3a5 5 0 0 1 7 7l-3 3m-3 1-3 3a5 5 0 0 1-7-7l3-3m2 6 6-6"/>',
    document: '<path d="M5 3h10l4 4v14H5Zm10 0v5h4M8 12h8m-8 4h6"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    saved: '<path d="M6 3h12v19l-6-4-6 4Z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 8v8m-3-6h5a1.5 1.5 0 0 1 0 3h-4m0 0h4a1.5 1.5 0 0 1 0 3h-5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  };

  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.gift}</svg>`;

  const esc = (value) => ctx.esc(value),
    n = (value) => Number(value).toLocaleString("zh-CN");

  const walletKey = (c) =>
    "member.points." +
    encodeURIComponent(
      String(c.state.user?.id || c.state.user?.email || "guest"),
    );

  const validWallet = (d) =>
    d &&
    Array.isArray(d.records) &&
    Number.isFinite(d.balance) &&
    d.balance >= 0;

  function data() {
    return (
      window.member.points || {
        balance: 0,
        records: [],
        tasks: [],
        rewards: [],
        lastCheckin: "",
        proof: {},
      }
    );
  }

  function bind(c) {
    ctx = c;
  }

  const tasks = [
    {
      id: "checkin",
      group: "daily",
      title: "每日签到",
      description: "每天签到一次，积攒一点新发现",
      points: 5,
      icon: "calendar",
      daily: true,
      ready: () => true,
    },
    {
      id: "daily-check",
      group: "daily",
      title: "每日检测",
      description: "完成一次基础检测，再回来领取积分",
      points: 3,
      icon: "monitor",
      daily: true,
      href: "#/check",
      ready: (d) => d.proof.checkDay === day(),
    },
    {
      id: "browse-benefits",
      group: "daily",
      title: "浏览福利",
      description: "看看福利广场有哪些新用户礼遇",
      points: 2,
      icon: "gift",
      daily: true,
      href: "#/benefits",
      ready: (d) => d.proof.benefitsDay === day(),
    },
    {
      id: "review",
      group: "advanced",
      title: "发表点评",
      description: "分享真实使用感受，审核通过后奖励",
      points: 8,
      icon: "chat",
      href: "#/sites",
      verified: true,
    },
    {
      id: "invite",
      group: "advanced",
      title: "邀请好友",
      description: "好友通过专属链接注册，核验后奖励",
      points: 50,
      icon: "link",
      href: "#/account/invite",
      verified: true,
    },
    {
      id: "contribute",
      group: "advanced",
      title: "贡献站点",
      description: "提交完整站点资料，收录通过后奖励",
      points: 20,
      icon: "document",
      href: "#/submit",
      verified: true,
    },
    {
      id: "community",
      group: "basic",
      title: "加入官方社群",
      description: "关注官方社群，第一时间了解活动",
      points: 5,
      icon: "user",
      coming: true,
    },
    {
      id: "profile",
      group: "basic",
      title: "完善资料",
      description: "设置你的昵称与头像，让大家认识你",
      points: 5,
      icon: "user",
      href: "#/account/settings",
      ready: () =>
        Boolean(ctx.state.user?.name?.trim() && ctx.state.user?.avatar),
    },
    {
      id: "first-check",
      group: "basic",
      title: "完成首次检测",
      description: "完成第一次基础检测，开启探索",
      points: 5,
      icon: "monitor",
      href: "#/check",
      ready: (d) => Boolean(d.proof.firstCheck),
    },
    {
      id: "first-saved",
      group: "basic",
      title: "首次收藏",
      description: "收藏一家感兴趣的服务商，方便下次找到",
      points: 3,
      icon: "saved",
      href: "#/sites",
      ready: () => ctx.state.saved.length > 0,
    },
  ];

  const rewards =
    window.member.points?.rewards
      ?.filter((r) => r.status === "启用")
      .map((r) => ({
        ...r,
        title: r.name,
        brand: r.brand || "GPT",
        description: r.description || "",
        unit: "积分权益",
      })) || [];

  const taskKey = (t) =>
    t.id === "checkin"
      ? "sign-" + day()
      : "task-" + t.id + (t.daily ? "-" + day() : "");

  const claimed = (t, d) =>
    t.id === "checkin"
      ? d.lastCheckin === day()
      : d.records.some((r) => r.id === taskKey(t));

  function taskStatus(t, d) {
    return (
      window.member.points?.tasks?.find((x) => x.id === t.id)?.status || "go"
    );
  }

  const groupLabels = { daily: "日常", basic: "基础", advanced: "进阶" };

  function taskRow(t, d) {
    const status = taskStatus(t, d);
    let action;
    if (status === "done")
      action = `<span class="points-task-state is-done">${icon("check")}已完成</span>`;
    else if (status === "coming")
      action = '<span class="points-task-state">敬请期待</span>';
    else if (!ctx.state.user)
      action = '<a class="points-task-button" href="#/login">去登录</a>';
    else if (status === "claim")
      action = `<button type="button" class="points-task-button" ${t.id === "checkin" ? 'data-member-action="checkin"' : `data-points-claim="${t.id}"`}>${t.id === "checkin" ? "去签到" : "领取积分"}</button>`;
    else
      action = `<a class="points-task-button" href="${t.href}">${status === "verify" ? (t.id === "review" ? "去点评" : t.id === "invite" ? "去邀请" : "去提交") : "去完成"}</a>`;
    return `<article class="points-task" data-points-task="${t.id}"><div class="points-task-main"><span class="points-task-icon tone-${t.group}">${icon(t.icon)}</span><div class="points-task-copy"><h3>${t.title}<span class="points-mobile-type">${groupLabels[t.group]}任务</span></h3><p>${t.description}</p></div></div><span class="points-task-type">${groupLabels[t.group]}任务</span><span class="points-task-reward">+${t.points}<small>积分</small></span><div class="points-task-action">${action}</div></article>`;
  }

  function taskPanel(d) {
    const filters = [
        ["all", "全部任务"],
        ["daily", "日常"],
        ["basic", "基础"],
        ["advanced", "进阶"],
      ],
      rows = tasks.filter(
        (t) => taskFilter === "all" || t.group === taskFilter,
      );
    return `<div class="points-board-heading"><h2>赚取积分 <span>从小小的参与开始</span></h2><div class="points-task-filters" role="group" aria-label="任务类型">${filters.map(([id, label]) => `<button type="button" data-points-task-filter="${id}" aria-pressed="${taskFilter === id}">${label}<span>${tasks.filter((t) => id === "all" || t.group === id).length}</span></button>`).join("")}</div></div><div class="points-task-table"><div class="points-task-table-head" aria-hidden="true"><span>任务</span><span>类型</span><span>奖励</span><span>操作</span></div><div class="points-task-list">${rows.map((t) => taskRow(t, d)).join("")}</div></div><p class="points-reset-note">${icon("clock")}日常任务每天 00:00 更新 · 进阶任务核验后发放奖励</p>`;
  }

  const redemptionKey = (r) => "redeem-" + r.id + "-" + day();

  function exchangePanel(d) {
    return `<header class="points-panel-heading"><div><h2>把积分，换成新的体验。</h2><p>选择一份权益，查看兑换条件与所需积分。</p></div><span>限兑次数与库存以各权益配置为准</span></header><div class="points-reward-grid">${rewards
      .map((r) => {
        const used =
            (window.member.points?.redemptions || []).filter(
              (x) => x.rewardId === r.id && x.day === day(),
            ).length >= Number(r.dailyLimit || 1),
          afford = d.balance >= r.cost && Number(r.stock) > 0;
        return `<article class="points-reward-card"><div class="points-reward-mark">${ctx.brandIcon(r.brand)}</div><span class="points-reward-type">${r.unit}</span><h3>${r.title}</h3><p>${r.description}</p><div class="points-reward-footer"><strong>${icon("coin")}${r.cost}<small>积分</small></strong><button type="button" class="points-task-button" data-points-redeem="${r.id}" ${ctx.state.user && (!afford || used) ? "disabled" : ""}>${!ctx.state.user ? "登录兑换" : used ? "今日已兑换" : afford ? "立即兑换" : "积分不足"}</button></div></article>`;
      })
      .join(
        "",
      )}</div>${(window.member.points?.redemptions || []).length ? `<section class="points-recent"><header><h2>我的兑换权益</h2></header>${window.member.points.redemptions.map((r) => `<details class="points-delivery"><summary><strong>${esc(r.name)}</strong><span>${esc(r.status)}</span></summary><p>${esc(r.fulfillment || "平台处理中，发放后会在这里显示权益。")}</p>${r.expires ? `<small>有效期至 ${esc(r.expires)}</small>` : ""}</details>`).join("")}</section>` : ""}<p class="points-preview-note">${icon("info")}自动发码权益兑换成功即可查看；人工发放权益按平台处理进度交付。</p>${
      d.records.some((r) => r.kind === "redeem")
        ? `<section class="points-recent"><header><h2>我的兑换</h2><button type="button" data-points-records>查看全部明细 ${icon("arrow")}</button></header>${d.records
            .filter((r) => r.kind === "redeem")
            .slice(-3)
            .reverse()
            .map(
              (r) =>
                `<article><span class="points-record-icon">${icon("gift")}</span><div><strong>${esc(r.title)}</strong><p>${esc(r.date)}</p></div><span class="points-task-state is-done">已兑换</span></article>`,
            )
            .join("")}</section>`
        : ""
    }`;
  }

  function recordsPanel(d) {
    const rows = d.records
      .slice()
      .reverse()
      .filter(
        (r) =>
          recordFilter === "all" ||
          (recordFilter === "earned" ? r.amount >= 0 : r.amount < 0),
      );
    return `<div class="points-record-controls"><div class="points-record-filters" role="group" aria-label="积分明细筛选">${[
      ["all", "全部记录"],
      ["earned", "获得积分"],
      ["spent", "消耗积分"],
    ]
      .map(
        ([id, label]) =>
          `<button type="button" data-points-filter="${id}" aria-pressed="${recordFilter === id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><span>${rows.length} 条记录</span></div><div class="points-record-list">${rows.length ? rows.map((r) => `<article><span class="points-record-icon ${r.amount < 0 ? "is-spent" : ""}">${icon(r.amount < 0 ? "gift" : "coin")}</span><div><strong>${esc(r.title)}</strong><p>${esc(r.detail)}</p><time datetime="${esc(String(r.date).replace(" ", "T"))}">${esc(r.date)}</time></div><b class="${r.amount < 0 ? "is-spent" : ""}">${r.amount > 0 ? "+" : ""}${n(r.amount)}</b><time>${esc(r.date)}</time></article>`).join("") : '<div class="points-empty">' + icon("document") + "<h3>还没有这类积分记录</h3><p>完成任务或兑换权益后，记录会显示在这里。</p></div>"}</div>`;
  }

  function overview(d, logged) {
    const daily = tasks.filter((t) => t.daily),
      completed = logged ? daily.filter((t) => claimed(t, d)).length : 0,
      earned = logged
        ? d.records
            .filter((r) => r.amount > 0 && r.date?.startsWith(day()))
            .reduce((sum, r) => sum + r.amount, 0)
        : 0;
    return `<section class="points-summary" aria-label="积分概览"><div class="points-wallet"><span class="points-wallet-mark">${icon("coin")}</span><div><span class="points-summary-label">可用积分</span><div class="points-wallet-value"><strong data-points-balance>${logged ? n(d.balance) : "—"}</strong><small>积分</small></div></div></div><div class="points-today"><div class="points-today-heading"><span class="points-summary-label">今日任务</span><strong class="points-progress">${completed}<small> / ${daily.length}</small></strong></div><div class="points-progress-track" role="progressbar" aria-label="今日任务完成进度" aria-valuemin="0" aria-valuemax="${daily.length}" aria-valuenow="${completed}">${daily.map((_, i) => `<span class="${i < completed ? "is-complete" : ""}"></span>`).join("")}</div><span class="points-today-earned">今日获得 <b>+${n(earned)}</b> 积分</span></div><button type="button" class="points-exchange-link" data-points-tab="exchange"><span class="points-exchange-icon">${icon("gift")}</span><span><strong>发现积分好礼</strong><small>20 积分起，兑换更多体验</small></span>${icon("arrow")}</button></section>`;
  }

  function page(c) {
    bind(c);
    const d = data(),
      logged = Boolean(c.state.user);
    return `<div class="container points-page"><nav class="points-breadcrumb" aria-label="当前位置"><a href="#/account">个人中心</a><span>/</span><span>积分中心</span></nav><header class="points-heading"><div><h1>积分中心</h1><p>每一点积累，都能换来新的发现。</p></div><button type="button" class="points-rules-link" data-points-rules>${icon("info")}积分规则</button></header>${overview(d, logged)}<div class="points-navigation"><div class="points-tabs" role="tablist" aria-label="积分中心">${[
      ["tasks", "赚取积分", "calendar"],
      ["exchange", "兑换好礼", "gift"],
      ["records", "收支明细", "document"],
    ]
      .map(
        ([id, label, glyph]) =>
          `<button type="button" id="points-tab-${id}" role="tab" aria-controls="points-panel" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-points-tab="${id}">${icon(glyph)}${label}</button>`,
      )
      .join(
        "",
      )}</div><span>探索 · 参与 · 收获</span></div><section id="points-panel" class="points-panel" role="tabpanel" aria-labelledby="points-tab-${tab}">${!logged ? `<div class="points-guest">${icon("user")}<span>登录后领取任务积分，查看你的兑换与明细。</span><a href="#/login">去登录 ${icon("arrow")}</a></div>` : ""}${tab === "tasks" ? taskPanel(d) : tab === "exchange" ? exchangePanel(d) : logged ? recordsPanel(d) : '<div class="points-empty"><h3>登录后查看积分记录</h3><p>你的每一笔获得与消耗，都会记录在这里。</p></div>'}</section><p class="points-local-note">${icon("info")}任务与积分以账户记录为准。自动发码权益在兑换成功后即可查看；人工发放权益可查看后台处理进度。</p></div>`;
  }

  function needLogin() {
    if (ctx.state.user) return false;
    window.KUGNI_ROUTER.hash = "/login";
    ctx.toast("登录后再参与积分任务与兑换");
    return true;
  }

  function showTab(value, focus = false) {
    if (!["tasks", "exchange", "records"].includes(value)) return;
    tab = value;
    ctx.render();
    if (focus)
      document
        .getElementById("points-tab-" + value)
        ?.focus({ preventScroll: true });
  }
  window.KUGNI_POINTS = { page, data, bind };
  return window.KUGNI_POINTS;
}
