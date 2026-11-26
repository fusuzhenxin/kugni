"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, send } from "@/lib/client-api";
import { useAuth } from "./providers";
import { Icon, ErrorMessage } from "./ui";

export function FavoriteButton({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const { user } = useAuth(),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api<{ items: { id: string }[] }>("/member/favorites/")
        .then((data) => setSaved(data.items.some((r) => r.id === id)))
        .catch(() => {});
  }, [id, user]);
  const toggle = async () => {
    if (!user) {
      location.assign(
        "/auth/login/?next=" + encodeURIComponent(location.pathname),
      );
      return;
    }
    setBusy(true);
    try {
      await send("/member/favorites/" + id + "/", {}, saved ? "DELETE" : "PUT");
      setSaved(!saved);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="favorite-wrap">
      <button
        onClick={toggle}
        disabled={busy}
        className={
          compact
            ? "icon-button favorite " + (saved ? "saved" : "")
            : "button secondary " + (saved ? "saved" : "")
        }
        aria-label={saved ? "取消收藏" : "收藏站点"}
        aria-pressed={saved}
      >
        <Icon name="heart" size={17} />
        {!compact && (saved ? "已收藏" : "收藏")}
      </button>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function ReviewForm({ stationId }: { stationId: string }) {
  const { user } = useAuth(),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!user)
    return (
      <p className="muted">
        登录后分享真实使用感受。
        <Link className="text-link" href="/auth/login/">
          去登录 →
        </Link>
      </p>
    );
  return (
    <form
      className="review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        try {
          await send("/member/reviews/" + stationId + "/", {
            body: data.get("body"),
            rating: Number(data.get("rating")),
          });
          setMessage("评价已提交，审核后公开展示。");
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        你的评价
        <textarea
          name="body"
          rows={3}
          minLength={10}
          maxLength={1500}
          required
          placeholder="分享接入体验、适用场景或遇到的问题，避免包含密钥。"
        />
      </label>
      <div className="form-actions">
        <select name="rating" aria-label="评分">
          {[5, 4, 3, 2, 1].map((v) => (
            <option key={v} value={v}>
              {v} 星
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="button small"
          disabled={busy || !!message}
        >
          {message ? "已提交审核" : "提交评价"}
        </button>
      </div>
      <ErrorMessage error={error} />
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
