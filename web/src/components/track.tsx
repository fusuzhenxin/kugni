"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

function visitor() {
  let id = localStorage.getItem("kugni.visitor");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("kugni.visitor", id);
  }
  return id;
}
function session() {
  const previous = JSON.parse(
    sessionStorage.getItem("kugni.visit-session") || "null",
  );
  const id =
    previous && Date.now() - previous.at < 30 * 60 * 1000
      ? previous.id
      : crypto.randomUUID();
  sessionStorage.setItem(
    "kugni.visit-session",
    JSON.stringify({ id, at: Date.now() }),
  );
  return id as string;
}
export function track(kind: string, campaignId?: string) {
  try {
    fetch("/api/v1/track/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        visitor: visitor(),
        session: session(),
        kind,
        path: location.pathname,
        referrer: document.referrer,
        campaignId,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Storage unavailable: skip anonymous analytics. */
  }
}
export function PageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/(?:en\/)?(admin|publisher|account|auth)(\/|$)/.test(pathname))
      return;
    let id: string, visitorId: string, sessionId: string;
    try {
      id = crypto.randomUUID();
      visitorId = visitor();
      sessionId = session();
    } catch {
      return;
    }
    const start = Date.now();
    const data = {
      id,
      visitor: visitorId,
      session: sessionId,
      kind: "pageview",
      path: pathname,
      referrer: document.referrer,
    };
    fetch("/api/v1/track/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => {});
    const finish = () => {
      fetch("/api/v1/track/events/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          kind: "duration",
          duration: Math.min(3600, Math.round((Date.now() - start) / 1000)),
        }),
        keepalive: true,
      }).catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") finish();
      else track("heartbeat");
    };
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") track("heartbeat");
    }, 30000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", finish);
    return () => {
      finish();
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", finish);
    };
  }, [pathname]);
  return null;
}
export function OutboundLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      className={className}
      onClick={() => track("outbound")}
    >
      {children}
    </a>
  );
}
