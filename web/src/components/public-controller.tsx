"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPresentation } from "@/presentation/render.mjs";
import { api, send } from "@/lib/client-api";
import { useAuth } from "./providers";
import { reportView, basicReport } from "@/presentation/report.mjs";
import createShare from "@/presentation/templates/report-share.mjs";
import { enhanceModelPickers } from "./public-model-picker";
import { AuthPage } from "./auth-page";
import { EmailVerification } from "./email-verification";
import type { Catalog, Content, Entity, Station } from "@/lib/types";
import { localePath } from "@/presentation/localization.mjs";

export interface PublicPayload {
  locale?: string;
  translations?: Record<string, string>;
  pendingTranslations?: string[];
  path: string;
  query: string;
  catalog: Catalog;
  stations: Station[];
  pricing: { items: Entity[]; source: Entity[] };
  reports: Entity[];
  plans: Entity[];
  importedModels?: { items: Entity[]; total: number; updatedAt: string };
  importedPackages?: { items: Entity[]; total: number; updatedAt: string };
  content: Content;
}
type View = Record<string, any>;
const protocolNames: Record<string, string> = {
  chat: "OpenAI Chat Completions",
  responses: "OpenAI Responses",
  messages: "Anthropic Messages",
  gemini: "Google Gemini",
};
export function PublicSite({ payload }: { payload: PublicPayload }) {
  const locale = payload.locale || "zh-CN";
  const navigate = (url: string) => location.assign(localePath(url, locale));
  const { user, loading, refresh, logout } = useAuth();
  const [view, setView] = useState<View>({}),
    [member, setMember] = useState<View>({}),
    [theme, setTheme] = useState("light"),
    [width, setWidth] = useState(1440),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [searchIndex, setSearchIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<View | null>(null);
  const host = useRef<HTMLDivElement>(null),
    searchDialog = useRef<HTMLDialogElement>(null),
    modal = useRef<HTMLDialogElement>(null),
    previousFocus = useRef<HTMLElement | null>(null);
  const [modalBody, setModalBody] = useState("");
  const inputFocus = useRef<{
    selector: string;
    position: number | null;
  } | null>(null);
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fieldChange = useRef<(event: Event) => Promise<void>>(undefined);
  useEffect(() => {
    // Presentation HTML is server-rendered. Use native delegation for its fields:
    // React's change plugin tracks only inputs owned by a React component.
    const node = host.current!;
    const changed = (event: Event) => {
      void fieldChange
        .current?.(event)
        .catch((error) => setMessage(error.message));
    };
    const typed = (event: Event) => {
      if (
        (event.target as HTMLElement).matches(
          "#price-form input,#wk-history-search,#wk-saved-search,#wk-picker-search,#perk-search",
        )
      )
        changed(event);
    };
    node.addEventListener("change", changed);
    node.addEventListener("input", typed);
    return () => {
      node.removeEventListener("change", changed);
      node.removeEventListener("input", typed);
    };
  }, []);
  const closeNavigation = () => {
    host.current
      ?.querySelectorAll<HTMLElement>("[data-nav-menu]")
      .forEach((n) => (n.hidden = true));
    host.current
      ?.querySelectorAll<HTMLElement>("[data-nav-toggle]")
      .forEach((n) => n.setAttribute("aria-expanded", "false"));
  };
  useEffect(() => () => clearTimeout(navTimer.current), []);
  const [reportRecord, setReportRecord] = useState<View | null>(null);
  const reportId = payload.path.match(
    /^\/tools\/api-check\/reports\/([^/]+)$/,
  )?.[1];
  useEffect(() => {
    if (!reportId) return;
    let active = true;
    const token = new URLSearchParams(payload.query).get("token") || "";
    api<View>("/tests/reports/" + reportId + "/")
      .catch(() =>
        api<View>(
          "/public/reports/" +
            reportId +
            "/?token=" +
            encodeURIComponent(token),
        ),
      )
      .then((r) => {
        if (active) setReportRecord(r);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [reportId, payload.query, user?.id]);
  const loadMember = async () => {
    const [f, p, s, h, i] = await Promise.all([
      api<{ items: Station[] }>("/member/favorites/"),
      api<View>("/member/points/"),
      api<{ items: Entity[] }>("/member/submissions/"),
      api<{ items: View[] }>("/tests/executions/"),
      api<View>("/member/invitations/"),
    ]);
    setMember({
      saved: f.items.map((x) => x.id),
      points: {
        ...p,
        lastCheckin: p.tasks.some(
          (t: View) => t.id === "checkin" && t.status === "done",
        )
          ? new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Asia/Shanghai",
            }).format(new Date())
          : "",
        proof: {},
      },
      applications: s.items.map((a) => ({
        ...a,
        url: a.domain,
        desc: a.summary,
        kind: a.category,
        date: a.created,
      })),
      invitations: i.items,
      history: h.items.map((job) => ({
        ...job,
        model: job.reports?.[0]?.model || job.name,
        endpoint: "账户检测记录",
        time: new Date(job.created).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        }),
        failed: job.status === "failed",
        score: job.reports?.[0]?.score,
        first: "—",
      })),
    });
  };
  useEffect(() => {
    const t = localStorage.getItem("kugni.theme") || "light";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    const resize = () => setWidth(innerWidth);
    resize();
    addEventListener("resize", resize);
    try {
      setView((v) => ({
        ...v,
        compare: JSON.parse(localStorage.getItem("kugni.compare") || "[]"),
        view: localStorage.getItem("kugni.view") || "list",
      }));
    } catch {}
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (user) loadMember().catch((e) => setMessage(e.message));
    else setMember({});
  }, [user?.id]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (modalBody) modal.current?.showModal();
  }, [modalBody]);
  useEffect(() => {
    if (payload.path === "/benefits" && user)
      send("/member/evidence/benefits/").catch(() => {});
  }, [payload.path, user?.id]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    let alive = true;
    const timer = setInterval(
      () =>
        api<View>("/tests/executions/" + job.id + "/")
          .then((j) => {
            if (!alive) return;
            setJob(j);
            if (!["queued", "running"].includes(j.status) && j.reports?.length)
              navigate("/tools/api-check/reports/" + j.reports[0].id + "/");
          })
          .catch((e) => setMessage(e.message)),
      1800,
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  const presentation = useMemo(
    () =>
      createPresentation(payload, {
        ...view,
        width,
        theme,
        member: { ...member, user, compare: view.compare || [] },
      }),
    [payload, view, member, user, width, theme],
  );
  const t = presentation.translate as (value: string) => string;
  useEffect(() => {
    if (host.current)
      return enhanceModelPickers(host.current, presentation.translate);
  }, [presentation.main]);
  useLayoutEffect(() => {
    const f = inputFocus.current;
    if (!f) return;
    inputFocus.current = null;
    const node = host.current?.querySelector<HTMLInputElement>(f.selector);
    node?.focus({ preventScroll: true });
    if (
      node &&
      f.position != null &&
      ["text", "search", "url"].includes(node.type)
    )
      node.setSelectionRange(f.position, f.position);
  }, [presentation.main]);
  const update = (patch: View) => setView((v) => ({ ...v, ...patch }));
  const requireLogin = () => {
    if (user) return true;
    navigate(
      "/auth/login/?next=" +
        encodeURIComponent(location.pathname + location.search),
    );
    return false;
  };
  const showModal = (html: string) => {
    setModalBody(presentation.finalize(html));
  };
  const openSearch = () => {
    previousFocus.current = document.activeElement as HTMLElement;
    setSearch("");
    setSearchIndex(0);
    searchDialog.current?.showModal();
  };
  const closeSearch = () => {
    searchDialog.current?.close();
    previousFocus.current?.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
        (e.key === "/" &&
          !(e.target as HTMLElement).closest("input,textarea,select"))
      ) {
        e.preventDefault();
        openSearch();
      }
      if (e.key === "Escape") {
        const languageMenu = host.current?.querySelector<HTMLDetailsElement>(
          "[data-language-menu]",
        );
        if (languageMenu?.open) {
          languageMenu.open = false;
          languageMenu.querySelector<HTMLElement>("summary")?.focus();
        }
        host.current
          ?.querySelector("#header")
          ?.removeAttribute("data-menu-open");
        host.current
          ?.querySelectorAll<HTMLElement>("[data-nav-menu]")
          .forEach((n) => (n.hidden = true));
        host.current
          ?.querySelectorAll<HTMLElement>("[aria-expanded=true]")
          .forEach((n) => n.setAttribute("aria-expanded", "false"));
      }
      const languageMenu = (
        e.target as HTMLElement
      ).closest<HTMLDetailsElement>("[data-language-menu]");
      if (
        languageMenu &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
      ) {
        e.preventDefault();
        languageMenu.open = true;
        const links = Array.from(
          languageMenu.querySelectorAll<HTMLAnchorElement>(
            "[data-language-option]",
          ),
        );
        const index = links.indexOf(
          document.activeElement as HTMLAnchorElement,
        );
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? links.length - 1
              : index < 0
                ? e.key === "ArrowUp"
                  ? links.length - 1
                  : 0
                : (index + (e.key === "ArrowDown" ? 1 : links.length - 1)) %
                  links.length;
        links[next]?.focus();
      }
      const group = (e.target as HTMLElement).closest<HTMLElement>(
        ".header-nav-group",
      );
      if (group && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const menu = group.querySelector<HTMLElement>("[data-nav-menu]")!;
        menu.hidden = false;
        group
          .querySelector("[data-nav-toggle]")
          ?.setAttribute("aria-expanded", "true");
        const links = Array.from(menu.querySelectorAll<HTMLAnchorElement>("a"));
        const index = links.indexOf(
          document.activeElement as HTMLAnchorElement,
        );
        links[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? links.length - 1
              : (index + (e.key === "ArrowDown" ? 1 : links.length - 1)) %
                links.length
        ]?.focus();
      }
    };
    const dismissLanguage = (event: PointerEvent | FocusEvent) => {
      const languageMenu = host.current?.querySelector<HTMLDetailsElement>(
        "[data-language-menu]",
      );
      if (languageMenu?.open && !languageMenu.contains(event.target as Node))
        languageMenu.open = false;
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", dismissLanguage);
    document.addEventListener("focusin", dismissLanguage);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", dismissLanguage);
      document.removeEventListener("focusin", dismissLanguage);
    };
  }, []);
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase(),
      sites = presentation.window.KUGNI_SOURCE.sites;
    const unique = new Map<string, View>();
    for (const station of sites)
      for (const row of station.publicModelTable.rows) {
        const name = String(row.cells?.[0] || "").trim();
        if (!name) continue;
        if (!unique.has(name))
          unique.set(name, { name, brand: row.brand, sites: new Set() });
        unique.get(name)!.sites.add(station.id);
      }
    const matchingModels = [...unique.values()]
      .sort(
        (a, b) => b.sites.size - a.sites.size || a.name.localeCompare(b.name),
      )
      .filter((m) => !q || (m.name + " " + m.brand).toLowerCase().includes(q));
    const matchingSites = sites.filter(
      (s: View) =>
        !q ||
        (s.name + " " + s.domain + " " + s.models.join(" "))
          .toLowerCase()
          .includes(q),
    );
    const models = matchingModels.slice(0, 6).map((m) => ({
      group: "模型",
      name: m.name,
      description: m.brand || "公开模型",
      href: localePath("/pricing/?model=" + encodeURIComponent(m.name), locale),
      image:
        presentation.templates.brandIcon(m.brand) ||
        presentation.templates.icon("layers"),
      meta: m.sites.size + " 个站点收录",
    }));
    const stations = matchingSites.slice(0, 8).map((s: View) => ({
      group: "站点",
      name: s.name,
      description: s.domain,
      href: localePath("/stations/" + s.slug + "/", locale),
      image: presentation.templates.workspaceContext().logo(s),
      meta: s.modelCount + " 个模型",
    }));
    return {
      items: [...models, ...stations],
      total: matchingModels.length + matchingSites.length,
      models: matchingModels.length,
      stations: matchingSites.length,
    };
  }, [search, presentation]);
  const results = searchResults.items;
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage("已复制");
  };
  const download = (value: unknown, name: string) => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const workspaceUpdate = (patch: View) =>
    update({ workspace: { ...view.workspace, ...patch } });
  const shareURL = async () => {
    if (!reportRecord) throw new Error("报告尚未载入");
    const token = new URLSearchParams(payload.query).get("token");
    if (reportRecord.visibility === "公开可见" || token)
      return location.origin + location.pathname + location.search;
    const result = await send<{ url: string }>(
      "/tests/reports/" + reportRecord.id + "/share/",
    );
    return location.origin + localePath(result.url, locale);
  };
  async function reportAction(action: string) {
    if (!reportRecord) throw new Error("报告尚未载入");
    if (action === "export") {
      download(reportRecord, "kugni-report-" + reportRecord.id + ".json");
      return;
    }
    if (action === "copyraw") {
      await copy(JSON.stringify(reportRecord.evidence, null, 2));
      return;
    }
    if (action === "report" || action === "raw") {
      host.current!.querySelector<HTMLElement>("#cr-report-panel")!.hidden =
        action !== "report";
      host.current!.querySelector<HTMLElement>("#cr-raw-panel")!.hidden =
        action !== "raw";
      host
        .current!.querySelectorAll<HTMLElement>(
          "[data-report-action=raw],[data-report-action=report]",
        )
        .forEach((n) =>
          n.setAttribute(
            "aria-selected",
            String(n.dataset.reportAction === action),
          ),
        );
      return;
    }
    const url = await shareURL();
    if (action === "link") {
      await copy(url);
      return;
    }
    if (action === "poster") {
      if (!(window as any).qrcode)
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/assets/vendor/qrcode-generator.js";
          script.onload = () => resolve();
          script.onerror = () => {
            script.remove();
            reject(new Error("二维码组件加载失败，请重试"));
          };
          document.head.append(script);
        });
      const sharing = createShare({
        ...presentation.window,
        host: host.current,
        document,
        location,
        qrcode: (window as any).qrcode,
        ClipboardItem: (window as any).ClipboardItem,
        translate: t,
        localize: presentation.finalize,
        locale,
        KUGNI_TOOL_REPORT_DATA: { shareURL: () => url },
      });
      sharing.open(reportView(reportRecord));
    }
  }
  async function change(event: Event) {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const { id, value } = input;
    const group = input.closest<HTMLElement>("[data-required-group]");
    if (group) {
      const any = !!group.querySelector("input:checked");
      group
        .querySelectorAll<HTMLInputElement>("input")
        .forEach((n, i) => (n.required = !any && i === 0));
    }
    if (input.closest("#price-form")) {
      inputFocus.current = {
        selector: id ? "#" + id : '#price-form [name="' + input.name + '"]',
        position:
          input instanceof HTMLInputElement ? input.selectionStart : null,
      };
      const f = new FormData(input.closest("form")!);
      if (
        view.priceMode === "snapshot" ||
        (payload.query.includes("model=") && !view.priceMode)
      )
        update({
          quote: {
            model: f.get("model"),
            query: f.get("q"),
            priced: f.has("priced"),
            sort: f.get("order"),
          },
        });
      else update({ pricing: { ...view.pricing, ...Object.fromEntries(f) } });
      return;
    }
    if (id === "demo-baseline") {
      update({ pricing: { ...view.pricing, base: value } });
      return;
    }
    if (input.dataset.atlasFilter)
      update({
        modelFilters: {
          ...view.modelFilters,
          [input.dataset.atlasFilter]: value,
        },
      });
    if (id === "plan-price")
      update({ planFilters: { ...view.planFilters, price: value } });
    const workspaceFields: Record<string, string> = {
      "wk-history-search": "historyQuery",
      "wk-history-order": "historyOrder",
      "wk-saved-search": "savedQuery",
      "wk-saved-brand": "savedBrand",
      "wk-saved-order": "savedOrder",
    };
    if (workspaceFields[id]) {
      inputFocus.current = {
        selector: "#" + id,
        position:
          input instanceof HTMLInputElement ? input.selectionStart : null,
      };
      workspaceUpdate({ [workspaceFields[id]]: value });
    }
    if (id === "wk-picker-search") {
      host.current
        ?.querySelectorAll<HTMLElement>(".wk-picker-option")
        .forEach(
          (n) => (n.hidden = !n.dataset.search?.includes(value.toLowerCase())),
        );
    }
    if (id === "wk-differences") {
      host.current
        ?.querySelectorAll<HTMLElement>("[data-equal]")
        .forEach(
          (n) =>
            (n.hidden =
              (input as HTMLInputElement).checked &&
              n.dataset.equal === "true"),
        );
    }
    if (["perk-search", "perk-brand", "perk-sort"].includes(id)) {
      inputFocus.current = {
        selector: "#" + id,
        position:
          input instanceof HTMLInputElement ? input.selectionStart : null,
      };
      update({
        benefits: {
          ...view.benefits,
          [{
            "perk-search": "query",
            "perk-brand": "brand",
            "perk-sort": "order",
          }[id]!]: value,
        },
      });
    }
    if (input.name === "count") {
      const count = Number(value);
      host.current!.querySelector("#candy-distribution-count")!.textContent =
        count + " / 20 " + t("题");
      host
        .current!.querySelectorAll("[data-candy-category]")
        .forEach(
          (node, i) =>
            (node.querySelector("div span")!.textContent =
              Math.floor(count / 4) + (i < count % 4 ? 1 : 0) + " " + t("题")),
        );
    }
    if (id === "developer-shell") {
      const dev = presentation.window.KUGNI_DEVELOPERS;
      host
        .current!.querySelectorAll<HTMLElement>("[data-developer-skill]")
        .forEach((n) => {
          const text = dev.installCommand(n.dataset.developerSkill, value);
          n.querySelector("pre")!.textContent = text;
          n.querySelector<HTMLElement>(
            "[data-developer-copy]",
          )!.dataset.developerCopy = text;
        });
    }
    if (id === "member-avatar-upload")
      try {
        const file = (input as HTMLInputElement).files?.[0];
        if (!file) return;
        const data = new FormData();
        data.set("file", file);
        const result = await api<{ url: string }>("/uploads/", {
          method: "POST",
          body: data,
        });
        await send(
          "/auth/profile/",
          {
            name: user!.name,
            bio: user!.profile.bio || "",
            avatar: result.url,
          },
          "PATCH",
        );
        await refresh();
        setMessage("头像已更新");
      } catch (error) {
        setMessage((error as Error).message);
      }
  }
  fieldChange.current = change;
  async function discover(button: HTMLElement) {
    if (!requireLogin()) return;
    const form = button.closest("form")!;
    const f = new FormData(form),
      secret = String(
        f.get("key") ||
          form.querySelector<HTMLInputElement>("#tool-api-key")?.value ||
          "",
      );
    const data = await send<View>("/tests/discover/", {
      baseUrl: f.get("endpoint"),
      secret,
      protocol:
        protocolNames[String(f.get("protocol"))] || "OpenAI Chat Completions",
      model: String(f.get("model") || "discovery"),
    });
    let list = form.querySelector<HTMLDataListElement>("datalist");
    const field = form.querySelector<HTMLInputElement | HTMLSelectElement>(
      "[name=model]",
    );
    if (field instanceof HTMLSelectElement) {
      field.innerHTML = data.models
        .map(
          (m: View) =>
            '<option value="' +
            presentation.templates.esc(m.id) +
            '">' +
            presentation.templates.esc(m.id) +
            "</option>",
        )
        .join("");
    } else {
      if (!list) {
        list = document.createElement("datalist");
        list.id = "discovered-models";
        form.append(list);
        field?.setAttribute("list", list.id);
      }
      list.innerHTML = data.models
        .map(
          (m: View) =>
            '<option value="' +
            presentation.templates.esc(m.id) +
            '"></option>',
        )
        .join("");
    }
    const input = form.querySelector<HTMLInputElement>("[name=model]");
    if (input) {
      if (data.models[0]) input.value = data.models[0].id;
      input.dispatchEvent(new Event("kugni:models"));
    }
    setMessage(
      data.models.length
        ? "已获取 " + data.models.length + " 个可用模型"
        : data.errors?.map((x: View) => x.error).join("；") ||
            "当前凭证未返回模型",
    );
  }
  async function click(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.closest(".header-nav-group")) closeNavigation();
    if (!target.closest(".header .nav,[data-header-menu-toggle]")) {
      host.current?.querySelector("#header")?.removeAttribute("data-menu-open");
      host.current
        ?.querySelector("[data-header-menu-toggle]")
        ?.setAttribute("aria-expanded", "false");
    }
    host.current
      ?.querySelectorAll<HTMLElement>(".filter-menu.open")
      .forEach((menu) => {
        if (!menu.contains(target)) {
          menu.classList.remove("open");
          menu
            .querySelector(".filter-trigger")
            ?.setAttribute("aria-expanded", "false");
        }
      });
    const tierLink = target.closest<HTMLAnchorElement>("[data-tier-link]");
    if (tierLink) {
      const tier = host.current?.querySelector<HTMLDetailsElement>(
        "#" + tierLink.dataset.tierLink,
      );
      if (tier) {
        tier.open = true;
        host.current
          ?.querySelectorAll("[data-tier-link]")
          .forEach((link) =>
            link.classList.toggle("selected", link === tierLink),
          );
      }
      return;
    }
    const node = (event.target as HTMLElement).closest<HTMLElement>(
      "button,[data-action],[data-nav-toggle],[data-header-menu-toggle],[data-member-action],[data-developer-client],[data-developer-copy],[data-contact-copy],[data-points-tab],[data-points-claim],[data-points-task-filter],[data-submission-action],[data-tool-mode],[data-report-question-filter],[data-report-question-jump],[data-tool-copy],[data-history-filter],[data-work-action],[data-perk-category],[data-perk-detail],[data-perk-reset],[data-perk-browse]",
    );
    if (!node) return;
    try {
      const a = node.dataset.action,
        v = node.dataset.value || "";
      if (node.id === "global-search-trigger" || a === "home-search") {
        openSearch();
        return;
      }
      if (node.hasAttribute("data-header-menu-toggle")) {
        const header = host.current!.querySelector("#header")!;
        const open = !header.hasAttribute("data-menu-open");
        header.toggleAttribute("data-menu-open", open);
        node.setAttribute("aria-expanded", String(open));
        node.setAttribute("aria-label", t(open ? "收起主导航" : "展开主导航"));
        return;
      }
      if (node.dataset.navToggle) {
        const menu = host.current!.querySelector<HTMLElement>(
          '[data-nav-menu="' + node.dataset.navToggle + '"]',
        )!;
        const open = menu.hidden;
        host
          .current!.querySelectorAll<HTMLElement>("[data-nav-menu]")
          .forEach((m) => (m.hidden = true));
        menu.hidden = !open;
        node.setAttribute("aria-expanded", String(open));
        return;
      }
      if (a === "theme") {
        const t = theme === "light" ? "dark" : "light";
        setTheme(t);
        localStorage.setItem("kugni.theme", t);
        document.documentElement.dataset.theme = t;
        return;
      }
      if (a === "save") {
        if (!requireLogin()) return;
        const saved = (member.saved || []).includes(v);
        await send(
          "/member/favorites/" + v + "/",
          {},
          saved ? "DELETE" : "PUT",
        );
        await loadMember();
        setMessage(saved ? "已取消收藏" : "已加入收藏");
      }
      if (a === "compare" || a === "work-pick-compare") {
        let ids = view.compare || [];
        ids = ids.includes(v)
          ? ids.filter((x: string) => x !== v)
          : ids.length < 4
            ? [...ids, v]
            : ids;
        if (ids.length === 4 && !ids.includes(v)) setMessage("最多对比 4 家");
        update({ compare: ids });
        localStorage.setItem("kugni.compare", JSON.stringify(ids));
      }
      if (a === "clear-compare") {
        update({ compare: [] });
        localStorage.setItem("kugni.compare", "[]");
      }
      if (a === "model") update({ model: v });
      if (a === "demo-mode") update({ priceMode: v });
      if (a === "demo-method" || a === "demo-scenario")
        update({
          pricing: {
            ...view.pricing,
            [a === "demo-method" ? "method" : "scenario"]: v,
          },
        });
      if (a === "atlas-sort")
        update({
          modelOrder: view.modelOrder === "price" ? "default" : "price",
        });
      if (a === "atlas-reset")
        update({
          modelFilters: {},
          brand: "全部",
          modelQuery: "",
          modelOrder: "default",
        });
      if (a === "brand") update({ brand: v });
      if (a === "plan-filter")
        update({
          planFilters: { ...view.planFilters, [node.dataset.key!]: v },
        });
      if (a === "plan-reset") update({ planFilters: {} });
      if (a === "plan-pick" || a === "plan-detail-pick") {
        const ids = view.selectedPlans || [];
        if (ids.includes(v))
          update({ selectedPlans: ids.filter((id: string) => id !== v) });
        else if (ids.length < 4) update({ selectedPlans: [...ids, v] });
        else setMessage("最多选择 4 个套餐");
      }
      if (a === "plan-detail") {
        const p = payload.plans.find((p) => p.id === v);
        if (p)
          showModal(
            "<h2>" +
              presentation.templates.esc(p.name) +
              "</h2><p>" +
              presentation.templates.esc(
                p.description || p.limits || "以服务商发布的套餐说明为准",
              ) +
              "</p>",
          );
      }
      if (a === "plan-guide")
        showModal(
          '<h2>编程套餐选购参考</h2><p>先确认工具与模型的兼容性，再核对额度、重置周期、并发和超额计费方式。</p><a href="/pricing/">查看价格对比 →</a>',
        );
      if (a === "plan-compare") {
        const selected = payload.plans.filter((p) =>
          (view.selectedPlans || []).includes(p.id),
        );
        if (selected.length < 2) throw new Error("请先选择至少两个套餐");
        showModal(
          "<h2>套餐对比</h2>" +
            selected
              .map(
                (p) =>
                  "<section><h3>" +
                  presentation.templates.esc(p.name) +
                  "</h3><p>" +
                  presentation.templates.esc(
                    p.limits || p.description || "未公开",
                  ) +
                  "</p></section>",
              )
              .join(""),
        );
      }
      if (a === "work-pick-compare")
        setModalBody(
          presentation.finalize(
            presentation.window.KUGNI_WORKSPACE.picker({
              ...presentation.templates.workspaceContext(),
              state: {
                ...presentation.templates.workspaceContext().state,
                compare: (view.compare || []).includes(v)
                  ? (view.compare || []).filter((id: string) => id !== v)
                  : (view.compare || []).length < 4
                    ? [...(view.compare || []), v]
                    : view.compare || [],
              },
            }),
          ),
        );
      if (a === "work-choose-sites")
        showModal(
          presentation.finalize(
            presentation.window.KUGNI_WORKSPACE.picker(
              presentation.templates.workspaceContext(),
            ),
          ),
        );
      if (a === "work-export-history")
        download(member.history || [], "kugni-history.json");
      if (a === "clear-saved") {
        if (!requireLogin()) return;
        await Promise.all(
          (member.saved || []).map((id: string) =>
            send("/member/favorites/" + id + "/", {}, "DELETE"),
          ),
        );
        await loadMember();
      }
      if (node.dataset.historyFilter)
        workspaceUpdate({ historyFilter: node.dataset.historyFilter });
      if (node.dataset.workAction === "history-reset")
        workspaceUpdate({ historyQuery: "", historyFilter: "all" });
      if (node.dataset.workAction === "saved-reset")
        workspaceUpdate({ savedQuery: "", savedBrand: "all" });
      if (node.dataset.perkCategory)
        update({
          benefits: { ...view.benefits, category: node.dataset.perkCategory },
        });
      if (node.hasAttribute("data-perk-reset")) update({ benefits: {} });
      if (node.hasAttribute("data-perk-browse")) {
        event.preventDefault();
        document
          .getElementById("perk-directory-title")
          ?.scrollIntoView({ behavior: "smooth" });
      }
      if (node.dataset.perkDetail)
        presentation.window.KUGNI_BENEFITS.details(
          {
            ...presentation.templates.workspaceContext(),
            modal: (_title: string, body: string) =>
              showModal(presentation.finalize(body)),
          },
          node.dataset.perkDetail,
        );
      if (node.dataset.toolReportAction || node.dataset.reportAction)
        await reportAction(
          node.dataset.toolReportAction || node.dataset.reportAction!,
        );
      if (node.dataset.reportQuestionFilter) {
        const filter = node.dataset.reportQuestionFilter;
        host
          .current!.querySelectorAll<HTMLElement>("[data-question-outcome]")
          .forEach(
            (n) =>
              (n.hidden =
                filter !== "all" && n.dataset.questionOutcome !== filter),
          );
        host
          .current!.querySelectorAll<HTMLElement>(
            "[data-report-question-filter]",
          )
          .forEach((n) => n.setAttribute("aria-pressed", String(n === node)));
      }
      if (node.dataset.reportQuestionJump)
        document
          .getElementById("tool-question-" + node.dataset.reportQuestionJump)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (node.dataset.toolCopy !== undefined)
        await copy(
          presentation.window.KUGNI_MODEL_TEST.prompt(
            Number(node.dataset.toolCopy),
          ),
        );
      if (node.dataset.toolAction === "questions")
        setMessage(
          "三道题固定采样，建议每题新开对话；重复测量请重新提交回答。",
        );
      if (a === "reset") update({ model: "全部", payment: "全部", query: "" });
      if (a === "view") {
        update({ view: v });
        localStorage.setItem("kugni.view", v);
      }
      if (a === "menu") {
        const menu = node.closest(".filter-menu")!;
        const open = menu.classList.toggle("open");
        node.setAttribute("aria-expanded", String(open));
      }
      if (a === "menu-pick") update({ [node.dataset.menu || "sort"]: v });
      if (a === "detail-section") {
        const target = document.getElementById(v);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        host
          .current!.querySelectorAll(".detail-tabs button")
          .forEach((b) =>
            b.classList.toggle(
              "active",
              (b as HTMLElement).dataset.value === v,
            ),
          );
      }
      if (
        [
          "detail-model-brand",
          "detail-model-page",
          "detail-model-mode",
          "detail-model-range",
          "detail-model-group",
        ].includes(a || "")
      ) {
        const id = host.current!.querySelector<HTMLElement>(
          "#source-model-browser",
        )!.dataset.site!;
        const next = new Map(view.detailViews || []);
        const current = (next.get(id) || { brand: "全部", page: 1 }) as View;
        next.set(
          id,
          a === "detail-model-brand"
            ? { ...current, brand: v, page: 1 }
            : a === "detail-model-mode"
              ? { ...current, mode: v, group: "", page: 1 }
              : a === "detail-model-range"
                ? { ...current, range: v }
                : a === "detail-model-group"
                  ? {
                      ...current,
                      mode: "model",
                      brand: "全部",
                      group: v,
                      page: 1,
                    }
                  : { ...current, page: Number(v) },
        );
        update({ detailViews: [...next] });
      }
      if (
        ["home-show-key", "show-key"].includes(a || "") ||
        node.dataset.toolAction === "key" ||
        node.dataset.memberAction === "password"
      ) {
        const input = (node.parentElement!.querySelector("input") ||
          node.previousElementSibling) as HTMLInputElement;
        input.type = input.type === "password" ? "text" : "password";
        if (node.dataset.memberAction === "password") {
          node.setAttribute("aria-pressed", String(input.type === "text"));
          node.setAttribute(
            "aria-label",
            t(input.type === "text" ? "隐藏密码" : "显示密码"),
          );
        } else
          node.textContent = t(input.type === "password" ? "显示" : "隐藏");
      }
      if (
        ["models", "example"].includes(node.dataset.toolAction || "") ||
        a === "home-demo-key" ||
        a === "demo-key"
      )
        await discover(node);
      if (node.dataset.contactCopy) await copy(node.dataset.contactCopy);
      if (node.dataset.developerCopy) await copy(node.dataset.developerCopy);
      if (node.dataset.developerClient) {
        const name = node.dataset.developerClient,
          dev = presentation.window.KUGNI_DEVELOPERS;
        host.current!.querySelector("#developer-current-client")!.textContent =
          name;
        host.current!.querySelector("#developer-selected-visual")!.innerHTML =
          presentation.finalize(
            dev.artwork(
              "client-" + dev.clientSlug(name),
              640,
              400,
              name + " 客户端标识配图",
              true,
            ),
          );
        host.current!.querySelector("#developer-install-prompt")!.textContent =
          dev.prompt(name);
        host.current!.querySelector("#developer-install-copy")!.innerHTML =
          presentation.finalize(
            dev.copyButton(t(dev.prompt(name)), "复制接入说明"),
          );
        host
          .current!.querySelectorAll<HTMLElement>("[data-developer-client]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === node)));
      }
      const memberAction = node.dataset.memberAction;
      if (memberAction === "menu") {
        const menu =
          host.current!.querySelector<HTMLElement>("#member-dropdown")!;
        menu.hidden = !menu.hidden;
        node.setAttribute("aria-expanded", String(!menu.hidden));
      }
      if (node.hasAttribute("data-email-code")) {
        const form = node.closest("form")!;
        const email = form.querySelector<HTMLInputElement>('[name="email"]')!;
        if (!email.reportValidity()) return;
        if (Date.now() < Number(node.dataset.nextEmailCode || 0)) {
          setMessage("请间隔 60 秒再获取验证码");
          return;
        }
        (node as HTMLButtonElement).disabled = true;
        try {
          const result = await send<{ message: string }>("/auth/email-code/", {
            email: email.value,
          });
          node.dataset.nextEmailCode = String(Date.now() + 60000);
          setMessage(result.message);
        } finally {
          (node as HTMLButtonElement).disabled = false;
        }
      }
      if (memberAction === "logout") await logout();
      if (memberAction === "settings-tab") update({ settingsTab: v });
      if (memberAction === "submission-filter") update({ submissionFilter: v });
      if (memberAction === "application") {
        const row = member.applications?.find((r: View) => r.id === v);
        if (row)
          showModal(
            presentation.finalize(
              presentation.window.KUGNI_SUBMISSION.details(
                row,
                presentation.templates.accountContext(),
              ),
            ),
          );
      }
      if (memberAction === "copy-invite")
        await copy("https://www.kugni.com/auth/register/?invite=" + user?.id);
      if (memberAction === "copy-code" && user) await copy(user.id);
      if (
        memberAction === "checkin" ||
        node.hasAttribute("data-points-claim")
      ) {
        if (!requireLogin()) return;
        await send(
          "/member/points/claim/" +
            (node.dataset.pointsClaim || "checkin") +
            "/",
        );
        await loadMember();
        setMessage("积分已到账");
      }
      if (node.dataset.pointsTab) update({ pointsTab: node.dataset.pointsTab });
      if (node.dataset.pointsTaskFilter)
        update({ taskFilter: node.dataset.pointsTaskFilter });
      if (node.dataset.pointsFilter)
        update({ recordFilter: node.dataset.pointsFilter });
      if (node.hasAttribute("data-points-records"))
        update({ pointsTab: "records", recordFilter: "spent" });
      if (node.dataset.pointsRedeem) {
        if (!requireLogin()) return;
        const reward = member.points.rewards.find(
          (r: View) => r.id === node.dataset.pointsRedeem,
        );
        if (!reward) return;
        const e = presentation.templates.esc;
        showModal(
          '<div class="points-redeem-confirm"><h2>确认兑换权益</h2><h3>' +
            e(reward.name) +
            "</h3><dl><div><dt>当前积分</dt><dd>" +
            member.points.balance +
            "</dd></div><div><dt>本次消耗</dt><dd>−" +
            e(reward.cost) +
            "</dd></div><div><dt>兑换后剩余</dt><dd>" +
            (member.points.balance - Number(reward.cost)) +
            '</dd></div></dl><p>提交后扣除积分，权益按平台审核结果发放。</p><div class="points-dialog-actions"><button class="member-button member-secondary" data-action="close">再想想</button><button class="member-button" data-points-confirm="' +
            e(reward.id) +
            '">确认兑换</button></div></div>',
        );
      }
      if (node.dataset.pointsConfirm) {
        if (!requireLogin()) return;
        const result = await send<{ message: string }>(
          "/member/points/redeem/" + node.dataset.pointsConfirm + "/",
        );
        modal.current?.close();
        await loadMember();
        setMessage(result.message);
      }
      if (node.hasAttribute("data-points-rules"))
        showModal(
          "<h2>积分规则</h2><p>每日任务按北京时间更新；积分以服务端核验为准。评价、贡献和邀请审核通过后发放，兑换以实际权益和库存为准。</p>",
        );
      if (node.dataset.submissionAction === "add-social") {
        const list = host.current!.querySelector("#sf-social-rows")!;
        if (list.children.length < 5)
          list.insertAdjacentHTML("beforeend", presentation.socialRow());
      }
      if (node.dataset.submissionAction === "remove-social")
        node.closest(".sf-social-row")?.remove();
      if (node.dataset.submissionAction === "password") {
        const i = node.parentElement!.querySelector("input")!;
        i.type = i.type === "password" ? "text" : "password";
      }
      if (node.dataset.submissionAction === "generate") {
        const i =
          host.current!.querySelector<HTMLInputElement>("#sf-probe-password")!;
        i.value = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
      }
      if (node.dataset.toolMode) {
        const mode = node.dataset.toolMode;
        host.current!.querySelector<HTMLFormElement>(
          "#model-test-form",
        )!.hidden = mode !== "api";
        host.current!.querySelector<HTMLFormElement>(
          "#model-test-manual-form",
        )!.hidden = mode !== "manual";
        host
          .current!.querySelectorAll<HTMLElement>("[data-tool-mode]")
          .forEach((b) => b.setAttribute("aria-selected", String(b === node)));
      }
      if (a === "close") modal.current?.close();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function submit(event: React.FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    if (!form.matches("form")) return;
    if (form.hasAttribute("data-catalog-filter")) return;
    event.preventDefault();
    if (busy) return;
    const f = new FormData(form),
      value = (name: string) => String(f.get(name) || "");
    setBusy(true);
    try {
      if (form.id === "member-auth-form") {
        const registering = form.dataset.mode === "register";
        if (registering && value("password") !== value("confirmPassword"))
          throw new Error("两次密码不一致");
        const session = await send<View>(
          registering ? "/auth/register/" : "/auth/login/",
          {
            email: value("email"),
            password: value("password"),
            ...(registering
              ? {
                  name: value("name"),
                  code: value("code"),
                  invite:
                    new URLSearchParams(location.search).get("invite") || "",
                }
              : {}),
          },
        );
        await refresh();
        const next = new URLSearchParams(location.search).get("next");
        navigate(
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : session.user?.surface === "platform"
              ? "/admin/dashboard/"
              : session.user?.surface === "publisher"
                ? "/publisher/dashboard/"
                : "/account/",
        );
      } else if (form.id === "member-forgot-form") {
        await send("/auth/password-reset/request/", { email: value("email") });
        setMessage("如邮箱已注册，重置指引将发送到邮箱。");
      } else if (form.id === "member-profile-form") {
        if (!requireLogin()) return;
        await send(
          "/auth/profile/",
          {
            name: value("name"),
            bio: value("bio"),
            avatar: user?.profile.avatar || "",
          },
          "PATCH",
        );
        await refresh();
        setMessage("资料已保存");
      } else if (form.id === "member-password-form") {
        if (value("newPassword") !== value("confirmPassword"))
          throw new Error("两次新密码不一致");
        await send("/auth/password/", {
          current: value("currentPassword"),
          password: value("newPassword"),
        });
        form.reset();
        setMessage("密码已修改");
      } else if (form.id === "member-notifications-form") {
        if (!requireLogin()) return;
        await send(
          "/auth/profile/",
          {
            name: user!.name,
            bio: user!.profile.bio || "",
            avatar: user!.profile.avatar || "",
            notifications: {
              review: f.has("review"),
              benefits: f.has("benefits"),
            },
          },
          "PATCH",
        );
        await refresh();
        setMessage("消息偏好已保存");
      } else if (form.id === "apply-form") {
        if (!requireLogin()) return;
        const categories = f.getAll("categories").map(String),
          category = payload.catalog.categories.find(
            (c) => c.name === categories[0],
          );
        if (!category) throw new Error("请选择站点分类");
        if (value("desc").length < 20)
          throw new Error("请至少填写 20 字的网站介绍，方便审核与收录。");
        await send("/member/submissions/", {
          name: value("name"),
          domain: value("url"),
          category: category.slug,
          summary: value("desc"),
          contact: value("contact"),
          models: f.getAll("models"),
          payments: f.getAll("payments"),
          invoice: value("invoice"),
          ...Object.fromEntries(
            [
              "refund",
              "promo",
              "minRecharge",
              "policyNotes",
              "notes",
              "email",
            ].map((n) => [n, value(n)]),
          ),
          socialLinks: Array.from(form.querySelectorAll(".sf-social-row"))
            .map((row) => ({
              platform: row.querySelector("select")!.value,
              url: row.querySelector("input")!.value,
            }))
            .filter((row) => row.url),
        });
        navigate("/account/submissions/");
      } else if (form.id === "review-form") {
        if (!requireLogin()) return;
        await send("/member/reviews/" + form.dataset.site + "/", {
          body: value("text"),
          rating: Number(value("rating")),
        });
        form.reset();
        setMessage("评价已提交审核");
      } else if (
        ["home-check-form", "check-form", "model-test-form"].includes(form.id)
      ) {
        if (!requireLogin()) return;
        const secret =
          value("key") ||
          form.querySelector<HTMLInputElement>("#tool-api-key")?.value ||
          "";
        const type = payload.path.includes("candy")
          ? "糖果测试"
          : payload.path.includes("fingerprint")
            ? "模型指纹"
            : value("testType") || "基础可用性";
        const data = await send<View>("/tests/executions/", {
          baseUrl: value("endpoint"),
          secret,
          model: value("model"),
          protocol:
            protocolNames[value("protocol")] || "OpenAI Chat Completions",
          type,
          ...(type === "糖果测试"
            ? { questionCount: Number(value("count") || 10) }
            : {}),
        });
        form
          .querySelectorAll<HTMLInputElement>("input[type=password]")
          .forEach((i) => (i.value = ""));
        setJob({ ...data, reports: [] });
        setMessage("检测已进入队列，请等待实际结果。");
      } else if (form.id === "model-test-manual-form") {
        if (!requireLogin()) return;
        const result = await send<{ id: string }>(
          "/tests/fingerprint-samples/",
          {
            model: value("manualModel") || "手动样本",
            answers: [value("answer0"), value("answer1"), value("answer2")],
          },
        );
        navigate("/tools/api-check/reports/" + result.id + "/");
      } else if (form.id === "provider-search")
        update({ providerQuery: value("q") });
      else if (form.id === "model-search") update({ modelQuery: value("q") });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(payload.query).get("execution");
    if (!id || !user || payload.path !== "/tools/history") return;
    let active = true;
    api<View>("/tests/executions/" + id + "/")
      .then((job) => {
        if (active)
          showModal(
            "<h2>" +
              presentation.templates.esc(job.name) +
              "</h2><p>执行状态：" +
              presentation.templates.esc(job.status) +
              "</p>" +
              job.reports
                .map(
                  (r: View) =>
                    '<p><a href="/tools/api-check/reports/' +
                    encodeURIComponent(r.id) +
                    '/">' +
                    presentation.templates.esc(r.model + " · " + r.type) +
                    " 查看报告 →</a></p>",
                )
                .join(""),
          );
      })
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, [payload.path, payload.query, user?.id]);
  const resetConfirm = payload.path === "/auth/password-reset/confirm";
  const privatePath =
    /^\/account(?:\/|$)/.test(payload.path) &&
    payload.path !== "/account/points";
  return (
    <div
      className="public-site navigation-ready"
      data-theme={theme}
      ref={host}
      onClick={click}
      onSubmit={submit}
      onPointerOver={(e) => {
        if (width <= 1100) return;
        const group = (e.target as HTMLElement).closest<HTMLElement>(
          ".header-nav-group",
        );
        if (group) {
          clearTimeout(navTimer.current);
          host.current
            ?.querySelectorAll<HTMLElement>("[data-nav-menu]")
            .forEach(
              (menu) =>
                (menu.hidden = menu.dataset.navMenu !== group.dataset.navGroup),
            );
          host.current
            ?.querySelectorAll<HTMLElement>("[data-nav-toggle]")
            .forEach((n) =>
              n.setAttribute(
                "aria-expanded",
                String(n.dataset.navToggle === group.dataset.navGroup),
              ),
            );
        }
      }}
      onPointerOut={(e) => {
        if (width <= 1100) return;
        const group = (e.target as HTMLElement).closest(".header-nav-group");
        if (group && !group.contains(e.relatedTarget as Node))
          navTimer.current = setTimeout(closeNavigation, 160);
      }}
    >
      <header
        className="header"
        id="header"
        dangerouslySetInnerHTML={{ __html: presentation.header }}
      />
      <main id="main" tabIndex={-1} aria-busy={busy || undefined}>
        {privatePath && !loading && !user ? (
          <div className="container page">
            <h1>{t("登录后查看你的个人空间")}</h1>
            <a
              className="btn primary"
              href={localePath(
                "/auth/login/?next=" +
                  encodeURIComponent(localePath(payload.path + "/", locale)),
                locale,
              )}
            >
              {t("去登录 →")}
            </a>
          </div>
        ) : reportId ? (
          <div
            className="container page"
            dangerouslySetInnerHTML={{
              __html: reportRecord
                ? reportRecord.type === "糖果测试" &&
                  reportRecord.evidence.success &&
                  reportRecord.score != null
                  ? presentation.finalize(
                      presentation.window.KUGNI_TOOL_REPORTS.candyView(
                        reportView(reportRecord),
                      ),
                    )
                  : reportRecord.type === "模型指纹" &&
                      reportRecord.evidence.success
                    ? presentation.finalize(
                        presentation.window.KUGNI_TOOL_REPORTS.fingerprintView(
                          reportView(reportRecord),
                        ),
                      )
                    : presentation.finalize(
                        basicReport(reportRecord, presentation.templates.esc),
                      )
                : presentation.finalize(
                    '<section class="connection-report"><h1>检测报告</h1><p>正在读取报告，或当前账户无权访问。</p></section>',
                  ),
            }}
          />
        ) : resetConfirm ? (
          <div className="platform-site">
            <div className="container page">
              <AuthPage
                mode="reset"
                locale={locale}
                translations={payload.translations}
              />
            </div>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: presentation.main }} />
        )}
        {user && payload.path.replace(/\/$/, "") === "/account/settings" && (
          <EmailVerification locale={locale} />
        )}
        {job && (
          <section className="container page">
            <p role="status">
              {t("检测状态：")}
              {job.status} · {job.completed || 0} / {job.total || 1}
            </p>
            {job.error && <p>{t(job.error)}</p>}
          </section>
        )}
      </main>
      <footer
        id="footer"
        dangerouslySetInnerHTML={{ __html: presentation.footer }}
      />
      <div
        id="compare-tray"
        dangerouslySetInnerHTML={{ __html: presentation.tray }}
      />
      <div
        id="toast"
        className={message ? "show" : ""}
        role="status"
        aria-live="polite"
      >
        {t(message)}
      </div>
      <dialog id="modal" ref={modal} onClose={() => setModalBody("")}>
        <div id="modal-content">
          <div className="modal-body">
            <button
              type="button"
              className="icon-btn"
              data-action="close"
              aria-label={t("关闭弹窗")}
            >
              ×
            </button>
            <div dangerouslySetInnerHTML={{ __html: modalBody }} />
          </div>
        </div>
      </dialog>
      <dialog
        id="discovery-search"
        aria-label={t("全站搜索")}
        ref={searchDialog}
        onCancel={closeSearch}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSearch();
        }}
      >
        <div className="discovery-input-row">
          <span
            dangerouslySetInnerHTML={{
              __html: presentation.templates.icon("search"),
            }}
          />
          <input
            id="discovery-query"
            type="search"
            placeholder={t("搜索站点、模型名称或域名…")}
            aria-label={t("搜索站点或模型")}
            role="combobox"
            aria-expanded="true"
            aria-controls="discovery-results"
            aria-autocomplete="list"
            aria-activedescendant={
              results.length ? "discovery-option-" + searchIndex : undefined
            }
            autoComplete="off"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setSearchIndex(
                  (i) =>
                    (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) %
                    Math.max(1, results.length),
                );
              }
              if (e.key === "Enter" && results[searchIndex])
                navigate(results[searchIndex].href);
            }}
          />
          <button
            type="button"
            className="discovery-clear"
            aria-label={t("清空搜索")}
            hidden={!search}
            onClick={() => {
              setSearch("");
              setSearchIndex(0);
              document.getElementById("discovery-query")?.focus();
            }}
            dangerouslySetInnerHTML={{
              __html: presentation.templates.icon("close"),
            }}
          />
          <button
            type="button"
            className="discovery-close"
            aria-label={t("关闭搜索")}
            onClick={closeSearch}
          >
            <kbd>esc</kbd>
          </button>
        </div>
        <div id="discovery-results" role="listbox" aria-label={t("搜索结果")}>
          {["模型", "站点"].map((group) => {
            const rows = results.filter((r: View) => r.group === group);
            return rows.length ? (
              <div
                role="group"
                aria-label={t(group)}
                className="discovery-group"
                key={group}
              >
                <div className="discovery-group-title">
                  {t(group)}
                  <span>
                    {search
                      ? t("找到") +
                        " " +
                        (group === "模型"
                          ? searchResults.models
                          : searchResults.stations) +
                        " " +
                        t("项")
                      : t("推荐探索")}
                  </span>
                </div>
                {rows.map((r: View) => {
                  const index = results.indexOf(r);
                  return (
                    <a
                      id={"discovery-option-" + index}
                      data-discovery-index={index}
                      className="discovery-result"
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === searchIndex}
                      href={r.href}
                      key={r.href}
                      onPointerMove={() => setSearchIndex(index)}
                    >
                      <span
                        className="discovery-logo"
                        dangerouslySetInnerHTML={{ __html: r.image }}
                      />
                      <span className="discovery-copy">
                        <strong>{t(r.name)}</strong>
                        <small>{t(r.description)}</small>
                      </span>
                      <span className="discovery-meta">{t(r.meta)}</span>
                      <span className="discovery-enter" aria-hidden="true">
                        ↵
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : null;
          })}
          {!results.length && (
            <div className="discovery-empty">
              <h3>
                {t("暂时没找到“")}
                {search.trim()}”
              </h3>
              <p>{t("试试模型名称、站点名称或域名")}</p>
            </div>
          )}
        </div>
        <div className="discovery-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            {t("选择")}
            <kbd>↵</kbd>
            {t("打开")}
          </span>
          <span>
            <kbd>esc</kbd>
            {t("关闭")}
          </span>
          <span id="discovery-count" role="status" aria-live="polite">
            {search
              ? searchResults.total + " " + t("项匹配")
              : t("搜索全部公开资料")}
          </span>
        </div>
      </dialog>
    </div>
  );
}
