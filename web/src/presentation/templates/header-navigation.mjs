// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const sections = [
    { id: "home", label: "首页", url: "#/" },
    { id: "sites", label: "站点", url: "#/sites" },
    {
      id: "models",
      label: "模型",
      url: "#/models",
      menu: "model",
      items: [
        ["模型大全", "#/models"],
        ["模型套餐", "#/coding-plans"],
      ],
    },
    { id: "prices", label: "价格对比", url: "#/prices" },
    {
      id: "check",
      label: "中转站检测",
      url: "#/check",
      menu: "check",
      items: [
        ["检测首页", "#/check"],
        ["检测记录", "#/check/history"],
        ["模型指纹测试", "#/check/fingerprint"],
        ["糖果测试", "#/check/candy"],
      ],
    },
    { id: "benefits", label: "福利广场", url: "#/benefits" },
    { id: "points", label: "赚积分", url: "#/account/points" },
  ];

  const arrow =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';

  let closeTimer;

  const compact = () => matchMedia("(max-width:1100px)").matches;

  const groups = ".header-nav-group,.header-nav-dropdown";

  const menuFor = (id) => document.getElementById(id + "-nav-menu");

  const triggerFor = (id) => document.getElementById(id + "-nav-trigger");

  function render(section) {
    clearTimeout(closeTimer);
    const active =
      window.KUGNI_ROUTER.hash.split("?")[0] === "#/account/points"
        ? "points"
        : section === "site"
          ? "sites"
          : ["model", "coding-plans"].includes(section)
            ? "models"
            : section;
    const current = window.KUGNI_ROUTER.hash.split("?")[0] || "#/";
    const nav = sections
      .map((s) => {
        const selected = s.id === active;
        const link = `<a ${s.menu ? `id="${s.menu}-nav-link"` : ""} class="header-nav-link ${s.menu ? s.menu + "-nav-link " : ""}${selected ? "active" : ""}" href="${s.url}" ${selected ? 'aria-current="page"' : ""}>${s.label}</a>`;
        const menu = s.menu
          ? `<div id="${s.menu}-nav-menu" class="header-nav-dropdown" data-nav-menu="${s.menu}" aria-label="${s.label}菜单" hidden>${s.items.map(([label, url]) => `<a href="${url}" ${current === url || (url === "#/models" && section === "model") ? 'aria-current="page"' : ""}><span>${label}</span>${arrow}</a>`).join("")}</div>`
          : "";
        return s.menu
          ? `<div class="header-nav-group ${selected ? "active" : ""}" data-nav-group="${s.menu}">${link}<button type="button" id="${s.menu}-nav-trigger" class="header-nav-trigger" data-nav-toggle="${s.menu}" aria-label="展开${s.label}菜单" aria-expanded="false" aria-controls="${s.menu}-nav-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>${menu}</div>`
          : link;
      })
      .join("");
    return `<nav id="primary-navigation" class="nav" aria-label="主导航">${nav}</nav>`;
  }

  function toggle() {
    return '<button type="button" class="header-menu-toggle" data-header-menu-toggle aria-label="展开主导航" aria-expanded="false" aria-controls="primary-navigation"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="header-menu-icon" d="M5 7h14M5 12h14M5 17h14"/><path class="header-close-icon" d="m6 6 12 12M6 18 18 6"/></svg></button>';
  }

  function closePanel(focus = false) {
    const header = document.getElementById("header"),
      button = header?.querySelector("[data-header-menu-toggle]");
    if (!button) return;
    const wasOpen = button.getAttribute("aria-expanded") === "true";
    header.removeAttribute("data-menu-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "展开主导航");
    close();
    if (focus && wasOpen) button.focus({ preventScroll: true });
  }

  function close() {
    clearTimeout(closeTimer);
    document
      .querySelectorAll(".header-nav-dropdown")
      .forEach((menu) => (menu.hidden = true));
    document
      .querySelectorAll("[data-nav-toggle]")
      .forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  }

  const owner = (target) => target?.closest?.(groups);

  const idOf = (node) => node?.dataset.navGroup || node?.dataset.navMenu;
  window.KUGNI_NAVIGATION = { render, toggle };
  return window.KUGNI_NAVIGATION;
}
