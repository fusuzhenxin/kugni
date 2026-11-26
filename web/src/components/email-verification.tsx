"use client";
import { useState } from "react";
import { send } from "@/lib/client-api";
import { useAuth } from "./providers";

export function EmailVerification({ locale = "zh-CN" }: { locale?: string }) {
  const { user, refresh } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState(0);
  const en = locale === "en";
  if (!user) return null;
  return (
    <section className="container email-verification">
      <h2>{en ? "Verify your email" : "邮箱归属验证"}</h2>
      <p>
        {user.email} ·{" "}
        {user.profile.emailVerified
          ? en
            ? "Verified"
            : "已验证"
          : en
            ? "Unverified"
            : "未验证"}
      </p>
      {!user.profile.emailVerified && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            setBusy(true);
            try {
              await send("/auth/verify-email/", {
                code: new FormData(e.currentTarget).get("code"),
              });
              await refresh();
              setMessage(en ? "Email verified." : "邮箱验证成功");
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {en ? "Verification code" : "邮箱验证码"}
            <input
              name="code"
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button
            type="button"
            className="member-button member-secondary"
            disabled={busy}
            onClick={async () => {
              if (Date.now() < next) {
                setMessage(
                  en
                    ? "Please wait 60 seconds before requesting another code."
                    : "请间隔 60 秒再获取验证码",
                );
                return;
              }
              setBusy(true);
              try {
                const result = await send<{ message: string }>(
                  "/auth/email-code/",
                  { email: user.email },
                );
                setNext(Date.now() + 60000);
                setMessage(result.message);
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {en ? "Send code" : "获取验证码"}
          </button>
          <button className="member-button" disabled={busy}>
            {en ? "Verify email" : "验证邮箱"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
