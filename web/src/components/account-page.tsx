"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, send } from "@/lib/client-api";
import {
  dateText,
  text,
  type Entity,
  type Catalog,
  type Station,
} from "@/lib/types";
import { useAuth } from "./providers";
import { Empty, ErrorMessage, Icon, Status } from "./ui";
import { StationList } from "./stations";

const accountLinks = [
  ["个人概览", "/account/", "home"],
  ["账户设置", "/account/settings/", "settings"],
  ["我的积分", "/account/points/", "coins"],
  ["我的收藏", "/account/favorites/", "heart"],
  ["邀请好友", "/account/invitations/", "gift"],
  ["我的申请", "/account/submissions/", "file"],
];
export function LoginRequired() {
  return (
    <div className="login-required">
      <Icon name="lock" size={29} />
      <h2>登录后继续</h2>
      <p>这里记录你的收藏、申请与探索。</p>
      <Link
        className="button"
        href={
          "/auth/login/?next=" +
          encodeURIComponent(
            typeof location !== "undefined" ? location.pathname : "/account/",
          )
        }
      >
        去登录
        <Icon name="arrow" size={16} />
      </Link>
    </div>
  );
}

export function AccountPage({ path }: { path: string }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">正在加载账户…</div>;
  if (!user) return <LoginRequired />;
  if (path === "/account/points") return <PointsCenter />;
  return (
    <div className="container page">
      <nav className="breadcrumb">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>个人中心</span>
      </nav>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-identity">
            <span className="account-avatar">
              {user.profile.avatar ? (
                <img src={user.profile.avatar} alt="" />
              ) : (
                user.name.slice(0, 1)
              )}
            </span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <nav>
            {accountLinks.map(([label, href, icon]) => (
              <Link
                href={href}
                key={href}
                className={path + "/" === href ? "active" : ""}
              >
                <Icon name={icon} size={17} />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="account-content">
          {path === "/account/settings" ? (
            <AccountSettings />
          ) : path === "/account/favorites" ? (
            <Favorites />
          ) : path === "/account/invitations" ? (
            <Invitations />
          ) : path === "/account/submissions" ? (
            <Applications />
          ) : (
            <AccountOverview />
          )}
        </section>
      </div>
    </div>
  );
}

function AccountOverview() {
  const { user } = useAuth(),
    [data, setData] = useState<Record<string, number> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Record<string, number>>("/member/overview/")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-header">
        <div>
          <span className="eyebrow">YOUR KUGNI</span>
          <h1>你好，{user?.name}</h1>
          <p>新的连接，从这里开始。</p>
        </div>
        <Link href="/account/settings/" className="text-link">
          编辑资料 →
        </Link>
      </div>
      <section className="account-welcome">
        <div>
          <h2>每一次发现，都值得留下。</h2>
          <p>收藏合适的服务，记录真实体验，也把好连接分享给朋友。</p>
          <Link className="button" href="/stations/">
            发现服务商
            <Icon name="arrow" size={16} />
          </Link>
        </div>
        <img
          src="/assets/illustrations/developers/example-find-light.webp"
          alt=""
          onError={(e) => (e.currentTarget.hidden = true)}
        />
      </section>
      <ErrorMessage error={error} />
      <div className="account-stats">
        {[
          ["favorites", "我的收藏", "/account/favorites/", "heart"],
          ["balance", "可用积分", "/account/points/", "coins"],
          ["submissions", "收录申请", "/account/submissions/", "file"],
        ].map(([key, label, href, icon]) => (
          <Link href={href} key={key}>
            <span>
              <Icon name={icon} size={16} />
              {label}
            </span>
            <strong>{data?.[key] ?? "—"}</strong>
            <small>查看详情 →</small>
          </Link>
        ))}
      </div>
      <div className="account-invite">
        <Icon name="gift" size={28} />
        <div>
          <h3>好用的连接，值得一起发现</h3>
          <p>邀请朋友加入，共同探索新的可能。</p>
        </div>
        <Link href="/account/invitations/" className="button secondary">
          邀请好友
        </Link>
      </div>
    </>
  );
}

function AccountSettings() {
  const { user, refresh } = useAuth(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [avatar, setAvatar] = useState(user?.profile.avatar || ""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("profile");
  return (
    <>
      <div className="page-header">
        <div>
          <h1>账户设置</h1>
          <p>给你的空间，加一点自己的样子。</p>
        </div>
      </div>
      <div className="segmented">
        <button
          aria-pressed={tab === "profile"}
          onClick={() => {
            setTab("profile");
            setError("");
            setMessage("");
          }}
        >
          基本资料
        </button>
        <button
          aria-pressed={tab === "security"}
          onClick={() => {
            setTab("security");
            setError("");
            setMessage("");
          }}
        >
          账户安全
        </button>
      </div>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          const f = new FormData(e.currentTarget);
          try {
            if (tab === "profile") {
              await send(
                "/auth/profile/",
                { name: f.get("name"), bio: f.get("bio"), avatar },
                "PATCH",
              );
              await refresh();
            } else {
              if (f.get("password") !== f.get("confirm"))
                throw new Error("两次新密码不一致");
              await send("/auth/password/", {
                current: f.get("current"),
                password: f.get("password"),
              });
            }
            setMessage("已保存修改");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tab === "profile" ? (
          <>
            <div className="avatar-editor">
              <span className="account-avatar">
                {avatar ? (
                  <img src={avatar} alt="个人头像" />
                ) : (
                  user?.name.slice(0, 1)
                )}
              </span>
              <label>
                更换头像
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const f = new FormData();
                    f.append("file", file);
                    setBusy(true);
                    try {
                      const r = await api<{ url: string }>("/uploads/", {
                        method: "POST",
                        body: f,
                      });
                      setAvatar(r.url);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <small>PNG、JPG 或 WebP，最大 2 MB。</small>
              </label>
            </div>
            <div className="form-grid">
              <label>
                昵称
                <input
                  name="name"
                  defaultValue={user?.name}
                  minLength={2}
                  maxLength={40}
                  required
                />
              </label>
              <label>
                登录邮箱
                <input value={user?.email} readOnly />
              </label>
              <label className="full">
                个人简介
                <textarea
                  name="bio"
                  defaultValue={user?.profile.bio}
                  rows={3}
                  maxLength={160}
                  placeholder="用一句话介绍自己。"
                />
              </label>
            </div>
          </>
        ) : (
          <div className="form-grid">
            <label className="full">
              当前密码
              <input
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              新密码
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <label>
              确认新密码
              <input
                name="confirm"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
          </div>
        )}
        <ErrorMessage error={error} />
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button" disabled={busy}>
            保存修改
            <Icon name="check" size={16} />
          </button>
        </div>
      </form>
    </>
  );
}

function Favorites() {
  const [items, setItems] = useState<Station[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ items: Station[] }>("/member/favorites/")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>我的收藏</h1>
          <p>让值得关注的连接，下次更容易找到。</p>
        </div>
      </div>
      <ErrorMessage error={error} />
      {items ? (
        <StationList items={items} />
      ) : (
        <div className="loading">正在加载收藏…</div>
      )}
    </>
  );
}
function Applications() {
  const [items, setItems] = useState<Entity[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ items: Entity[] }>("/member/submissions/")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>我的收录申请</h1>
          <p>查看审核状态与平台反馈。</p>
        </div>
        <Link href="/submit-station/" className="button small">
          申请收录
        </Link>
      </div>
      <ErrorMessage error={error} />
      {items.length ? (
        <div className="application-list">
          {items.map((r) => (
            <article key={r.id}>
              <div>
                <h3>{r.name}</h3>
                <p>{text(r.domain)}</p>
                <small>{dateText(r.created)}</small>
                {!!r.reviewNote && (
                  <p className="review-note">审核意见：{text(r.reviewNote)}</p>
                )}
              </div>
              <Status value={r.status} />
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="还没有申请记录"
          description="把你发现的好服务分享给更多人。"
        />
      )}
    </>
  );
}
function Invitations() {
  const { user } = useAuth(),
    [items, setItems] = useState<
      { name: string; date: string; status: string }[]
    >([]),
    [copied, setCopied] = useState(false),
    [url, setURL] = useState("");
  useEffect(() => {
    setURL(location.origin + "/auth/register/?invite=" + user?.id);
    api<{ items: typeof items }>("/member/invitations/")
      .then((d) => setItems(d.items))
      .catch(() => {});
  }, [user?.id]);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>邀请好友</h1>
          <p>朋友通过专属链接注册，核验后可获得 50 积分。</p>
        </div>
      </div>
      <div className="invite-hero">
        <Icon name="gift" size={36} />
        <h2>带一位朋友，发现更多好连接。</h2>
        <p>奖励以有效注册与平台核验为准，不以打开链接次数计奖。</p>
        <div className="invite-link">
          <input readOnly value={url} aria-label="邀请链接" />
          <button
            className="button"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "已复制" : "复制邀请链接"}
          </button>
        </div>
      </div>
      <div className="section-title">
        <h2>邀请记录</h2>
        <span className="muted">{items.length} 位好友</span>
      </div>
      {items.length ? (
        items.map((r, i) => (
          <article className="notice-card" key={i}>
            <h3>{r.name}</h3>
            <p>
              {r.status} · {dateText(r.date)}
            </p>
          </article>
        ))
      ) : (
        <Empty
          title="第一位同行的朋友，会是谁？"
          description="有效邀请记录会显示在这里。"
        />
      )}
    </>
  );
}

interface PointsData {
  balance: number;
  tasks: {
    id: string;
    name: string;
    group: string;
    points: number;
    description: string;
    href: string | null;
    status: string;
  }[];
  records: {
    id: string;
    title: string;
    amount: number;
    balance: number;
    date: string;
  }[];
  rewards: Entity[];
  redemptions: Entity[];
}
export function PointsCenter() {
  const [data, setData] = useState<PointsData | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("tasks"),
    [filter, setFilter] = useState("all"),
    [recordFilter, setRecordFilter] = useState("all"),
    [busy, setBusy] = useState(false),
    [reward, setReward] = useState<Entity | null>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(
    async () => setData(await api<PointsData>("/member/points/")),
    [],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const act = async (path: string) => {
    setBusy(true);
    setError("");
    try {
      await send(path);
      await refresh();
      dialog.current?.close();
      setMessage("操作成功，记录已更新。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const daily = data?.tasks.filter((t) => t.group === "daily") || [],
    completed = daily.filter((t) => t.status === "done").length;
  return (
    <div className="container points-workspace page">
      <nav className="breadcrumb">
        <Link href="/account/">个人中心</Link>
        <span>/</span>
        <span>积分中心</span>
      </nav>
      <div className="page-header">
        <div>
          <h1>积分中心</h1>
          <p>每一点积累，都能换来新的发现。</p>
        </div>
        <details className="points-rule">
          <summary>
            <Icon name="help" size={15} />
            积分规则
          </summary>
          <p>
            日常任务按北京时间每天重置；基础任务奖励一次；进阶任务审核后发奖。兑换前请阅读权益说明，兑换记录由服务端保存。
          </p>
        </details>
      </div>
      <section className="points-overview">
        <div className="points-wallet">
          <span>
            <Icon name="coins" size={28} />
          </span>
          <div>
            <small>可用积分</small>
            <strong>
              {data?.balance ?? "—"}
              <small>积分</small>
            </strong>
          </div>
        </div>
        <div className="points-daily">
          <div>
            <span>今日任务</span>
            <strong>
              {completed}
              <small> / {daily.length || 3}</small>
            </strong>
          </div>
          <div
            className="points-track"
            role="progressbar"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={3}
            aria-label="今日任务完成度"
          >
            {[0, 1, 2].map((i) => (
              <span className={i < completed ? "complete" : ""} key={i} />
            ))}
          </div>
          <small>每天一点，积攒新的可能</small>
        </div>
        <button className="points-gifts" onClick={() => setTab("exchange")}>
          <Icon name="gift" size={26} />
          <span>
            <strong>发现积分好礼</strong>
            <small>查看可兑换权益与领取条件</small>
          </span>
          <Icon name="arrow" />
        </button>
      </section>
      <div className="points-navigation">
        <div className="segmented">
          {[
            ["tasks", "赚取积分", "calendar"],
            ["exchange", "兑换好礼", "gift"],
            ["records", "收支明细", "file"],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </div>
        <span>探索 · 参与 · 收获</span>
      </div>
      <ErrorMessage error={error} />
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {!data ? (
        <div className="loading">正在读取积分…</div>
      ) : tab === "tasks" ? (
        <>
          <div className="points-board-title">
            <h2>
              赚取积分 <small>从小小的参与开始</small>
            </h2>
            <div className="task-filters">
              {[
                ["all", "全部任务"],
                ["daily", "日常"],
                ["basic", "基础"],
                ["advanced", "进阶"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                  <small>
                    {
                      data.tasks.filter((t) => id === "all" || t.group === id)
                        .length
                    }
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className="task-board">
            <div className="task-board-head">
              <span>任务</span>
              <span>类型</span>
              <span>奖励</span>
              <span>操作</span>
            </div>
            {data.tasks
              .filter((t) => filter === "all" || t.group === filter)
              .map((t) => (
                <article className="task-row" key={t.id}>
                  <div className="task-identity">
                    <span className={"task-icon " + t.group}>
                      <Icon
                        name={
                          t.id === "checkin"
                            ? "calendar"
                            : t.id.includes("check")
                              ? "zap"
                              : t.id === "profile"
                                ? "users"
                                : t.id.includes("saved")
                                  ? "heart"
                                  : t.id === "invite"
                                    ? "link"
                                    : t.id === "review"
                                      ? "message"
                                      : "gift"
                        }
                        size={20}
                      />
                    </span>
                    <div>
                      <h3>{t.name}</h3>
                      <p>{t.description}</p>
                    </div>
                  </div>
                  <span className="task-type">
                    {
                      { daily: "日常", basic: "基础", advanced: "进阶" }[
                        t.group
                      ]
                    }
                    任务
                  </span>
                  <strong className="task-reward">
                    +{t.points}
                    <small>积分</small>
                  </strong>
                  <div className="task-action">
                    {t.status === "done" ? (
                      <span className="task-done">
                        <Icon name="check" size={14} />
                        已完成
                      </span>
                    ) : t.status === "claim" ? (
                      <button
                        className="button small"
                        disabled={busy}
                        onClick={() =>
                          act("/member/points/claim/" + t.id + "/")
                        }
                      >
                        {t.id === "checkin" ? "去签到" : "领取积分"}
                      </button>
                    ) : (
                      <Link
                        className="button small"
                        href={t.href || "/account/"}
                      >
                        {t.status === "verify" ? "去参与" : "去完成"}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
          </div>
          <p className="source-note">
            <Icon name="clock" size={14} />
            日常任务每天 00:00 更新 · 进阶任务核验后发放奖励
          </p>
        </>
      ) : tab === "exchange" ? (
        <>
          <div className="section-title">
            <div>
              <h2>把积分，换成新的体验。</h2>
              <p>仅开放有库存且可发放的权益，每份权益每日限兑一次。</p>
            </div>
          </div>
          <div className="rewards-grid">
            {data.rewards.map((r) => (
              <article className="reward-card" key={r.id}>
                <Icon name="gift" size={29} />
                <h3>{r.name}</h3>
                <p>{text(r.description)}</p>
                <div>
                  <strong>
                    {text(r.cost)}
                    <small>积分</small>
                  </strong>
                  <button
                    className="button small"
                    disabled={
                      busy ||
                      r.status !== "启用" ||
                      Number(r.stock) < 1 ||
                      data.balance < Number(r.cost)
                    }
                    onClick={() => {
                      setReward(r);
                      setError("");
                      dialog.current?.showModal();
                    }}
                  >
                    {r.status !== "启用" || Number(r.stock) < 1
                      ? "暂未开放"
                      : data.balance < Number(r.cost)
                        ? "积分不足"
                        : "立即兑换"}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <h2 className="subsection-heading">我的兑换</h2>
          {data.redemptions.length ? (
            data.redemptions.map((r) => (
              <article className="ledger-row" key={r.id}>
                <div>
                  <h3>{r.name}</h3>
                  <p>
                    {text(
                      r.fulfillment || "平台处理后，发放说明会显示在这里。",
                    )}
                  </p>
                </div>
                <Status value={r.status} />
              </article>
            ))
          ) : (
            <Empty
              title="还没有兑换记录"
              description="可发放权益上架后，即可使用积分兑换。"
            />
          )}
        </>
      ) : (
        <>
          <div className="task-filters ledger-filters">
            {[
              ["all", "全部记录"],
              ["earned", "获得积分"],
              ["spent", "消耗积分"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={recordFilter === id}
                onClick={() => setRecordFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {data.records
            .filter(
              (r) =>
                recordFilter === "all" ||
                (recordFilter === "earned" ? r.amount > 0 : r.amount < 0),
            )
            .map((r) => (
              <article className="ledger-row" key={r.id}>
                <span className="task-icon">
                  <Icon name="coins" />
                </span>
                <div>
                  <h3>{r.title}</h3>
                  <p>
                    {dateText(r.date)} · 余额 {r.balance}
                  </p>
                </div>
                <strong className={r.amount > 0 ? "earned" : ""}>
                  {r.amount > 0 ? "+" : ""}
                  {r.amount}
                </strong>
              </article>
            ))}
          {!data.records.length && (
            <Empty
              title="还没有积分记录"
              description="从每日签到开始，领取第一份奖励。"
            />
          )}
        </>
      )}
      <dialog ref={dialog} className="admin-dialog compact">
        <header>
          <h2>确认兑换权益</h2>
          <button
            className="icon-button"
            aria-label="关闭"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="admin-dialog-body">
          <h3>{reward?.name}</h3>
          <p className="muted">{text(reward?.description)}</p>
          <dl className="redemption-summary">
            <div>
              <dt>当前积分</dt>
              <dd>{data?.balance}</dd>
            </div>
            <div>
              <dt>本次消耗</dt>
              <dd>−{text(reward?.cost)}</dd>
            </div>
            <div>
              <dt>兑换后剩余</dt>
              <dd>{data ? data.balance - Number(reward?.cost || 0) : ""}</dd>
            </div>
          </dl>
          <ErrorMessage error={error} />
        </div>
        <footer>
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            再想想
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              reward && act("/member/points/redeem/" + reward.id + "/")
            }
          >
            确认兑换
          </button>
        </footer>
      </dialog>
    </div>
  );
}

export function SubmissionForm({ catalog }: { catalog: Catalog }) {
  const { user, loading } = useAuth(),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  if (loading) return <div className="loading">正在检查账户…</div>;
  if (!user) return <LoginRequired />;
  if (done)
    return (
      <Empty
        title="申请已提交"
        description="平台会核对资料，审核意见可在个人中心查看。"
      >
        <Link href="/account/submissions/" className="button">
          查看我的申请
        </Link>
      </Empty>
    );
  return (
    <form
      className="submission-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await send("/member/submissions/", {
            name: f.get("name"),
            domain: f.get("domain"),
            category: f.get("category"),
            summary: f.get("summary"),
            contact: f.get("contact"),
            models: f.getAll("models"),
            payments: f.getAll("payments"),
            invoice: f.get("invoice"),
          });
          setDone(true);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          站点名称
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            placeholder="与你的官网展示名称一致"
          />
        </label>
        <label>
          官网地址
          <input name="domain" type="url" required placeholder="https://" />
        </label>
        <label>
          收录分类
          <select name="category" required>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.slug || ""}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          联系方式
          <input
            name="contact"
            required
            minLength={3}
            maxLength={240}
            defaultValue={user.email}
          />
        </label>
        <label className="full">
          站点介绍
          <textarea
            name="summary"
            rows={4}
            minLength={20}
            maxLength={3000}
            required
            placeholder="介绍服务范围、适用用户及公开政策，至少 20 字。"
          />
        </label>
        <fieldset className="full">
          <legend>支持模型</legend>
          <div className="multi-options">
            {["GPT", "Claude", "Gemini", "DeepSeek", "Qwen", "Grok"].map(
              (m) => (
                <label key={m}>
                  <input type="checkbox" name="models" value={m} />
                  {m}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <fieldset className="full">
          <legend>支付方式</legend>
          <div className="multi-options">
            {["支付宝", "微信支付", "USDT", "银行卡", "PayPal"].map((m) => (
              <label key={m}>
                <input type="checkbox" name="payments" value={m} />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          支持开票
          <select name="invoice">
            <option>未确认</option>
            <option>支持</option>
            <option>不支持</option>
          </select>
        </label>
      </div>
      <p className="source-note">
        资料由平台审核后公开，提交不代表质量认证，也不影响检测评分。
      </p>
      <ErrorMessage error={error} />
      <div className="form-actions">
        <button className="button" disabled={busy} type="submit">
          提交收录申请
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </form>
  );
}
