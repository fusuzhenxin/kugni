"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import type { Entity } from "@/lib/types";
import { text } from "@/lib/types";
import { track } from "./track";
import { Icon } from "./ui";

export function AdSlot({ placement }: { placement: string }) {
  const [items, setItems] = useState<Entity[]>([]),
    ref = useRef<HTMLDivElement>(null),
    viewed = useRef(new Set<string>());
  useEffect(() => {
    api<{ items: Entity[] }>(
      "/public/ads/?placement=" + encodeURIComponent(placement),
    )
      .then((d) => setItems(d.items))
      .catch(() => {});
  }, [placement]);
  useEffect(() => {
    if (!ref.current || !items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting))
          for (const item of items)
            if (!viewed.current.has(item.id)) {
              viewed.current.add(item.id);
              track("impression", item.id);
            }
      },
      { threshold: 0.5 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [items]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="ad-slot">
      {items.map((item) => (
        <a
          key={item.id}
          href={String(item.target)}
          rel="sponsored noopener noreferrer"
          target="_blank"
          onClick={() => track("adclick", item.id)}
        >
          {!!item.creative && <img src={String(item.creative)} alt="" />}
          <span className="badge">推广</span>
          <div>
            <strong>{text(item.headline || item.name)}</strong>
            <p>{text(item.description)}</p>
          </div>
          <Icon name="arrow" size={18} />
        </a>
      ))}
    </div>
  );
}
