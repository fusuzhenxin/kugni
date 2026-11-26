"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { layoutViewport } from "@/lib/layout-viewport";
import type { Module } from "@/lib/types";
import { Brand, Icon } from "./ui";

function saveGroups(key: string, groups: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(groups));
  } catch {
    // Menu navigation also works when browser storage is unavailable.
  }
}

export function WorkspaceSidebar({
  modules,
  activeKey,
  surface,
  userId,
  search,
  open,
}: {
  modules: Module[];
  activeKey?: string;
  surface: "platform" | "publisher";
  userId: string;
  search: string;
  open: boolean;
}) {
  const nav = useRef<HTMLElement>(null),
    id = useId(),
    activeGroup = modules.find((m) => m.key === activeKey)?.group,
    groupNames = JSON.stringify([...new Set(modules.map((m) => m.group))]),
    storageKey = `kugni:workspace-menu:v1:${surface}:${userId}`;
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]),
    [ready, setReady] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const filtered = modules.filter((m) =>
    (m.title + m.group).toLocaleLowerCase().includes(query),
  );
  const groups = [...new Set(filtered.map((m) => m.group))];

  useEffect(() => {
    const allowed: string[] = JSON.parse(groupNames);
    let saved: string[] = [];
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(storageKey) || "[]",
      );
      if (Array.isArray(value))
        saved = value.filter(
          (g): g is string => typeof g === "string" && allowed.includes(g),
        );
    } catch {
      // Ignore unavailable storage or outdated menu preferences.
    }
    const next = [
      ...new Set([...saved, ...(activeGroup ? [activeGroup] : [])]),
    ];
    setExpandedGroups(next);
    setReady(true);
    saveGroups(storageKey, next);
  }, [storageKey, activeKey, activeGroup, groupNames]);

  useEffect(() => {
    const panel = nav.current;
    if (!panel || !ready) return;
    const reveal = () => {
      if (query) {
        panel.scrollTop = 0;
        return;
      }
      const link = panel.querySelector<HTMLElement>('[aria-current="page"]');
      if (!link || link.closest('[aria-hidden="true"]')) return;
      const item = link.getBoundingClientRect(),
        box = panel.getBoundingClientRect(),
        { zoom } = layoutViewport(panel);
      // Move only the menu scroll area, preserving the content page's position.
      if (item.top < box.top + 8)
        panel.scrollTop += (item.top - box.top - 8) / zoom;
      else if (item.bottom > box.bottom - 8)
        panel.scrollTop += (item.bottom - box.bottom + 8) / zoom;
    };
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    panel
      .querySelectorAll(".admin-nav-panel")
      .forEach((p) => observer.observe(p));
    // Follow accordion expansion during navigation, then leave manual scrolling alone.
    const timer = window.setTimeout(() => {
      reveal();
      observer.disconnect();
    }, 260);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeKey, query, open, ready]);

  const toggle = (group: string) => {
    const next = expandedGroups.includes(group)
      ? expandedGroups.filter((g) => g !== group)
      : [...expandedGroups, group];
    setExpandedGroups(next);
    saveGroups(storageKey, next);
  };

  return (
    <aside className={"admin-sidebar " + (open ? "open" : "")}>
      <div className="admin-brand">
        <Link
          href={
            surface === "platform"
              ? "/admin/dashboard/"
              : "/publisher/dashboard/"
          }
        >
          <Brand />
        </Link>
        <small>
          {surface === "platform"
            ? "平台管理 · 澄蓝工作区"
            : "站长推广 · 澄蓝工作区"}
        </small>
      </div>
      <nav aria-label="后台导航" ref={nav}>
        {groups.map((group, index) => {
          const expanded =
            Boolean(query) ||
            (ready ? expandedGroups.includes(group) : group === activeGroup);
          const panelId = `${id}-group-${index}`;
          return (
            <div
              className="admin-nav-group"
              data-active={group === activeGroup || undefined}
              key={group}
            >
              <button
                type="button"
                className="admin-nav-heading"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(group)}
                disabled={Boolean(query)}
              >
                <span>{group}</span>
                <Icon name="chevron" size={15} />
              </button>
              <div
                id={panelId}
                className="admin-nav-panel"
                aria-hidden={!expanded}
                inert={!expanded}
              >
                <div className="admin-nav-links">
                  {filtered
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <Link
                        href={m.path}
                        className={m.key === activeKey ? "active" : ""}
                        aria-current={m.key === activeKey ? "page" : undefined}
                        key={m.key}
                      >
                        <Icon name={m.icon} size={17} />
                        <span>{m.title}</span>
                      </Link>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
        {!groups.length && <p className="admin-nav-empty">没有匹配的菜单</p>}
      </nav>
      <div className="admin-sidebar-bottom">
        <Link href="/">返回前台 ↗</Link>
        <Icon name="sparkles" size={16} />
      </div>
    </aside>
  );
}
