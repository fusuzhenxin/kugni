"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "./providers";
import { SearchDialog } from "./search";
import { Brand, Icon } from "./ui";

const navigation = [
  ["首页", "/"],
  ["站点", "/stations/"],
  ["模型", "/models/"],
  ["价格对比", "/pricing/"],
  ["中转站检测", "/tools/api-check/"],
  ["福利广场", "/benefits/"],
  ["赚积分", "/account/points/"],
];
export function SiteHeader() {
  const path = usePathname(),
    { user, logout } = useAuth(),
    [open, setOpen] = useState(false),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("kugni.theme") === "dark";
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
  }, []);
  useEffect(() => setOpen(false), [path]);
  const toggle = () => {
    setDark(!dark);
    document.documentElement.dataset.theme = !dark ? "dark" : "light";
    localStorage.setItem("kugni.theme", !dark ? "dark" : "light");
  };
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" aria-label="KUGNI 首页">
          <Brand />
        </Link>
        <nav
          className={open ? "site-nav open" : "site-nav"}
          aria-label="主导航"
        >
          {navigation.map(([label, href]) =>
            href.startsWith("/tools/") ? (
              <details key={href} className="nav-dropdown">
                <summary className={path.startsWith("/tools") ? "active" : ""}>
                  {label}
                  <Icon name="chevron" size={12} />
                </summary>
                <div>
                  <Link href="/tools/api-check/">基础接口检测</Link>
                  <Link href="/tools/candy-test/">糖果测试</Link>
                  <Link href="/tools/model-fingerprint/">模型指纹测试</Link>
                  <Link href="/tools/history/">检测记录</Link>
                </div>
              </details>
            ) : (
              <Link
                key={href}
                href={href}
                className={
                  path === href || (href !== "/" && path.startsWith(href))
                    ? "active"
                    : ""
                }
              >
                {label}
              </Link>
            ),
          )}
        </nav>
        <div className="header-actions">
          <SearchDialog />
          <button
            type="button"
            className="icon-button"
            aria-label="切换明暗主题"
            onClick={toggle}
          >
            <Icon name={dark ? "sparkles" : "compass"} />
          </button>
          {user ? (
            <details className="user-dropdown">
              <summary>
                <span className="avatar-small">
                  {user.profile.avatar ? (
                    <img src={user.profile.avatar} alt="" />
                  ) : (
                    user.name.slice(0, 1)
                  )}
                </span>
                <span>{user.name}</span>
                <Icon name="chevron" size={12} />
              </summary>
              <div>
                <Link href="/account/">个人中心</Link>
                <Link href="/account/settings/">账户设置</Link>
                <Link href="/account/points/">我的积分</Link>
                {user.surface === "platform" && (
                  <Link href="/admin/dashboard/">管理后台</Link>
                )}
                {user.surface === "publisher" && (
                  <Link href="/publisher/dashboard/">推广工作台</Link>
                )}
                <button onClick={() => logout()}>退出登录</button>
              </div>
            </details>
          ) : (
            <Link href="/auth/login/" className="login-link">
              登录 / 注册
            </Link>
          )}
          <button
            className="icon-button mobile-nav-toggle"
            aria-label="展开导航"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
    </header>
  );
}

const footerGroups = [
  [
    "导航",
    [
      ["站点目录", "/stations/"],
      ["公益站", "/stations/categories/public-service/"],
      ["企业稳定站", "/stations/categories/enterprise/"],
      ["新站上榜", "/stations/categories/newly-listed/"],
      ["新用户赠额", "/stations/categories/signup-bonus/"],
      ["模型资料库", "/models/"],
      ["API 价格对比", "/pricing/"],
    ],
  ],
  [
    "热门模型",
    [
      ["OpenAI / GPT", "https://chatgpt.com/"],
      ["Claude", "https://claude.ai/"],
      ["Gemini", "https://gemini.google.com/"],
      ["DeepSeek", "https://chat.deepseek.com/"],
    ],
  ],
  [
    "参与",
    [
      ["开发者与 AI 接入", "/developers/"],
      ["申请收录", "/submit-station/"],
      ["商务合作", "/business/"],
      ["基础接口检测", "/tools/api-check/"],
      ["糖果测试", "/tools/candy-test/"],
      ["模型指纹测试", "/tools/model-fingerprint/"],
      ["我的积分", "/account/points/"],
    ],
  ],
  [
    "联系我们",
    [
      ["关于 KUGNI", "/about/"],
      ["联系与反馈", "/contact/"],
      ["评测方法", "/methodology/"],
      ["评分说明", "/scoring/"],
    ],
  ],
  [
    "法律",
    [
      ["隐私说明", "/legal/privacy/"],
      ["服务条款", "/legal/terms/"],
      ["免责声明", "/legal/disclaimer/"],
    ],
  ],
] as const;
export function SiteFooter({
  settings = {},
}: {
  settings?: Record<string, string>;
}) {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const screen = matchMedia("(min-width: 601px)");
    const update = () => setDesktop(screen.matches);
    update();
    screen.addEventListener("change", update);
    return () => screen.removeEventListener("change", update);
  }, []);
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div className="footer-brand">
          <Link href="/">
            <Brand />
          </Link>
          <div className="social-links">
            <a
              href="https://github.com/fusuzhenxin"
              aria-label="GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="code" />
            </a>
            <a
              href={settings.telegram || "https://t.me/asAnnie1"}
              aria-label="Telegram"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="message" />
            </a>
            <a href="/feed.xml" aria-label="RSS">
              <Icon name="globe" />
            </a>
          </div>
          <p>© {new Date().getFullYear()} KUGNI · www.kugni.com</p>
        </div>
        {footerGroups.map(([title, links]) => (
          <details key={title} className="footer-group" open={desktop}>
            <summary>
              {title}
              <Icon name="chevron" size={12} />
            </summary>
            <div>
              {links.map(([label, href]) =>
                href.startsWith("https") ? (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {label}
                  </a>
                ) : (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ),
              )}
            </div>
          </details>
        ))}
      </div>
      <div className="container footer-bottom">
        <div>
          <Link href="/developers/">开发者文档</Link>
          <a href="/sitemap.xml">站点地图</a>
          <a href="/llms.txt">llms.txt</a>
        </div>
        <span>发现连接，也看清每一份依据。</span>
      </div>
    </footer>
  );
}
