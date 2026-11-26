"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, send } from "@/lib/client-api";
import type { ListResult, Station } from "@/lib/types";
import { useAuth } from "./providers";
import { LoginRequired } from "./account-page";
import { ErrorMessage, Icon } from "./ui";

export function BenefitsEvidence() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) send("/member/evidence/benefits/").catch(() => {});
  }, [user]);
  return null;
}
export function FeedbackPage() {
  const { user, loading } = useAuth(),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  if (loading) return <div className="loading">正在加载…</div>;
  if (!user) return <LoginRequired />;
  return (
    <div className="container page narrow-page">
      <div className="page-header">
        <div>
          <h1>反馈与资料纠错</h1>
          <p>提供原始说明链接、核对时间和对应页面，方便平台查证处理。</p>
        </div>
      </div>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await send("/member/feedback/", {
              name: f.get("name"),
              body: f.get("body"),
              path: f.get("path"),
            });
            setMessage("反馈已提交，平台会核对处理。");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          标题
          <input name="name" required minLength={2} maxLength={100} />
        </label>
        <label>
          问题页面
          <input
            name="path"
            maxLength={500}
            placeholder="https://www.kugni.com/…"
          />
        </label>
        <label>
          反馈内容
          <textarea
            name="body"
            rows={6}
            required
            minLength={10}
            maxLength={3000}
          />
        </label>
        <ErrorMessage error={error} />
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <button className="button" disabled={!!message}>
          提交反馈
          <Icon name="arrow" size={16} />
        </button>
      </form>
    </div>
  );
}
export function ComparePage() {
  const [items, setItems] = useState<Station[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<ListResult<Station>>("/public/stations/?page_size=100")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  const chosen = items.filter((s) => selected.includes(s.id));
  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <h1>把关注的服务，放在一起看。</h1>
          <p>
            选择最多 4
            家，比较模型生态、支付与服务政策。来源不同或没有验证的性能不混作实时排名。
          </p>
        </div>
      </div>
      <ErrorMessage error={error} />
      <div className="compare-picker">
        {items.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={selected.length >= 4 && !selected.includes(s.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                )
              }
            />
            {s.name}
          </label>
        ))}
      </div>
      {chosen.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>对比项目</th>
                {chosen.map((s) => (
                  <th key={s.id}>
                    <Link href={"/stations/" + s.slug + "/"}>{s.name} ↗</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["models", "模型生态"],
                ["payments", "支付方式"],
                ["minRecharge", "最低充值"],
                ["invoice", "开票"],
                ["refund", "退款"],
                ["serviceStatus", "运营状态"],
                ["sourceDate", "资料日期"],
              ].map(([key, label]) => (
                <tr key={key}>
                  <th>{label}</th>
                  {chosen.map((s) => (
                    <td key={s.id}>
                      {Array.isArray(s[key])
                        ? (s[key] as string[]).join(" / ")
                        : String(s[key] || "未公开")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
