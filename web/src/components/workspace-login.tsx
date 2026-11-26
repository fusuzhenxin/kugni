"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { send } from "@/lib/client-api";
import { Brand, ErrorMessage, Icon } from "./ui";
import { useAuth } from "./providers";

type Surface = "platform" | "publisher";
const workspaceRoot = (surface: Surface) =>
  surface === "platform" ? "/admin/" : "/publisher/";

// Resolve against a fixed origin and constrain both the origin and workspace.
// This also rejects encoded separators, traversal and login redirect loops.
function destination(surface: Surface) {
  const root = workspaceRoot(surface),
    fallback = root + "dashboard/";
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || /[\\\s%]/.test(next)) return fallback;
  try {
    const url = new URL(next, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith(root) ||
      url.pathname === root + "login/" ||
      url.pathname === root + "login"
    )
      return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

function WorkspaceFrame({
  surface,
  children,
}: {
  surface: Surface;
  children: ReactNode;
}) {
  const publisher = surface === "publisher";
  return (
    <main id="main" className="workspace-login">
      <section className="workspace-visual" aria-label="KUGNI 工作台">
        <Link href="/" aria-label="KUGNI 首页">
          <Brand />
        </Link>
        <div className="workspace-intro">
          <span className="eyebrow">DESIGNED FOR CLARITY</span>
          <h2>
            {publisher ? (
              <>
                让每一次推广，
                <br />
                都有清晰的回响。
              </>
            ) : (
              <>
                让每一次运营，
                <br />
                都有清晰的方向。
              </>
            )}
          </h2>
          <p>
            {publisher
              ? "管理广告与投放，用真实的流量和转化数据，了解每一份投入的价值。"
              : "连接服务、内容与推广，用有条理的数据，陪你做出更好的选择。"}
          </p>
          <svg
            className="workspace-art"
            viewBox="0 0 480 300"
            aria-hidden="true"
          >
            <rect
              x="60"
              y="30"
              width="340"
              height="220"
              rx="22"
              fill="#dce7ff"
              transform="rotate(-7 230 140)"
            />
            <rect x="78" y="22" width="340" height="220" rx="18" fill="white" />
            <rect x="103" y="46" width="90" height="8" rx="4" fill="#b6c9ef" />
            {[103, 204, 305].map((x) => (
              <rect
                key={x}
                x={x}
                y="78"
                width="84"
                height="45"
                rx="8"
                fill="#f0f5ff"
              />
            ))}
            <path d="M103 205H389M103 170H389M103 135H389" stroke="#edf1f8" />
            <path
              d="m103 205 47-26 48 10 47-39 47 14 47-35 48 8"
              stroke="#3868ef"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="339"
              cy="129"
              r="6"
              fill="#ef9d50"
              stroke="white"
              strokeWidth="3"
            />
            <circle cx="401" cy="234" r="36" fill="#3868ef" />
            <path
              d="m385 234 12 12 23-26"
              stroke="white"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="62" cy="55" r="15" fill="#f3bb88" />
          </svg>
        </div>
        <footer>© {new Date().getFullYear()} KUGNI · www.kugni.com</footer>
      </section>
      <section className="workspace-form-area">{children}</section>
    </main>
  );
}

export function WorkspaceAccess({ surface }: { surface: Surface }) {
  const { user, logout } = useAuth();
  const [error, setError] = useState("");
  return (
    <WorkspaceFrame surface={surface}>
      <div className="workspace-form">
        <span className="workspace-label">
          <Icon name="shield" />
          工作台访问权限
        </span>
        <h1>请切换对应账户</h1>
        <p>
          当前账户「{user?.name}」没有
          {surface === "platform" ? "平台管理后台" : "站长工作台"}的访问权限。
        </p>
        <ErrorMessage error={error} />
        <button
          className="button"
          onClick={() =>
            logout(workspaceRoot(surface) + "login/").catch((e) =>
              setError(e.message),
            )
          }
        >
          退出并切换账户
          <Icon name="arrow" />
        </button>
        <Link
          className="text-link"
          href={
            user?.surface === "platform"
              ? "/admin/dashboard/"
              : user?.surface === "publisher"
                ? "/publisher/dashboard/"
                : "/account/"
          }
        >
          返回我的工作区
        </Link>
      </div>
    </WorkspaceFrame>
  );
}

export function WorkspaceLogin({ surface }: { surface: Surface }) {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!loading && user?.surface === surface)
      router.replace(destination(surface));
  }, [loading, user, surface, router]);
  if (user && user.surface !== surface)
    return <WorkspaceAccess surface={surface} />;
  return (
    <WorkspaceFrame surface={surface}>
      <form
        className="workspace-form"
        aria-label="工作台登录"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            await send("/auth/login/", {
              email: form.get("email"),
              password: form.get("password"),
              surface,
            });
            await refresh();
            router.replace(destination(surface));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="workspace-label">
          <Icon name={surface === "platform" ? "shield" : "megaphone"} />
          KUGNI WORKSPACE
        </span>
        <h1>{surface === "platform" ? "平台管理登录" : "站长工作台登录"}</h1>
        <p>
          {surface === "platform"
            ? "欢迎回来，继续你的站点运营与管理。"
            : "欢迎回来，查看投放进展与推广效果。"}
        </p>
        <label htmlFor="workspace-email">登录邮箱</label>
        <input
          id="workspace-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="输入工作台账户邮箱"
        />
        <label htmlFor="workspace-password">登录密码</label>
        <div className="workspace-password">
          <input
            id="workspace-password"
            name="password"
            type={visible ? "text" : "password"}
            minLength={8}
            maxLength={128}
            required
            autoComplete="current-password"
            placeholder="输入登录密码"
          />
          <button
            type="button"
            aria-label={visible ? "隐藏密码" : "显示密码"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "隐藏" : "显示"}
          </button>
        </div>
        <div className="workspace-help">
          <span>仅限已授权账户登录</span>
          <Link href="/auth/forgot-password/">忘记密码？</Link>
        </div>
        <ErrorMessage error={error} />
        <button
          className="button workspace-submit"
          type="submit"
          disabled={busy || loading || !!user}
        >
          {busy ? "正在验证…" : loading || user ? "正在加载…" : "进入工作台"}
          <Icon name="arrow" />
        </button>
        <div className="workspace-links">
          <Link href="/">
            返回网站首页
            <Icon name="arrow" size={14} />
          </Link>
          <Link
            href={
              workspaceRoot(surface === "platform" ? "publisher" : "platform") +
              "login/"
            }
          >
            {surface === "platform" ? "站长工作台" : "平台管理后台"}
          </Link>
        </div>
      </form>
    </WorkspaceFrame>
  );
}
