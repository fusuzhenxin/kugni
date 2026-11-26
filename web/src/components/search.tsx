"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import type { ListResult, Station } from "@/lib/types";
import { Icon } from "./ui";

export function SearchDialog() {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    [query, setQuery] = useState(""),
    [items, setItems] = useState<Station[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const open = useCallback(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await api<ListResult<Station>>(
          "/public/stations/?page_size=6&q=" + encodeURIComponent(query),
        );
        if (active) {
          setItems(data.items);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setBusy(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <>
      <button className="header-search" onClick={open}>
        <Icon name="search" size={15} />
        <span>搜索站点 / 模型</span>
        <kbd>Ctrl K</kbd>
      </button>
      <dialog
        className="search-dialog"
        ref={dialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <header>
          <Icon name="search" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索站点"
            placeholder="站点名称、域名或你想找的模型…"
          />
          <button
            className="icon-button"
            aria-label="关闭搜索"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="search-results">
          <span className="eyebrow">
            {query ? "搜索结果" : "从这些连接开始"}
          </span>
          {busy && <p role="status">正在查找…</p>}
          {error && <p role="alert">{error}</p>}
          {!busy && !error && !items.length && (
            <p>没有找到结果，换一个关键词试试。</p>
          )}
          {items.map((s) => (
            <Link
              key={s.id}
              href={"/stations/" + s.slug + "/"}
              onClick={() => dialog.current?.close()}
            >
              <span className="station-logo">
                {s.logo && <img src={s.logo} alt="" width="32" height="32" />}
              </span>
              <span>
                <strong>{s.name}</strong>
                <small>{s.models.join(" · ")}</small>
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
        <footer>
          <span>直接搜索，找到适合你的连接</span>
          <kbd>Esc 关闭</kbd>
        </footer>
      </dialog>
    </>
  );
}
