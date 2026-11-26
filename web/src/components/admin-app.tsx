"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, send } from "@/lib/client-api";
import {
  dateText,
  text,
  type AdminContext,
  type Analytics,
  type Entity,
  type Field,
  type ListResult,
  type Module,
} from "@/lib/types";
import { useAuth } from "./providers";
import { Empty, ErrorMessage, Icon, Status } from "./ui";
import { WorkspaceAccess } from "./workspace-login";
import { WorkspaceSelect } from "./workspace-select";
import { AnalyticsInsights } from "./analytics-insights";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { OperationsPanel } from "./operations-panel";

type ModalState = {
  mode: "create" | "edit" | "view" | "action" | "bulk";
  record?: Entity;
  action?: string;
} | null;
type Values = Record<string, unknown>;
const optionLabels: Record<string, Record<string, string>> = {
  surface: {
    platform: "平台管理后台",
    publisher: "站长工作台",
    member: "网站用户",
  },
  scope: { all: "全部数据", own: "仅本人数据" },
};
const optionLabel = (key: string, value: string) =>
  optionLabels[key]?.[value] || value;
const actionLabels: Record<string, string> = {
  create: "新增",
  view: "详情",
  edit: "编辑",
  delete: "删除",
  approve: "审核通过",
  reject: "驳回",
  run: "立即运行",
  retry: "重试",
  cancel: "取消任务",
  pause: "切换启停",
  discover: "获取模型",
  share: "创建分享链接",
  acknowledge: "确认告警",
  resolve: "标记解决",
  pay: "付款",
  confirmPayment: "确认收款",
  order: "创建订单",
  sync: "同步账户",
  calibrate: "采集校准",
  recheck: "复检",
};
const dataActions = [
  "view",
  "edit",
  "delete",
  "approve",
  "reject",
  "run",
  "retry",
  "cancel",
  "pause",
  "discover",
  "share",
  "acknowledge",
  "resolve",
  "pay",
  "confirmPayment",
  "recheck",
];

export function AdminApp({ surface }: { surface: "platform" | "publisher" }) {
  const pathname = usePathname(),
    router = useRouter(),
    { user, loading, logout } = useAuth();
  const loginPath =
    surface === "platform" ? "/admin/login/" : "/publisher/login/";
  useEffect(() => {
    if (!loading && !user)
      router.replace(
        loginPath +
          "?next=" +
          encodeURIComponent(pathname + window.location.search),
      );
  }, [loading, user, loginPath, pathname, router]);
  const [ctx, setContext] = useState<AdminContext | null>(null),
    [records, setRecords] = useState<ListResult | null>(null),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [days, setDays] = useState(7),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [modal, setModal] = useState<ModalState>(null),
    [values, setValues] = useState<Values>({}),
    [formError, setFormError] = useState(""),
    [toast, setToast] = useState(""),
    [navOpen, setNavOpen] = useState(false),
    [navSearch, setNavSearch] = useState(""),
    [discard, setDiscard] = useState(false);
  const [operationsRevision, setOperationsRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    original = useRef("");
  const active = ctx?.modules.find(
    (m) => m.path.replace(/\/$/, "") === pathname.replace(/\/$/, ""),
  );
  const refreshContext = useCallback(async () => {
    const c = await api<AdminContext>("/admin/context/");
    setContext(c);
  }, []);
  useEffect(() => {
    if (user && user.surface === surface)
      refreshContext().catch((e) => setError(e.message));
  }, [user, surface, refreshContext]);
  useEffect(() => {
    setPage(1);
    setSearch("");
    setQuery("");
    setStatus("");
    setSelected([]);
    setRecords(null);
    setAnalytics(null);
    setNavOpen(false);
    setModal(null);
  }, [pathname]);
  const refresh = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      if (active.kind === "operations")
        setOperationsRevision((value) => value + 1);
      else if (["dashboard", "analytics"].includes(active.kind))
        setAnalytics(
          await api<Analytics>(
            "/admin/analytics/" + active.key + "/?days=" + days,
          ),
        );
      else {
        const params = new URLSearchParams({
          page: String(page),
          page_size: "15",
          q: search,
          status,
        });
        setRecords(
          await api<ListResult>("/admin/records/" + active.key + "/?" + params),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [active?.key, active?.kind, page, search, days, status]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!active || !["dashboard", "analytics"].includes(active.kind)) return;
    let disposed = false,
      pending = false;
    const timer = window.setInterval(async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const next = await api<Analytics>(
          "/admin/analytics/" + active.key + "/?days=" + days,
        );
        if (!disposed) setAnalytics(next);
      } catch {
        /* Preserve the last successful snapshot during transient failures. */
      } finally {
        pending = false;
      }
    }, 30000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active?.key, active?.kind, days]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    if (!modal) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!modal && !navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [!!modal, navOpen]);
  const open = async (state: NonNullable<ModalState>) => {
    setFormError("");
    setDiscard(false);
    let record = state.record;
    if (
      record &&
      ["view", "edit"].includes(state.mode) &&
      active?.actions.includes("view")
    ) {
      try {
        record = await api<Entity>(
          "/admin/records/" + active.key + "/" + record.id + "/",
        );
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    const next: Values = record
      ? { ...record }
      : Object.fromEntries(
          (active?.fields || [])
            .filter(
              (f) =>
                f.type === "multiselect" ||
                f.type === "permissions" ||
                f.type === "bindings",
            )
            .map((f) => [f.key, []]),
        );
    if (!record) {
      for (const f of active?.fields || [])
        if (f.type === "select" && f.options?.length)
          next[f.key] = f.options[0];
    }
    if (state.mode === "action" || state.mode === "bulk") {
      Object.keys(next).forEach((k) => delete next[k]);
    }
    setValues(next);
    original.current = JSON.stringify(next);
    setModal({ ...state, record });
  };
  const close = () => {
    if (
      modal &&
      ["create", "edit"].includes(modal.mode) &&
      JSON.stringify(values) !== original.current
    ) {
      setDiscard(true);
      return;
    }
    setModal(null);
  };
  const cleanValues = (m: Module) =>
    Object.fromEntries(
      [
        ...new Set([
          ...m.fields.map((f) => f.key),
          ...(values.version ? ["version"] : []),
        ]),
      ]
        .filter(
          (k) =>
            values[k] !== undefined &&
            !(k === "password" && !values[k]) &&
            !(k === "secret" && !values[k]),
        )
        .map((k) => [k, values[k]]),
    );
  const submit = async () => {
    if (!active || !modal) return;
    setBusy(true);
    setFormError("");
    try {
      if (modal.mode === "create")
        await send("/admin/records/" + active.key + "/", {
          values: cleanValues(active),
        });
      else if (modal.mode === "edit")
        await send(
          "/admin/records/" + active.key + "/" + modal.record?.id + "/",
          { values: cleanValues(active) },
          "PATCH",
        );
      else if (modal.mode === "bulk") {
        await send("/admin/records/" + active.key + "/bulk/", {
          ids: selected,
          action: modal.action,
          values,
        });
        setSelected([]);
      } else if (modal.action === "confirmPayment")
        await send("/admin/orders/" + modal.record?.id + "/confirm-payment/", {
          reference: values.reference,
        });
      else if (modal.action === "order")
        await send("/publisher/campaigns/" + modal.record?.id + "/order/");
      else if (modal.mode === "action") {
        const result = await send<{ item: Entity }>(
          "/admin/records/" +
            active.key +
            "/" +
            modal.record?.id +
            "/actions/" +
            modal.action +
            "/",
          { values },
        );
        if (modal.action === "share" && result.item.shareUrl) {
          await navigator.clipboard.writeText(
            location.origin + result.item.shareUrl,
          );
          setToast("分享链接已复制");
        }
      }
      setModal(null);
      setToast(
        modal.action === "discover"
          ? "模型获取已完成，详情中可查看可用模型与协议错误"
          : "操作成功，记录已更新",
      );
      await Promise.all([refresh(), refreshContext()]);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (loading || !user || (user.surface === surface && !ctx && !error))
    return <div className="loading">正在加载工作台与权限…</div>;
  if (user.surface !== surface) return <WorkspaceAccess surface={surface} />;
  if (!ctx)
    return (
      <div className="container error-page">
        <ErrorMessage error={error} />
        <button className="button" onClick={refreshContext}>
          重新加载
        </button>
      </div>
    );
  const statusOptions =
    active?.fields.find((f) => f.key === "status")?.options || [];
  return (
    <div className="admin-shell">
      {navOpen && (
        <button
          aria-label="关闭侧栏"
          className="admin-backdrop"
          onClick={() => setNavOpen(false)}
        />
      )}
      <WorkspaceSidebar
        key={surface + user.id}
        modules={ctx.modules}
        activeKey={active?.key}
        surface={surface}
        userId={user.id}
        search={navSearch}
        open={navOpen}
      />
      <div className="admin-body">
        <header className="admin-topbar">
          <div className="admin-breadcrumb">
            <button
              className="icon-button admin-mobile-toggle"
              aria-label="展开后台菜单"
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="admin-breadcrumb-group">
              {active?.group || "工作区"}
            </span>
            <span className="muted admin-breadcrumb-group">/</span>
            <strong>{active?.title || "页面未找到"}</strong>
          </div>
          <div>
            <input
              className="admin-nav-search"
              placeholder="搜索菜单"
              aria-label="搜索后台菜单"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
            />
            <span className="surface-label">
              <span>●</span>
              {user.roleName}
            </span>
            <span className="avatar-small">{user.name.slice(0, 1)}</span>
            <button
              className="icon-button"
              onClick={() =>
                logout(loginPath).catch((e) => setError(e.message))
              }
              title="退出登录"
              aria-label="退出登录"
            >
              <Icon name="lock" size={16} />
            </button>
          </div>
        </header>
        <main id="main" className="admin-main">
          {!active ? (
            <Empty
              title="页面不存在或未获授权"
              description="请选择左侧有权限的菜单。"
            />
          ) : (
            <>
              <div className="admin-heading">
                <div>
                  <h1>{active.title}</h1>
                  <p>{active.description}</p>
                </div>
                <div className="admin-heading-actions">
                  {["dashboard", "analytics"].includes(active.kind) && (
                    <WorkspaceSelect
                      value={String(days)}
                      onChange={(value) => setDays(Number(value))}
                      label="统计范围"
                      options={[7, 30, 90].map((n) => ({
                        value: String(n),
                        label: `最近 ${n} 天`,
                      }))}
                    />
                  )}
                  {active.actions.includes("export") && (
                    <a
                      className="button secondary small"
                      href={
                        "/api/v1/admin/" +
                        (active.kind === "analytics"
                          ? "analytics/" + active.key + "/?days=" + days
                          : "records/" +
                            active.key +
                            "/?q=" +
                            encodeURIComponent(search)) +
                        "&export=true"
                      }
                    >
                      导出数据
                    </a>
                  )}
                  {active.actions.includes("create") && (
                    <button
                      className="button small"
                      onClick={() => open({ mode: "create" })}
                    >
                      <Icon name="plus" size={16} />
                      新增{active.title.replace(/管理|我的/g, "")}
                    </button>
                  )}
                  {active.kind === "settings" &&
                    active.actions.includes("edit") &&
                    !!records?.items.length && (
                      <button
                        className="button small"
                        onClick={() =>
                          open({ mode: "edit", record: records.items[0] })
                        }
                      >
                        编辑设置
                      </button>
                    )}
                  <button
                    className="icon-button"
                    aria-label="刷新数据"
                    onClick={refresh}
                  >
                    <Icon name="compass" size={17} />
                  </button>
                </div>
              </div>
              <ErrorMessage error={error} />
              {active.kind === "operations" ? (
                <OperationsPanel
                  active={active}
                  revision={operationsRevision}
                />
              ) : ["dashboard", "analytics"].includes(active.kind) ? (
                analytics ? (
                  <AnalyticsView data={analytics} active={active} ctx={ctx} />
                ) : (
                  <div className="loading">
                    {busy ? "正在读取统计…" : "暂无统计数据"}
                  </div>
                )
              ) : (
                <>
                  <form
                    className="admin-toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPage(1);
                      setSearch(query);
                    }}
                  >
                    <label className="filter-search">
                      <Icon name="search" size={15} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索名称"
                        aria-label="搜索记录"
                      />
                    </label>
                    {statusOptions.length > 0 && (
                      <WorkspaceSelect
                        value={status}
                        onChange={(value) => {
                          setStatus(value);
                          setPage(1);
                        }}
                        label="状态筛选"
                        options={[
                          { value: "", label: "全部状态" },
                          ...statusOptions.map((s) => ({ value: s, label: s })),
                        ]}
                      />
                    )}
                    <button className="button secondary small" type="submit">
                      查询
                    </button>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setSearch("");
                        setStatus("");
                        setPage(1);
                      }}
                    >
                      重置
                    </button>
                    <span className="toolbar-count">
                      共 {records?.total ?? "—"} 条记录
                    </span>
                  </form>
                  {selected.length > 0 && (
                    <div className="bulk-bar">
                      <span>
                        已选择 <b>{selected.length}</b> 条
                      </span>
                      {active.bulkActions.map((a) => (
                        <button
                          key={a}
                          onClick={() => open({ mode: "bulk", action: a })}
                        >
                          批量{actionLabels[a] || a}
                        </button>
                      ))}
                      <button
                        className="clear-selection"
                        onClick={() => setSelected([])}
                      >
                        取消选择
                      </button>
                    </div>
                  )}
                  {records?.items.length ? (
                    <div className="admin-table">
                      <table>
                        <thead>
                          <tr>
                            {active.bulkActions.length > 0 && (
                              <th>
                                <input
                                  type="checkbox"
                                  aria-label="选择本页全部"
                                  checked={records.items.every((r) =>
                                    selected.includes(r.id),
                                  )}
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? records.items.map((r) => r.id)
                                        : [],
                                    )
                                  }
                                />
                              </th>
                            )}
                            {(active.columns.length
                              ? active.columns
                              : [
                                  { key: "name", label: "名称" },
                                  { key: "status", label: "状态" },
                                  { key: "updated", label: "更新时间" },
                                ]
                            ).map((c) => (
                              <th key={c.key}>{c.label}</th>
                            ))}
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.items.map((r) => (
                            <tr key={r.id}>
                              {active.bulkActions.length > 0 && (
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={"选择 " + r.name}
                                    checked={selected.includes(r.id)}
                                    onChange={(e) =>
                                      setSelected((prev) =>
                                        e.target.checked
                                          ? [...prev, r.id]
                                          : prev.filter((id) => id !== r.id),
                                      )
                                    }
                                  />
                                </td>
                              )}
                              {(active.columns.length
                                ? active.columns
                                : [
                                    { key: "name" },
                                    { key: "status" },
                                    { key: "updated" },
                                  ]
                              ).map((c, i) => (
                                <td key={c.key}>
                                  {c.key === "status" ? (
                                    <Status value={r.status} />
                                  ) : i === 0 ? (
                                    <button
                                      className="row-name"
                                      onClick={() =>
                                        active.actions.includes("view")
                                          ? open({ mode: "view", record: r })
                                          : active.actions.includes("edit") &&
                                            open({ mode: "edit", record: r })
                                      }
                                    >
                                      {text(r[c.key])}
                                    </button>
                                  ) : c.key === "updated" ? (
                                    dateText(r.updated)
                                  ) : (
                                    <Cell
                                      value={referenceValue(
                                        r[c.key],
                                        c.key,
                                        active,
                                        ctx,
                                      )}
                                    />
                                  )}
                                </td>
                              ))}
                              <td>
                                <div className="row-actions">
                                  {dataActions
                                    .filter((a) => active.actions.includes(a))
                                    .map((a) => (
                                      <button
                                        className={
                                          a === "delete" ? "danger-link" : ""
                                        }
                                        key={a}
                                        onClick={() =>
                                          open({
                                            mode:
                                              a === "view" || a === "edit"
                                                ? a
                                                : "action",
                                            action: a,
                                            record: r,
                                          })
                                        }
                                      >
                                        {actionLabels[a] || a}
                                      </button>
                                    ))}
                                  {active.key === "p-campaigns" &&
                                    r.status === "已通过" && (
                                      <button
                                        onClick={() =>
                                          open({
                                            mode: "action",
                                            action: "order",
                                            record: r,
                                          })
                                        }
                                      >
                                        创建订单
                                      </button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={busy ? "正在读取记录…" : "暂无记录"}
                      description={
                        search || status
                          ? "换一个筛选条件，或重置后再试。"
                          : "新内容会显示在这里，已有权限的功能可从右上角开始。"
                      }
                    />
                  )}
                  {records && records.total > records.pageSize && (
                    <div className="admin-pagination">
                      <span>
                        第 {page} /{" "}
                        {Math.ceil(records.total / records.pageSize)} 页
                      </span>
                      <button
                        disabled={page === 1 || busy}
                        onClick={() => {
                          setPage(page - 1);
                          setSelected([]);
                        }}
                      >
                        上一页
                      </button>
                      <button
                        disabled={
                          page * records.pageSize >= records.total || busy
                        }
                        onClick={() => {
                          setPage(page + 1);
                          setSelected([]);
                        }}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="workspace-dialog-title"
        className={
          "admin-dialog " + (modal?.mode === "action" ? "compact" : "")
        }
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <header>
          <h2 id="workspace-dialog-title">
            {discard
              ? "离开前保存一下？"
              : modal?.mode === "bulk"
                ? "批量" + actionLabels[modal.action || ""]
                : (actionLabels[modal?.action || modal?.mode || ""] || "") +
                  (active?.title || "")}
          </h2>
          <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="admin-dialog-body">
          {discard ? (
            <p className="muted">
              有尚未保存的修改。继续编辑，或放弃这些修改后离开。
            </p>
          ) : modal?.mode === "view" && modal.record ? (
            <Detail record={modal.record} module={active!} ctx={ctx} />
          ) : modal && ["create", "edit"].includes(modal.mode) && active ? (
            <DynamicForm
              fields={active.fields}
              values={values}
              setValues={setValues}
              ctx={ctx}
              setError={setFormError}
            />
          ) : modal?.mode === "bulk" && modal.action === "edit" && active ? (
            <DynamicForm
              fields={active.fields.filter((f) =>
                active.bulkFields.includes(f.key),
              )}
              values={values}
              setValues={setValues}
              ctx={ctx}
              setError={setFormError}
              partial
            />
          ) : (
            <div className="action-confirm">
              <Icon
                name={modal?.action === "delete" ? "help" : "shield"}
                size={29}
              />
              <p>
                {modal?.mode === "bulk"
                  ? `将对 ${selected.length} 条记录执行${actionLabels[modal.action || ""]}。所有记录都会经过服务端权限与状态检查，任一失败将整批回滚。`
                  : `确认对「${modal?.record?.name}」执行${actionLabels[modal?.action || ""]}？`}
              </p>
              {modal?.action === "delete" && (
                <p className="muted">
                  删除后无法从页面恢复；用户账户按停用处理以保留审计历史。
                </p>
              )}
              {modal?.action === "approve" && active?.key === "submissions" && (
                <label>
                  公开页面标识
                  <input
                    placeholder="例如：my-api，使用小写英文、数字和连字符"
                    value={text(values.slug === undefined ? "" : values.slug)}
                    onChange={(e) =>
                      setValues({ ...values, slug: e.target.value })
                    }
                  />
                </label>
              )}
              {modal?.action === "reject" && (
                <label>
                  驳回原因
                  <textarea
                    rows={3}
                    value={String(values.reviewNote || "")}
                    onChange={(e) =>
                      setValues({ ...values, reviewNote: e.target.value })
                    }
                  />
                </label>
              )}
              {modal?.action === "confirmPayment" && (
                <label>
                  付款流水 / 凭证编号
                  <input
                    required
                    value={String(values.reference || "")}
                    onChange={(e) =>
                      setValues({ ...values, reference: e.target.value })
                    }
                    placeholder="填写实际核对过的凭证编号"
                  />
                </label>
              )}
            </div>
          )}
          <ErrorMessage error={formError} />
        </div>
        <footer>
          {discard ? (
            <>
              <button
                className="button secondary"
                onClick={() => setDiscard(false)}
              >
                继续编辑
              </button>
              <button className="button danger" onClick={() => setModal(null)}>
                放弃修改
              </button>
            </>
          ) : (
            <>
              <button className="button secondary" onClick={close}>
                {modal?.mode === "view" ? "关闭" : "取消"}
              </button>
              {modal?.mode !== "view" && (
                <button
                  className={
                    "button " + (modal?.action === "delete" ? "danger" : "")
                  }
                  disabled={busy}
                  onClick={submit}
                >
                  {busy
                    ? "正在处理…"
                    : modal?.mode === "create" || modal?.mode === "edit"
                      ? "保存并更新"
                      : "确认操作"}
                </button>
              )}
            </>
          )}
        </footer>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Cell({ value, limit = 4 }: { value: unknown; limit?: number }) {
  if (Array.isArray(value) && !value.length) return <>—</>;
  if (Array.isArray(value))
    return (
      <div className="tag-row">
        {value.slice(0, limit).map((v, i) => (
          <span className="badge" key={i}>
            {typeof v === "object" ? "分组 " + (i + 1) : text(v)}
          </span>
        ))}
        {value.length > limit && <small>+{value.length - limit}</small>}
      </div>
    );
  return <>{text(value)}</>;
}
function Detail({
  record,
  module,
  ctx,
}: {
  record: Entity;
  module: Module;
  ctx: AdminContext;
}) {
  const labels = Object.fromEntries(module.fields.map((f) => [f.key, f.label]));
  return (
    <dl className="detail-dl">
      {Object.entries(record)
        .filter(
          ([k]) => !k.startsWith("_") && !["password", "secret"].includes(k),
        )
        .map(([k, v]) => (
          <div className="detail-fragment" key={k}>
            <dt>
              {labels[k] ||
                (
                  {
                    id: "记录 ID",
                    updated: "更新时间",
                    created: "创建时间",
                    secretMask: "密钥标识",
                    accountId: "探测账户 ID",
                    authConfigured: "已配置加密登录凭证",
                    balance: "账户余额",
                    quota: "原始 Quota",
                    remoteTokenId: "远端令牌 ID",
                    syncState: "同步状态",
                    syncError: "同步异常",
                    lastSyncedAt: "上次同步",
                    checkinResult: "签到结果",
                    calibrationState: "采集状态",
                    calibrationError: "采集异常",
                    validation: "校准状态",
                    validationSamples: "独立校准轮数",
                    validationCorrect: "区分合格轮数",
                    calibratedAt: "校准时间",
                    sampleCount: "有效采样轮数",
                    versionTag: "指纹特征版本",
                    radius: "匹配距离阈值",
                    available: "可发放数量",
                    delivered: "已发放数量",
                    rewardId: "所属权益 ID",
                    body: "通知内容",
                    discoveredModels: "已获取模型",
                    discoveryErrors: "模型获取错误",
                    evidence: "检测证据",
                    permissions: "权限",
                    version: "记录版本",
                    taskId: "采集任务 ID",
                    datasets: "采集内容",
                    syncMode: "资料更新方式",
                    trigger: "触发方式",
                    progress: "执行进度",
                    startedAt: "开始时间",
                    finishedAt: "完成时间",
                    heartbeat: "最近心跳",
                    error: "异常说明",
                    modelCount: "模型数量",
                    productCount: "产品数量",
                    tierCount: "套餐档位数量",
                    createdCount: "新增数量",
                    updatedCount: "更新数量",
                    sourceUrl: "资料来源",
                    sourceUpdatedAt: "来源更新时间",
                    collectedAt: "采集时间",
                    lastRun: "最近执行",
                    lastResult: "最近结果",
                    lastCounts: "采集数量",
                    noticeCount: "公告新增或变更数",
                    channelCount: "来源监测项数",
                    authState: "登录状态",
                    sessionExpiresAt: "当前令牌到期时间",
                    lastLoginAt: "最近登录时间",
                    lastUsedAt: "最近使用时间",
                    lastAuthError: "登录异常",
                    finishedTime: "完成时间（北京时间）",
                    warnings: "来源提示",
                    errors: "采集异常",
                    lastErrors: "最近异常",
                    lastWarnings: "最近来源提示",
                    lastQueuedRun: "最近排队记录 ID",
                    sourcePublishedAt: "来源发布时间",
                    nextRun: "下次执行（北京时间）",
                    timezone: "时区",
                    product: "产品资料",
                    plans: "套餐档位",
                    model: "模型参数",
                  } as Record<string, string>
                )[k] ||
                k}
            </dt>
            <dd>
              {Array.isArray(v) &&
              v.every((item) => typeof item !== "object") ? (
                <Cell
                  value={referenceValue(v, k, module, ctx)}
                  limit={Infinity}
                />
              ) : v && typeof v === "object" ? (
                <pre>{JSON.stringify(v, null, 2)}</pre>
              ) : k === "shareUrl" && v ? (
                <a
                  className="text-link"
                  href={String(v)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开分享报告 ↗
                </a>
              ) : (
                text(referenceValue(v, k, module, ctx))
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function DynamicForm({
  fields,
  values,
  setValues,
  ctx,
  setError,
  partial = false,
}: {
  fields: Field[];
  values: Values;
  setValues: React.Dispatch<React.SetStateAction<Values>>;
  ctx: AdminContext;
  setError: (e: string) => void;
  partial?: boolean;
}) {
  const set = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="admin-form-grid">
      {fields.map((field) => {
        const type = field.type || "text",
          value = values[field.key];
        const options = field.source
          ? (ctx.choices[field.source] || []).map((r) => ({
              value: r.id,
              label: r.name,
            }))
          : field.type === "role"
            ? (ctx.choices.roles || []).map((r) => ({
                value: r.id,
                label: r.name,
              }))
            : (field.options || []).map((s) => ({
                value: s,
                label: optionLabel(field.key, s),
              }));
        return (
          <div
            key={field.key}
            className={
              "admin-field " +
              ([
                "textarea",
                "editor",
                "multiselect",
                "bindings",
                "permissions",
              ].includes(type)
                ? "full "
                : "") +
              (field.required && !partial ? "required" : "")
            }
          >
            <label htmlFor={"field-" + field.key}>{field.label}</label>
            {type === "textarea" || type === "editor" ? (
              <textarea
                id={"field-" + field.key}
                rows={type === "editor" ? 9 : 3}
                value={String(value || "")}
                onChange={(e) => set(field.key, e.target.value)}
                maxLength={field.key === "codes" ? 100100 : 50000}
              />
            ) : type === "bindings" ? (
              <Bindings
                value={Array.isArray(value) ? (value as Binding[]) : []}
                onChange={(v) => set(field.key, v)}
                ctx={ctx}
                station={String(values.station || "")}
              />
            ) : type === "permissions" ? (
              <Permissions
                value={Array.isArray(value) ? (value as string[]) : []}
                onChange={(v) => set(field.key, v)}
                ctx={ctx}
                surface={String(values.surface || "platform")}
              />
            ) : type === "multiselect" ? (
              <span className="multi-options">
                {options.map((o) => (
                  <label key={o.value}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(value) && value.includes(o.value)}
                      onChange={(e) =>
                        set(
                          field.key,
                          e.target.checked
                            ? [...(Array.isArray(value) ? value : []), o.value]
                            : (Array.isArray(value) ? value : []).filter(
                                (v) => v !== o.value,
                              ),
                        )
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </span>
            ) : ["select", "role"].includes(type) ? (
              <WorkspaceSelect
                id={"field-" + field.key}
                value={String(value ?? "")}
                onChange={(next) => set(field.key, next)}
                label={field.label}
                options={[
                  { value: "", label: partial ? "保持原值" : "请选择" },
                  ...options,
                  ...(value && !options.some((o) => o.value === value)
                    ? [
                        {
                          value: String(value),
                          label:
                            ctx.choices[field.source || ""]?.find(
                              (r) => r.slug === value,
                            )?.name || String(value),
                        },
                      ]
                    : []),
                ]}
              />
            ) : type === "upload" ? (
              <span className="upload-preview">
                {typeof value === "string" && value && (
                  <img src={value} alt="已上传素材" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const form = new FormData();
                      form.append("file", file);
                      const data = await api<{ url: string }>("/uploads/", {
                        method: "POST",
                        body: form,
                      });
                      set(field.key, data.url);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </span>
            ) : (
              <input
                id={"field-" + field.key}
                type={
                  [
                    "number",
                    "date",
                    "time",
                    "email",
                    "url",
                    "password",
                  ].includes(type)
                    ? type
                    : "text"
                }
                value={String(value ?? "")}
                onChange={(e) =>
                  set(
                    field.key,
                    type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                min={type === "number" ? 0 : undefined}
                step={type === "number" ? "any" : undefined}
                autoComplete={type === "password" ? "new-password" : undefined}
                maxLength={type !== "number" ? 1000 : undefined}
              />
            )}
            {field.help && <small>{field.help}</small>}
            {field.suffix && <small>{field.suffix}</small>}
          </div>
        );
      })}
    </div>
  );
}

interface Binding {
  keyId: string;
  protocol: string;
  models: string[];
}
function Bindings({
  value,
  onChange,
  ctx,
  station,
}: {
  value: Binding[];
  onChange: (v: Binding[]) => void;
  ctx: AdminContext;
  station: string;
}) {
  const [error, setError] = useState(""),
    [keys, setKeys] = useState(ctx.choices["test-keys"] || []),
    [busy, setBusy] = useState(false);
  const available = keys.filter(
    (k) => k.station === station && k.status === "启用",
  );
  const update = (i: number, next: Binding) =>
    onChange(value.map((v, n) => (n === i ? next : v)));
  return (
    <div>
      {!station && <small>先选择检测站点，再选择该站点的 Key。</small>}
      {value.map((binding, i) => {
        const key = available.find((k) => k.id === binding.keyId),
          models = (
            (key?.discoveredModels || []) as {
              id: string;
              protocol: string;
              name: string;
            }[]
          ).filter((m) => m.protocol === binding.protocol);
        return (
          <div className="binding-group" key={i}>
            <header>
              <WorkspaceSelect
                label={"第 " + (i + 1) + " 组 Key"}
                value={binding.keyId}
                onChange={(next) => {
                  const k = keys.find((k) => k.id === next);
                  update(i, {
                    keyId: next,
                    protocol: ((k?.protocols as string[]) || [])[0] || "",
                    models: [],
                  });
                }}
                options={[
                  { value: "", label: "选择 Key" },
                  ...available.map((k) => ({
                    value: k.id,
                    label: k.name + " · " + text(k.secretMask),
                  })),
                ]}
              />
              <WorkspaceSelect
                label="接口协议"
                value={binding.protocol}
                onChange={(next) =>
                  update(i, {
                    ...binding,
                    protocol: next,
                    models: [],
                  })
                }
                options={[
                  { value: "", label: "选择协议" },
                  ...((key?.protocols || []) as string[]).map((p) => ({
                    value: p,
                    label: p,
                  })),
                ]}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="移除此分组"
                onClick={() => onChange(value.filter((_, n) => n !== i))}
              >
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className="binding-actions">
              <button
                className="text-link"
                type="button"
                disabled={
                  !key ||
                  busy ||
                  !ctx.user.permissions.includes("platform.test-keys.discover")
                }
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await send<{ item: Entity }>(
                      "/admin/records/test-keys/" +
                        key?.id +
                        "/actions/discover/",
                    );
                    setKeys((prev) =>
                      prev.map((k) => (k.id === r.item.id ? r.item : k)),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "正在获取…" : "自动获取可用模型"}
              </button>
              {models.length > 0 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    update(i, { ...binding, models: models.map((m) => m.id) })
                  }
                >
                  选择全部 {models.length} 个
                </button>
              )}
            </div>
            {models.length ? (
              <span className="multi-options">
                {models.map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={binding.models.includes(m.id)}
                      onChange={(e) =>
                        update(i, {
                          ...binding,
                          models: e.target.checked
                            ? [...binding.models, m.id]
                            : binding.models.filter((v) => v !== m.id),
                        })
                      }
                    />
                    {m.id}
                  </label>
                ))}
              </span>
            ) : (
              <small>自动获取后，在此勾选该 Key 和协议实际可调用的模型。</small>
            )}
            {Array.isArray(key?.discoveryErrors) &&
              key.discoveryErrors.length > 0 && (
                <small>
                  {key.discoveryErrors.map((e) => text(e)).join("；")}
                </small>
              )}
          </div>
        );
      })}
      <button
        type="button"
        className="button secondary small"
        disabled={!station}
        onClick={() =>
          onChange([...value, { keyId: "", protocol: "", models: [] }])
        }
      >
        <Icon name="plus" size={14} />
        添加 Key 分组
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}
function Permissions({
  value,
  onChange,
  ctx,
  surface,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  ctx: AdminContext;
  surface: string;
}) {
  const permissions = ctx.permissions.filter((p) =>
      p.code.startsWith(surface + "."),
    ),
    modules = [...new Set(permissions.map((p) => p.module))];
  return (
    <div className="permission-picker">
      {modules.map((key) => {
        const all = permissions.filter((p) => p.module === key);
        return (
          <div className="permission-module" key={key}>
            <strong>{all[0]?.title}</strong>
            <div>
              {all.map((p) => (
                <label key={p.code}>
                  <input
                    type="checkbox"
                    checked={value.includes(p.code)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, p.code]
                          : value.filter((v) => v !== p.code),
                      )
                    }
                  />
                  {ctx.actions[p.action] || actionLabels[p.action] || p.action}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsView({
  data,
  active,
  ctx,
}: {
  data: Analytics;
  active: Module;
  ctx: AdminContext;
}) {
  if (data.test) return <TestTrends data={data} />;
  const publisher = active.surface === "publisher",
    ad = publisher || active.key === "adstats",
    metrics = ad
      ? [
          ["曝光量", data.impressions, "megaphone"],
          ["点击量", data.clicks, "compass"],
          ["点击率", data.ctr + "%", "chart"],
          ["独立访客", data.uv, "users"],
        ]
      : [
          ["页面浏览量", data.pv, "layers"],
          ["独立访客", data.uv, "users"],
          ["官网跳转", data.outbound, "arrow"],
          ["平均停留", data.averageDuration + " 秒", "clock"],
        ];
  const max = Math.max(
    1,
    ...data.series.map((s) => (ad ? s.impressions : s.pageviews)),
  );
  return (
    <>
      <div className="admin-stats">
        {metrics.map(([label, value, icon]) => (
          <article className="stat-card" key={String(label)}>
            <span>
              {label}
              <Icon name={String(icon)} size={18} />
            </span>
            <strong>
              {typeof value === "number"
                ? value.toLocaleString("zh-CN")
                : value}
            </strong>
            <small>所选日期范围内的采集数据</small>
          </article>
        ))}
      </div>
      <div className="admin-grid">
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>{ad ? "曝光趋势" : "访问趋势"}</h2>
              <p>{ad ? "按日查看广告曝光变化" : "按日查看网站访问变化"}</p>
            </div>
            <span className="badge">{data.series.length} 天</span>
          </div>
          <div
            className="admin-chart"
            role="img"
            aria-label={
              (ad ? "每日曝光量：" : "每日浏览量：") +
              data.series
                .map((s) => s.date + " " + (ad ? s.impressions : s.pageviews))
                .join("，")
            }
          >
            {data.series.map((s, i) => (
              <div
                key={s.date}
                className="chart-column"
                title={s.date + "：" + (ad ? s.impressions : s.pageviews)}
              >
                <span
                  style={{
                    height: Math.max(
                      1,
                      ((ad ? s.impressions : s.pageviews) / max) * 175,
                    ),
                  }}
                />
                <small>
                  {data.series.length <= 7 ||
                  i % Math.ceil(data.series.length / 7) === 0
                    ? s.date.slice(5)
                    : " "}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2>快捷入口</h2>
              <p>只展示当前角色可用功能</p>
            </div>
            <Icon name="zap" size={18} />
          </div>
          <div className="dashboard-links">
            {ctx.modules
              .filter((m) => !["dashboard", "analytics"].includes(m.kind))
              .slice(0, 6)
              .map((m) => (
                <Link href={m.path} key={m.key}>
                  <Icon name={m.icon} size={16} />
                  {m.title}
                </Link>
              ))}
          </div>
        </section>
      </div>
      <div className="admin-breakdowns">
        {[
          [
            active.key === "visitors" ? "设备分布" : "访问来源",
            active.key === "visitors" ? data.devices : data.sources,
          ],
          ["热门页面", data.pages],
        ].map(([title, items]) => (
          <section className="admin-card" key={String(title)}>
            <div className="admin-card-header">
              <h2>{String(title)}</h2>
            </div>
            {(items as { name: string; value: number }[]).length ? (
              (items as { name: string; value: number }[]).map((r) => (
                <div className="breakdown-row" key={r.name}>
                  <span>{r.name}</span>
                  <b>{r.value}</b>
                </div>
              ))
            ) : (
              <Empty
                title="尚未采集到数据"
                description="真实访问产生后会自动汇总。"
              />
            )}
          </section>
        ))}
      </div>
      {ad && (
        <section className="admin-card">
          <div className="admin-card-header">
            <h2>广告效果明细</h2>
          </div>
          {data.campaigns.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>广告</th>
                    <th>曝光</th>
                    <th>点击</th>
                    <th>点击率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.impressions}</td>
                      <td>{c.clicks}</td>
                      <td>{c.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="暂无广告数据"
              description="已审核并处于投放期的广告被展示后，才会记录曝光和点击。"
            />
          )}
        </section>
      )}
      <AnalyticsInsights data={data} />
      <p className="source-note">
        <Icon name="help" size={14} />
        {data.note}
      </p>
    </>
  );
}

function TestTrends({ data }: { data: Analytics }) {
  const report = data.test!;
  const max = Math.max(1, ...report.series.map((d) => d.total));
  return (
    <>
      <div className="admin-stats">
        {[
          ["检测报告", report.total],
          [
            "调用成功率",
            report.successRate == null ? "—" : report.successRate + "%",
          ],
          ["平均糖果得分", report.averageScore ?? "—"],
          [
            "平均采样耗时",
            report.averageLatency == null ? "—" : report.averageLatency + " ms",
          ],
        ].map(([label, value]) => (
          <article className="stat-card" key={String(label)}>
            <span>
              {label}
              <Icon name="zap" size={17} />
            </span>
            <strong>{value}</strong>
            <small>根据实际检测证据计算</small>
          </article>
        ))}
      </div>
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h2>检测报告趋势</h2>
            <p>
              共 {report.total} 份报告，{report.successful} 份调用成功，
              {report.scored} 份具有题集分数。
            </p>
          </div>
        </div>
        <div
          className="admin-chart"
          role="img"
          aria-label={report.series
            .map((d) => d.date + "：" + d.total + " 份报告")
            .join("，")}
        >
          {report.series.map((d, i) => (
            <div
              className="chart-column"
              key={d.date}
              title={`${d.date}：${d.total} 份报告，${d.successful} 份成功`}
            >
              <span style={{ height: Math.max(1, (d.total / max) * 175) }} />
              <small>
                {i % Math.max(1, Math.ceil(report.series.length / 7)) === 0
                  ? d.date.slice(5)
                  : " "}
              </small>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-card" style={{ marginTop: 24 }}>
        <div className="admin-card-header">
          <h2>模型检测分布</h2>
        </div>
        {report.models.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>报告数</th>
                  <th>调用成功</th>
                  <th>调用成功率</th>
                </tr>
              </thead>
              <tbody>
                {report.models.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.total}</td>
                    <td>{m.successful}</td>
                    <td>{((m.successful / m.total) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="尚未执行检测"
            description="配置 Key、自动获取模型并运行计划后，这里会显示真实统计。"
          />
        )}
      </section>
      <p className="source-note">{data.note}</p>
    </>
  );
}

function referenceValue(
  value: unknown,
  key: string,
  module: Module,
  ctx: AdminContext,
): unknown {
  if (
    module.key === "station-source-accounts" &&
    ["lastLoginAt", "lastUsedAt", "sessionExpiresAt"].includes(key) &&
    typeof value === "string" &&
    value
  ) {
    const instant = new Date(
      /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z",
    );
    if (!Number.isNaN(instant.valueOf()))
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(instant);
  }
  const source = module.fields.find((f) => f.key === key)?.source;
  if (!source)
    return typeof value === "string" ? optionLabel(key, value) : value;
  const choices = ctx.choices[source] || [];
  const resolve = (id: unknown) =>
    choices.find((r) => r.id === id || r.slug === id)?.name || id;
  return Array.isArray(value) ? value.map(resolve) : resolve(value);
}
