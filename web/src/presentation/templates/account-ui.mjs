// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  let ctx,
    settingsTab = window.view.settingsTab || "profile",
    submissionFilter = window.view.submissionFilter || "all";

  const paths = {
    settings:
      '<path d="m9 3-.6 2.4-2 .9-2.2-.7-2 3.4 1.7 1.7v2.6L2.2 15l2 3.4 2.3-.7 2 .9L9 21h4l.6-2.4 2-.9 2.2.7 2-3.4-1.7-1.7v-2.6l1.7-1.7-2-3.4-2.3.7-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    points:
      '<circle cx="12" cy="12" r="9"/><path d="m12 6 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L8.4 17l.7-4-2.9-2.8 4-.6Z"/>',
    invite:
      '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 4-3Zm0 0h4a3 3 0 1 0-4-3Z"/>',
    saved:
      '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',
    submit: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8m-4-4v8"/>',
    submissions:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    logout: '<path d="M9 3H4v18h5m5-5 4-4-4-4m-6 4h12"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M5 16V9a7 7 0 0 1 14 0v7l2 2H3Zm5 5h4"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  };

  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.arrow}</svg>`;

  const esc = (v) => ctx.esc(v);

  function profile() {
    const u = ctx.state.user;
    return {
      name: u?.name || "探索者",
      email: u?.email || "尚未设置邮箱",
      id: u?.id || "KG10086",
      bio: u?.bio || "",
      avatar: u?.avatar || "",
      joined: u?.joined || "2026-11-20",
    };
  }

  function avatar(size = "") {
    const p = profile(),
      safe = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
        p.avatar,
      );
    return `<span class="member-avatar ${size}">${safe ? `<img src="${p.avatar}" alt="${esc(p.name)} 的头像">` : '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#e2ebff"/><path d="m10 20 2-12 10 7m4 0L36 8l2 12" fill="#8badf3"/><path d="m13 15 1-3 5 5m10 0 5-5 1 4" fill="#f6b8bb"/><ellipse cx="24" cy="28" rx="16" ry="14" fill="#f9fbff"/><path d="M17 25v3m14-3v3" stroke="#3d5685" stroke-width="2.5" stroke-linecap="round"/><path d="m22 31 2 2 2-2m-2 2v2" stroke="#7486a6" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="13" cy="32" rx="3" ry="1.5" fill="#f3c8cc"/><ellipse cx="35" cy="32" rx="3" ry="1.5" fill="#f3c8cc"/></svg>'}</span>`;
  }

  const items = [
    ["settings", "账户设置", "settings"],
    ["points", "我的积分", "points"],
    ["invite", "邀请好友", "invite"],
    ["saved", "我的收藏", "saved"],
    ["submit", "申请收录", "submit"],
    ["submissions", "我的提交", "submissions"],
  ];

  function header(c) {
    ctx = c;
    window.KUGNI_POINTS.bind(c);
    return ctx.state.user
      ? `<div class="member-menu-wrap"><button type="button" class="member-trigger" id="member-menu-trigger" data-member-action="menu" aria-expanded="false" aria-controls="member-dropdown">${avatar()}<span>${esc(profile().name)}</span>${icon("chevron")}</button><div class="member-dropdown" id="member-dropdown" hidden><a class="member-menu-identity" href="#/account">${avatar("medium")}<span><strong>${esc(profile().name)}</strong><small>${esc(profile().email)}</small></span></a><nav aria-label="账户菜单">${items.map(([id, label, glyph]) => `<a href="#/${id === "saved" || id === "submit" ? id : "account/" + id}">${icon(glyph)}<span>${label}</span>${id === "invite" ? "<em>送积分</em>" : ""}</a>`).join("")}</nav><button type="button" class="member-menu-logout" data-member-action="logout">${icon("logout")}退出登录</button></div></div>`
      : `<div class="member-guest"><a href="#/login" class="member-login-link">登录</a><a href="#/register" class="member-button member-register-link">注册</a></div>`;
  }

  function heading(title, desc, action = "") {
    return `<header class="member-heading"><div><span class="member-eyebrow">YOUR KUGNI</span><h1>${title}</h1><p>${desc}</p></div>${action}</header>`;
  }

  function shell(active, body) {
    const p = profile();
    return `<div class="container member-page"><div class="member-breadcrumb"><a href="#/">首页</a><span>/</span><a href="#/account">个人中心</a>${active !== "overview" ? "<span>/</span><span>" + esc(items.find((i) => i[0] === active)?.[1] || "") + "</span>" : ""}</div><div class="member-layout"><aside class="member-sidebar"><a class="member-sidebar-profile" href="#/account">${avatar("large")}<strong>${esc(p.name)}</strong><span>${ctx.state.user ? "ID · " + esc(p.id) : "欢迎来到你的个人空间"}</span><small class="member-preview-label">本地体验</small></a><p class="member-nav-label">个人空间</p><nav aria-label="个人空间"><a href="#/account" ${active === "overview" ? 'aria-current="page"' : ""}>${icon("home")}个人概览</a>${items
      .slice(0, 3)
      .map(
        ([id, label, glyph]) =>
          `<a href="#/account/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(glyph)}${label}${id === "invite" ? "<i>送积分</i>" : ""}</a>`,
      )
      .join("")}<span class="member-nav-label">内容管理</span>${items
      .slice(3)
      .map(
        ([id, label, glyph]) =>
          `<a href="#/${id === "saved" || id === "submit" ? id : "account/" + id}" ${active === id ? 'aria-current="page"' : ""}>${icon(glyph)}${label}</a>`,
      )
      .join(
        "",
      )}</nav><a class="member-sidebar-guide" href="#/guide">${icon("lock")} 连接之前，先了解一下 <span>接入指南 →</span></a></aside><section class="member-main">${body}<p class="member-local-note">${icon("lock")} 当前为前端体验，账户资料与操作仅保存在此浏览器。</p></section></div></div>`;
  }

  function pointData() {
    return window.KUGNI_POINTS.data(ctx);
  }

  function day() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function signed() {
    return pointData().lastCheckin === day();
  }

  function signButton() {
    return `<button type="button" class="member-button" data-member-action="checkin" ${signed() ? "disabled" : ""}>${icon(signed() ? "check" : "points")}${signed() ? "今日已签到" : "每日签到 +5"}</button>`;
  }

  function statusLabel(status) {
    return `<span class="member-status ${status === "已通过" ? "approved" : status === "待补充" ? "returned" : "pending"}">${esc(status)}</span>`;
  }

  function applicationRows(records) {
    return records
      .map(
        (a) =>
          `<article class="member-application"><span class="member-application-icon">${icon("submit")}</span><div class="member-application-info"><a href="#/account/submissions">${esc(a.name)}</a><small>${esc(a.url)}</small><span>${esc(a.date)} 提交 · ${esc(a.kind)}</span></div>${statusLabel(a.status)}<button type="button" class="member-text-link" data-member-action="application" data-value="${esc(a.id)}">查看详情 ${icon("arrow")}</button></article>`,
      )
      .join("");
  }

  function empty(title, desc, link, label, glyph = "submissions") {
    return `<div class="member-empty">${icon(glyph)}<h3>${title}</h3><p>${desc}</p><a class="member-button member-secondary" href="${link}">${label} ${icon("arrow")}</a></div>`;
  }

  function overview() {
    const p = profile(),
      d = pointData(),
      apps = ctx.state.applications;
    return shell(
      "overview",
      heading(
        "个人概览",
        "你好，" + esc(p.name) + "。让每一次探索，都有一个落点。",
        `<a href="#/account/settings" class="member-text-link">编辑资料 ${icon("arrow")}</a>`,
      ) +
        `<section class="member-welcome"><div><span class="member-eyebrow">GOOD TO SEE YOU</span><h2>新的连接，从这里开始。</h2><p>收藏值得关注的站点，发现新福利，记录你的每一步。</p><div class="member-welcome-actions"><a class="member-button" href="#/sites">去发现服务商 ${icon("arrow")}</a><a class="member-text-link" href="#/benefits">看看新用户福利</a></div></div><div class="member-welcome-art" aria-hidden="true">${window.KUGNI_PAGE_ART.render("user")}</div></section><div class="member-stats"><a href="#/saved"><span>${icon("saved")} 我的收藏</span><strong>${ctx.state.saved.length}<small>个站点</small></strong><p>值得关注的连接 ${icon("arrow")}</p></a><a href="#/account/points"><span>${icon("points")} 可用积分</span><strong>${d.balance}<small>演示积分</small></strong><p>每天积攒一点灵感 ${icon("arrow")}</p></a><a href="#/account/submissions"><span>${icon("submissions")} 我的提交</span><strong>${apps.length}<small>份申请</small></strong><p>${apps.filter((a) => a.status === "待审核").length} 份等待审核 ${icon("arrow")}</p></a></div><div class="member-overview-grid"><section class="member-card"><div class="member-card-title"><h2>最近提交</h2><a href="#/account/submissions" class="member-text-link">查看全部 ${icon("arrow")}</a></div>${apps.length ? applicationRows(apps.slice().reverse().slice(0, 3)) : empty("还没有提交记录", "把你发现的好服务，分享给更多人。", "#/submit", "申请收录")}</section><section class="member-card member-daily"><span class="member-daily-icon">${icon("points")}</span><h2>今天，也来打个卡。</h2><p>每日签到，领取 5 积分。<br>一点点积累，多一点发现。</p>${signButton()}<small>积分功能为本地演示</small></section></div><section class="member-invite-strip"><span class="member-invite-glyph">${icon("invite")}</span><div><h3>好用的连接，值得一起发现。</h3><p>邀请朋友加入 KUGNI，一起探索更多可能。</p></div><a href="#/account/invite" class="member-button member-secondary">邀请好友 ${icon("arrow")}</a></section>`,
    );
  }

  function field(
    label,
    name,
    value = "",
    placeholder = "",
    type = "text",
    extra = "",
  ) {
    return `<label class="member-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${extra}></label>`;
  }

  function password(
    label,
    name = "password",
    placeholder = "请输入密码",
    extra = 'minlength="8" required',
  ) {
    return `<label class="member-field"><span>${label}</span><span class="member-password"><input type="password" name="${name}" placeholder="${placeholder}" ${/\bautocomplete=/.test(extra) ? "" : `autocomplete="${name === "currentPassword" ? "current-password" : "new-password"}"`} maxlength="128" ${extra}><button type="button" data-member-action="password" aria-label="显示${label}" aria-pressed="false">${icon("eye")}</button></span></label>`;
  }

  function settings() {
    const p = profile(),
      prefs = ctx.read("member.notifications", {
        review: true,
        benefits: false,
      });
    return shell(
      "settings",
      heading("账户设置", "给你的空间，加一点自己的样子。") +
        `<section class="member-card member-settings"><div class="member-tabs" role="tablist" aria-label="账户设置分类">${[
          ["profile", "基本资料"],
          ["security", "账户安全"],
          ["notifications", "消息偏好"],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" role="tab" id="member-tab-${id}" aria-selected="${settingsTab === id}" aria-controls="member-settings-panel" data-member-action="settings-tab" data-value="${id}" tabindex="${settingsTab === id ? 0 : -1}">${label}</button>`,
          )
          .join(
            "",
          )}</div><div role="tabpanel" id="member-settings-panel" aria-labelledby="member-tab-${settingsTab}">${settingsTab === "profile" ? `<form id="member-profile-form"><div class="member-avatar-editor">${avatar("xlarge")}<div><strong>个人头像</strong><p>支持 JPG、PNG、WebP，最大 2 MB</p><label class="member-button member-secondary member-small">更换头像<input type="file" id="member-avatar-upload" accept="image/png,image/jpeg,image/webp" hidden></label></div></div><div class="member-form-grid">${field("昵称", "name", p.name, "怎么称呼你？", "text", 'required maxlength="24" autocomplete="nickname"')}${field("联系邮箱", "email", p.email === "尚未设置邮箱" ? "" : p.email, "you@example.com", "email", 'required maxlength="100" autocomplete="email"')}<label class="member-field member-full"><span>个人简介 <small>选填</small></span><textarea name="bio" rows="3" maxlength="160" placeholder="用一句话介绍自己，或者记录你感兴趣的方向。">${esc(p.bio)}</textarea><small>最多 160 字</small></label><div class="member-readonly"><span>用户 ID</span><strong>${esc(p.id)}</strong></div><div class="member-readonly"><span>加入日期</span><strong>${esc(p.joined)}</strong></div></div><div class="member-form-footer"><span>让下次相遇，更熟悉一点。</span><button class="member-button" type="submit">保存修改 ${icon("check")}</button></div></form>` : settingsTab === "security" ? `<div class="member-security-row"><span class="member-security-icon">${icon("submissions")}</span><div><h3>联系邮箱</h3><p>${esc(p.email)}</p></div><button class="member-text-link" data-member-action="settings-tab" data-value="profile">修改邮箱 ${icon("arrow")}</button></div><div class="member-security-row"><span class="member-security-icon">${icon("lock")}</span><div><h3>登录密码</h3><p>正式账户接入后可修改登录密码</p></div><span class="member-preview-label">待接入</span></div><form id="member-password-form" class="member-security-form"><h3>修改密码预览</h3><p>体验表单流程，不会保存密码或修改真实账户。</p>${password("当前密码", "currentPassword", "输入当前密码")}${password("新密码", "newPassword", "至少 8 位字符")}${password("确认新密码", "confirmPassword", "再次输入新密码")}<button class="member-button" type="submit">保存密码</button></form>` : `<form id="member-notifications-form"><div class="member-preference"><div><h3>收录审核通知</h3><p>申请状态有更新时，第一时间了解进展。</p></div><label class="member-switch"><input type="checkbox" name="review" ${prefs.review ? "checked" : ""} aria-label="收录审核通知"><span></span></label></div><div class="member-preference"><div><h3>福利与活动动态</h3><p>关注新用户礼遇和你可能感兴趣的活动。</p></div><label class="member-switch"><input type="checkbox" name="benefits" ${prefs.benefits ? "checked" : ""} aria-label="福利与活动动态"><span></span></label></div><p class="member-inline-note">仅保存偏好，当前不会发送邮件或通知。</p><div class="member-form-footer"><span>按自己的节奏，接收消息。</span><button class="member-button" type="submit">保存偏好 ${icon("check")}</button></div></form>`}</div></section>`,
    );
  }

  function points() {
    return window.KUGNI_POINTS.page(ctx);
  }

  function inviteURL() {
    const route = "/register?invite=" + encodeURIComponent(profile().id);
    return (
      location.origin +
      (window.KUGNI_ROUTER.legacy
        ? "/#" + route
        : window.KUGNI_ROUTER.pathURL(route))
    );
  }

  function invite() {
    return shell(
      "invite",
      heading("邀请好友", "好的发现，和朋友一起分享。") +
        `<section class="member-invite-hero"><div><span class="member-eyebrow">BETTER TOGETHER</span><h2>带一位朋友，<br>发现更多好连接。</h2><p>分享你的专属链接，邀请朋友一起探索 AI 服务。<br>每位经平台核验的有效邀请可获得 <b>50 积分</b>。</p><span class="member-preview-label">有效邀请经核验后发放</span></div><div class="member-invite-art" aria-hidden="true">${window.KUGNI_PAGE_ART.render("sponsor")}</div></section><section class="member-card"><div class="member-card-title"><h2>你的专属邀请</h2><span class="member-preview-label">专属邀请</span></div><label class="member-field"><span>邀请链接</span><span class="member-invite-link"><input id="member-invite-link" readonly value="${esc(inviteURL())}" aria-label="邀请链接"><button type="button" class="member-button" data-member-action="copy-invite">${icon("copy")}复制链接</button></span></label><div class="member-invite-code"><span>邀请码</span><strong>${esc(profile().id)}</strong><button type="button" aria-label="复制邀请码" data-member-action="copy-code">${icon("copy")}</button></div><div class="member-invite-steps"><div><b>01</b><strong>分享专属链接</strong><p>把邀请链接发送给朋友</p></div><div><b>02</b><strong>朋友完成注册</strong><p>通过邀请入口加入 KUGNI</p></div><div><b>03</b><strong>一起获得积分</strong><p>有效邀请核验通过后发放</p></div></div></section><section class="member-card"><div class="member-card-title"><h2>邀请记录</h2><span class="member-muted">${(ctx.state.invitations || []).length} 位好友</span></div>${ctx.state.invitations?.length ? ctx.state.invitations.map((row) => `<article class="member-application"><div><strong>${esc(row.name)}</strong><small>${esc(row.date.slice(0, 10))}</small></div><span class="member-status">${esc(row.status)}</span></article>`).join("") : empty("第一位同行的朋友，会是谁？", "通过你的链接完成注册的朋友，会显示在这里。", "#/register?invite=" + encodeURIComponent(profile().id), "查看好友收到的页面", "invite")}</section>`,
    );
  }

  function submissions() {
    const all = ctx.state.applications,
      q = "";
    const records = all
      .filter(
        (a) => submissionFilter === "all" || a.status === submissionFilter,
      )
      .slice()
      .reverse();
    return shell(
      "submissions",
      heading(
        "我的提交",
        "每一份分享，都值得认真对待。",
        `<a href="#/submit" class="member-button">${icon("submit")}申请收录</a>`,
      ) +
        `<section class="member-card"><div class="member-submission-tabs" aria-label="提交状态筛选">${[
          ["all", "全部提交"],
          ["待审核", "待审核"],
          ["已通过", "已通过"],
          ["待补充", "待补充"],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" data-member-action="submission-filter" data-value="${id}" aria-pressed="${submissionFilter === id}">${label}<span>${id === "all" ? all.length : all.filter((a) => a.status === id).length}</span></button>`,
          )
          .join(
            "",
          )}</div>${records.length ? `<div class="member-application-list">${applicationRows(records)}</div>` : empty(all.length ? "还没有此状态的申请" : "你的好发现，从这里分享", "提交站点后，可以在这里查看资料和审核进度。", "#/submit", "提交第一个站点")}<p class="member-inline-note">申请与审核进度与你的账户同步。</p></section><section class="member-card member-process"><h2>收录流程</h2><div class="member-invite-steps"><div><b>01</b><strong>提交站点资料</strong><p>填写链接、简介与支持模型</p></div><div><b>02</b><strong>审核与信息核对</strong><p>有需要时补充资料</p></div><div><b>03</b><strong>通过后公开展示</strong><p>审核通过后进入站点目录</p></div></div></section>`,
    );
  }

  function auth(kind) {
    const register = kind === "register",
      forgot = kind === "forgot-password",
      token = new URLSearchParams(
        window.KUGNI_ROUTER.hash.split("?")[1] || "",
      ).get("invite");
    return `<div class="container member-auth-page"><div class="member-auth-top"><a href="#/" class="member-text-link">← 返回首页</a><span>连接每一种可能</span></div><div class="member-auth-layout"><aside class="member-auth-story"><span class="member-eyebrow">A SPACE FOR YOUR NEXT IDEA</span><h2>让每一次连接，<br>都有迹可循<span>。</span></h2><p>在纷繁的 AI 服务里，<br>找到适合自己的那一个。</p><div class="member-auth-art" aria-hidden="true">${window.KUGNI_PAGE_ART.render("network")}</div><ul><li>${icon("saved")}留下值得关注的服务商</li><li>${icon("points")}积攒每一次参与的积分</li><li>${icon("invite")}和朋友分享新的发现</li></ul><small>KUGNI · 让服务发现，更简单一点。</small></aside><section class="member-auth-form-panel"><div class="member-auth-heading"><span class="member-eyebrow">${forgot ? "LET’S GET YOU BACK" : register ? "NICE TO MEET YOU" : "WELCOME BACK"}</span><h1>${forgot ? "找回密码" : register ? "创建你的账户" : "欢迎回来"}</h1><p>${forgot ? "填写注册邮箱，预览密码找回流程。" : register ? "从一个账户开始，收好你的每一次发现。" : "登录，继续你的探索。"}</p></div>${forgot ? `<form id="member-forgot-form">${field("注册邮箱", "email", "", "you@example.com", "email", 'required autocomplete="email" maxlength="100"')}<button class="member-button member-auth-submit" type="submit">获取重置指引 ${icon("arrow")}</button><a class="member-auth-back" href="#/login">返回登录</a></form>` : `<div class="member-auth-tabs"><a href="#/login" ${!register ? 'aria-current="page"' : ""}>登录</a><a href="#/register" ${register ? 'aria-current="page"' : ""}>注册</a></div>${register && token ? `<div class="member-invite-notice">${icon("invite")}好友邀请你加入 · ${esc(token.slice(0, 40))}</div>` : ""}<form id="member-auth-form" data-mode="${register ? "register" : "login"}">${register ? field("昵称", "name", "", "给自己起个名字", "text", 'required maxlength="24" autocomplete="nickname"') : ""}${field("邮箱", "email", "", "you@example.com", "email", 'required autocomplete="email" maxlength="100"')}${register ? `<label class="member-field"><span>邮箱验证码</span><span class="email-code-row"><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required placeholder="6 位验证码"><button class="member-text-link" type="button" data-email-code>获取验证码</button></span><small>验证邮箱归属后创建账户，验证码 10 分钟有效。</small></label>` : ""}${password("密码", "password", register ? "设置至少 8 位密码" : "请输入密码", `required minlength="8" autocomplete="${register ? "new-password" : "current-password"}"`)}${register ? password("确认密码", "confirmPassword", "再次输入密码") : ""}${register ? `<label class="member-auth-agreement"><input type="checkbox" name="agreement" required><span>我已阅读并同意<a href="#/privacy" target="_blank" rel="noopener">隐私说明</a>，了解当前为本地体验。</span></label>` : `<div class="member-auth-options"><span>${icon("lock")}密码不会保存在浏览器</span><a href="#/forgot-password">忘记密码？</a></div>`}<button class="member-button member-auth-submit" type="submit">${register ? "创建账户" : "登录"} ${icon("arrow")}</button></form><div class="member-auth-divider"><span>先看看登录后的样子</span></div><button type="button" class="member-button member-secondary member-auth-demo" data-member-action="demo-login">${avatar()}一键体验个人中心 ${icon("arrow")}</button>`}<p class="member-auth-note">${icon("lock")}当前为界面预览，不验证真实账户，不发送邮件。<br>请使用演示信息，密码仅用于本次表单校验。</p></section></div></div>`;
  }

  function routes(c) {
    ctx = c;
    return {
      login: () => auth("login"),
      register: () => auth("register"),
      "forgot-password": () => auth("forgot-password"),
      account: () => {
        const part = window.KUGNI_ROUTER.hash
          .slice(1)
          .split("?")[0]
          .split("/")[2];
        return ({ settings, points, invite, submissions }[part] || overview)();
      },
    };
  }
  window.KUGNI_ACCOUNT = { header, routes };
  return window.KUGNI_ACCOUNT;
}
