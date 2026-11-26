"use client";
import Link from "next/link";
import { createLocalizer, localePath } from "@/presentation/localization.mjs";
import { useState } from "react";
import { send } from "@/lib/client-api";
import type { SessionData } from "@/lib/types";
import { Brand, ErrorMessage, Icon } from "./ui";
import { useAuth } from "./providers";

export function AuthPage({
  mode,
  locale = "zh-CN",
  translations = {},
}: {
  mode: "login" | "register" | "reset";
  locale?: string;
  translations?: Record<string, string>;
}) {
  const t = createLocalizer(locale, translations).text;
  const navigate = (url: string) => location.assign(localePath(url, locale));
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  const { refresh } = useAuth();
  const title =
    mode === "register"
      ? "开启新的连接"
      : mode === "reset"
        ? "找回你的账户"
        : "欢迎回来";
  return (
    <div className="auth-page container">
      <section className="auth-card">
        <Brand />
        <span className="eyebrow">YOUR NEXT CONNECTION</span>
        <h1>{t(title)}</h1>
        <p>
          {mode === "register"
            ? t("收藏好服务，记录探索，发现更多可能。")
            : mode === "reset"
              ? t("通过注册邮箱重置登录密码。")
              : t("登录 KUGNI，继续发现值得关注的 AI 服务。")}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget),
              params = new URLSearchParams(location.search);
            try {
              if (mode === "reset") {
                const token = params.get("token");
                const data = token
                  ? await send<{ message?: string }>(
                      "/auth/password-reset/confirm/",
                      { token, password: f.get("password") },
                    )
                  : await send<{ message?: string }>(
                      "/auth/password-reset/request/",
                      { email: f.get("email") },
                    );
                setMessage(data.message || "密码已重置，请使用新密码登录。");
              } else {
                const data = await send<SessionData>("/auth/" + mode + "/", {
                  email: f.get("email"),
                  password: f.get("password"),
                  ...(mode === "register"
                    ? {
                        name: f.get("name"),
                        code: f.get("code"),
                        invite: params.get("invite") || "",
                      }
                    : {}),
                });
                await refresh();
                const next = params.get("next") || "";
                navigate(
                  next.startsWith("/") &&
                    !next.startsWith("//") &&
                    !next.includes("\\")
                    ? next
                    : data.user?.surface === "platform"
                      ? "/admin/dashboard/"
                      : data.user?.surface === "publisher"
                        ? "/publisher/dashboard/"
                        : "/account/",
                );
              }
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "register" && (
            <label>
              {t("昵称")}
              <input
                name="name"
                required
                minLength={2}
                maxLength={40}
                autoComplete="nickname"
                placeholder={t("怎么称呼你？")}
              />
            </label>
          )}
          <label>
            {t("邮箱")}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          {mode === "register" && (
            <label>
              {t("邮箱验证码")}
              <span className="email-code-row">
                <input
                  name="code"
                  required
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  onClick={async (e) => {
                    const email = e.currentTarget
                      .closest("form")!
                      .querySelector<HTMLInputElement>('[name="email"]')!;
                    if (!email.reportValidity()) return;
                    setBusy(true);
                    try {
                      const r = await send<{ message: string }>(
                        "/auth/email-code/",
                        { email: email.value },
                      );
                      setError("");
                      setMessage(r.message);
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  {t("获取验证码")}
                </button>
              </span>
            </label>
          )}
          {(mode !== "reset" ||
            (typeof window !== "undefined" &&
              new URLSearchParams(location.search).has("token"))) && (
            <label>
              {mode === "reset" ? t("新密码") : t("密码")}
              <span className="password-input">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  required
                  minLength={mode === "login" ? 8 : 10}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "login" ? t("输入登录密码") : t("至少 10 位字符")
                  }
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? t("隐藏密码") : t("显示密码")}
                >
                  <Icon name={visible ? "lock" : "help"} size={16} />
                </button>
              </span>
            </label>
          )}
          {mode === "login" && (
            <div className="auth-forgot">
              <Link href={localePath("/auth/password-reset/", locale)}>
                {t("忘记密码？")}
              </Link>
            </div>
          )}
          <ErrorMessage error={t(error)} />
          {message && (
            <p className="success-message" role="status">
              {t(message)}
            </p>
          )}
          <button
            className="button auth-submit"
            type="submit"
            disabled={busy || (mode === "reset" && !!message)}
          >
            {busy
              ? t("正在处理…")
              : mode === "register"
                ? t("创建账户")
                : mode === "reset"
                  ? t("提交重置申请")
                  : t("登录")}
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <div className="auth-alternate">
          {mode === "login" ? (
            <>
              {t("还没有账户？")}
              <Link href={localePath("/auth/register/", locale)}>
                {t("现在注册")}
              </Link>
            </>
          ) : (
            <>
              {t("已经有账户？")}
              <Link href={localePath("/auth/login/", locale)}>
                {t("返回登录")}
              </Link>
            </>
          )}
        </div>
        <small>
          {t("继续即表示你同意")}
          <Link href={localePath("/legal/terms/", locale)}>
            {t("服务条款")}
          </Link>
          {t("与")}
          <Link href={localePath("/legal/privacy/", locale)}>
            {t("隐私说明")}
          </Link>
          。
        </small>
      </section>
      <div className="auth-footnote">
        <Icon name="shield" size={16} />
        {t("让每一次探索，都有一个落点。")}
      </div>
    </div>
  );
}
