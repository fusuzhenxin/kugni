"use client";
import type { SessionData } from "./types";

let csrf: string | null = null;
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (
    options.method &&
    !["GET", "HEAD"].includes(options.method) &&
    !csrf &&
    ![
      "/auth/login/",
      "/auth/register/",
      "/auth/password-reset/request/",
      "/auth/password-reset/confirm/",
    ].includes(path)
  ) {
    const session = await api<SessionData>("/auth/session/");
    csrf = session.csrf;
  }
  const response = await fetch("/api/v1" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: { msg: string }) => e.msg).join("；")
          : "操作失败，请稍后重试",
    );
  if ("csrf" in data) csrf = data.csrf;
  return data as T;
}
export const send = <T>(path: string, body: unknown = {}, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
