// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  let ctx,
    socialId = 0;

  const categories = window.KUGNI_CONFIG.categories.map(
    (category) => category.name,
  );

  const payments = [
    ["支付宝", "alipay"],
    ["微信", "wechatpay"],
    ["USDT", "usdt"],
    ["银行卡", "bankcard"],
    ["对公转账", "corporate"],
    ["PayPal", "paypal"],
  ];

  const platforms = [
    "Twitter / X",
    "Telegram",
    "Discord",
    "GitHub",
    "微信公众号",
    "其他",
  ];

  const e = (v) => ctx.esc(v);

  const optional = "<small>选填</small>";

  const required = '<b aria-hidden="true">*</b>';

  function field(
    label,
    name,
    placeholder,
    type = "text",
    needed = false,
    extra = "",
  ) {
    return `<label class="sf-field"><span>${label} ${needed ? required : optional}</span><input type="${type}" name="${name}" placeholder="${placeholder}" maxlength="${type === "url" ? 500 : 200}" ${needed ? "required" : ""} ${extra}></label>`;
  }

  function checks(label, name, values) {
    return `<fieldset class="sf-options" data-required-group="${name}"><legend>${label} ${required}<small>可多选</small></legend><div>${values
      .map((v, i) => {
        const text = Array.isArray(v) ? v[0] : v;
        return `<label><input type="checkbox" name="${name}" value="${text}" ${i === 0 ? "required" : ""}>${Array.isArray(v) ? `<img src="assets/payments/${v[1]}.svg" alt="" width="18" height="18">` : ""}<span>${text}</span></label>`;
      })
      .join(
        "",
      )}</div><p class="sf-group-error" hidden>请至少选择一项</p></fieldset>`;
  }

  function radios(label, name) {
    return `<fieldset class="sf-options"><legend>${label} ${required}</legend><div>${["支持", "不支持", "其他"].map((v) => `<label><input type="radio" name="${name}" value="${v}" required><span>${v}</span></label>`).join("")}</div></fieldset>`;
  }

  function socialRow() {
    const id = socialId++;
    return `<div class="sf-social-row"><label><span class="sr-only">社交平台 ${id + 1}</span><select name="socialPlatform" ${id === 0 ? 'id="sf-social-platform"' : ""}>${platforms.map((v) => `<option>${v}</option>`).join("")}</select></label><label><span class="sr-only">社交链接 ${id + 1}</span><input type="url" name="socialUrl" maxlength="500" placeholder="https://"></label><button type="button" data-submission-action="remove-social" aria-label="移除此社交链接">${ctx.icon("close")}</button></div>`;
  }

  function page(c) {
    ctx = c;
    socialId = 0;
    return `<div class="container submission-page"><header class="sf-intro"><span class="sf-eyebrow">SHARE A GOOD FIND</span><h1>申请<span>收录</span></h1><p>把值得发现的站点，带到更多人面前。</p><nav aria-label="收录表单章节"><a href="#sf-site" data-submission-action="section">01 <span>站点信息</span></a><a href="#sf-policy" data-submission-action="section">02 <span>支付与政策</span></a><a href="#sf-probe" data-submission-action="section">03 <span>探测账户</span></a><a href="#sf-contact" data-submission-action="section">04 <span>补充与联系</span></a></nav><div class="sf-intro-note">填写公开资料，帮助大家更好地了解你的服务。<br>当前申请仅保存在本浏览器，可在个人中心查看。</div><a href="#/account/submissions" class="sf-my-submissions">查看我的提交 ${ctx.icon("arrow")}</a></header><form id="apply-form" class="submission-form"><section id="sf-site" class="sf-section"><div class="sf-section-heading"><h2>站点信息</h2><span>01 / 04</span></div><div class="sf-grid">${field("站点名称", "name", "例如：你的 API 站点", "text", true)}${field("站点 URL", "url", "https://example.com", "url", true)}</div>${checks("站点分类", "categories", categories)}${checks("支持模型", "models", ctx.brands)}<label class="sf-field"><span>网站介绍 ${optional}</span><textarea name="desc" rows="3" maxlength="1500" placeholder="介绍站点定位、主要优势、服务特点、价格或售后信息…"></textarea><small class="sf-caption">让大家在几句话里，了解你的站点。</small></label><div class="sf-field sf-social"><span>社交链接 ${optional}</span><div id="sf-social-rows">${socialRow()}</div><button type="button" class="sf-add-social" data-submission-action="add-social">＋ 添加一条</button></div></section><section id="sf-policy" class="sf-section"><div class="sf-section-heading"><h2>支付与政策</h2><span>02 / 04</span></div>${checks("支付方式", "payments", payments)}<div class="sf-grid">${radios("开具发票", "invoice")}${radios("退款政策", "refund")}</div><div class="sf-grid">${field("专属优惠码", "promo", "例如：KUGNI，新用户注册享优惠")}${field("最低充值金额", "minRecharge", "例如：10 元起充")}</div><label class="sf-field"><span>政策说明 ${optional}</span><textarea name="policyNotes" maxlength="1000" rows="2" placeholder="补充开票条件、退款限制或优惠使用方式"></textarea></label></section><section id="sf-probe" class="sf-section"><div class="sf-section-heading"><h2>探测账户 <small>选填</small></h2><span>03 / 04</span></div><p class="sf-note">用于预览账户填写流程。当前不连接探测服务，账户和密码不会随申请保存。请使用演示信息。</p><div class="sf-grid"><label class="sf-field"><span>探测账户</span><input id="sf-probe-user" autocomplete="off" maxlength="100" placeholder="演示账户名"></label><div class="sf-field"><div class="sf-label-row"><label for="sf-probe-password">探测账户密码</label><button type="button" data-submission-action="generate">生成密码</button></div><div class="sf-password"><input id="sf-probe-password" type="password" maxlength="100" autocomplete="new-password" placeholder="演示账户密码"><button type="button" data-submission-action="password" aria-label="显示探测密码" aria-pressed="false">显示</button></div></div></div></section><section id="sf-contact" class="sf-section"><div class="sf-section-heading"><h2>补充与联系</h2><span>04 / 04</span></div><label class="sf-field"><span>备注 ${optional}</span><textarea name="notes" rows="3" maxlength="1500" placeholder="其他希望审核人员了解的信息，可以留空"></textarea></label><div class="sf-grid">${field("联系方式", "contact", "微信 / QQ / 手机 / Telegram", "text", true)}${field("联系邮箱", "email", "you@example.com", "email")}</div><label class="sf-consent"><input type="checkbox" name="consent" required><span>我确认资料填写准确，并了解当前申请仅在本浏览器保存。</span></label><div class="sf-submit-row"><span>${ctx.icon("shield")}资料准备好，就出发吧。</span><button class="member-button" type="submit">提交收录申请 ${ctx.icon("arrow")}</button></div></section></form></div>`;
  }

  function httpURL(value) {
    try {
      const u = new URL(value);
      return ["http:", "https:"].includes(u.protocol);
    } catch {
      return false;
    }
  }

  function details(row, c) {
    ctx = c;
    const list = (v) => (Array.isArray(v) ? v.join(" / ") : v);
    const entry = (title, value) =>
      `<dt>${title}</dt><dd>${e(list(value) || "未填写")}</dd>`;
    return `<div class="member-application-detail sf-application-detail"><div class="sf-application-heading"><h3>${e(row.name)}</h3><span class="tag">${e(row.status)}</span></div><dl>${entry("站点地址", row.url)}${entry("站点分类", row.categories || row.kind)}${entry("支持模型", row.models)}${entry("网站介绍", row.desc)}${entry("社交链接", (row.socialLinks || []).map((r) => r.platform + " · " + r.url).join("\n"))}${entry("支付方式", row.payments)}${entry("开具发票", row.invoice)}${entry("退款政策", row.refund)}${entry("专属优惠", row.promo)}${entry("最低充值", row.minRecharge)}${entry("政策说明", row.policyNotes)}${entry("备注", row.notes)}${entry("联系方式", row.contact || row.email)}${entry("联系邮箱", row.email)}${entry("提交时间", row.date)}</dl><p>当前为本地申请记录，审核状态可在演示管理台中体验。</p><a href="#/admin" class="member-button member-secondary" data-action="close">体验审核流程 ${ctx.icon("arrow")}</a></div>`;
  }
  window.KUGNI_SUBMISSION = { page, socialRow, details };
  return window.KUGNI_SUBMISSION;
}
