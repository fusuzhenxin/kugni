"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, send } from "@/lib/client-api";
import { dateText, text, type Entity } from "@/lib/types";
import { useAuth } from "./providers";
import { LoginRequired } from "./account-page";
import { Empty, ErrorMessage, Icon, Status } from "./ui";

const protocols = [
  "OpenAI Chat Completions",
  "OpenAI Responses",
  "Anthropic Messages",
  "Google Gemini",
];
interface ReportData {
  id: string;
  model: string;
  type: string;
  score: number | null;
  status?: string;
  date: string;
  evidence: {
    success: boolean;
    error?: string;
    conclusion?: string;
    samples: Record<string, unknown>[];
    averageLatencyMs?: number;
    successRate?: number;
    total?: number;
    correct?: number;
    formula?: string;
    [key: string]: unknown;
  };
}
interface Job {
  id: string;
  name: string;
  status: string;
  completed: number;
  total: number;
  reports: ReportData[];
  error?: string;
}

export function TestTool({ kind }: { kind: string }) {
  const { user, loading } = useAuth(),
    [baseUrl, setBaseURL] = useState(""),
    [secret, setSecret] = useState(""),
    [protocol, setProtocol] = useState(protocols[0]),
    [model, setModel] = useState(""),
    [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const running = job && ["queued", "running"].includes(job.status);
  useEffect(() => {
    if (!running || !job) return;
    let active = true;
    const timer = setInterval(() => {
      api<Job>("/tests/executions/" + job.id + "/")
        .then((r) => {
          if (active) setJob(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [running, job?.id]);
  if (loading) return <div className="loading">正在检查账户…</div>;
  if (!user) return <LoginRequired />;
  return (
    <>
      <form
        className="test-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = await send<{ id: string; status: string }>(
              "/tests/executions/",
              { baseUrl, secret, protocol, model, type: kind },
            );
            setSecret("");
            setJob({
              ...data,
              name: model,
              completed: 0,
              total: 1,
              reports: [],
            });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="test-form-intro">
          <Icon
            name={
              kind === "糖果测试"
                ? "gift"
                : kind === "模型指纹"
                  ? "shield"
                  : "zap"
            }
            size={24}
          />
          <div>
            <h2>配置本次检测</h2>
            <p>使用独立测试凭证。请求可能消耗服务商额度，请确认后再开始。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="full">
            API 基础地址
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseURL(e.target.value);
                setModels([]);
              }}
              placeholder="https://api.example.com/v1"
              required
              maxLength={500}
            />
          </label>
          <label>
            接口协议
            <select
              value={protocol}
              onChange={(e) => {
                setProtocol(e.target.value);
                setModels([]);
              }}
            >
              {protocols.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            API Key
            <input
              type="password"
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setModels([]);
              }}
              required
              minLength={4}
              maxLength={1000}
              placeholder="仅用于本次检测，完成后清除"
              autoComplete="off"
            />
          </label>
          <label className="full">
            模型 ID
            <div className="model-discovery">
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list="discovered-models"
                required
                maxLength={180}
                placeholder="自动获取后选择，也可填写准确模型 ID"
              />
              <button
                className="button secondary"
                type="button"
                disabled={busy || !baseUrl || !secret}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const data = await send<{
                      models: typeof models;
                      errors: { error: string }[];
                    }>("/tests/discover/", {
                      baseUrl,
                      secret,
                      protocol,
                      model: model || "discovery",
                      type: kind,
                    });
                    setModels(data.models);
                    if (data.models.length) setModel(data.models[0].id);
                    if (data.errors.length)
                      setError(data.errors.map((e) => e.error).join("；"));
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                自动获取模型
              </button>
            </div>
            <datalist id="discovered-models">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
          </label>
        </div>
        <p className="source-note">
          <Icon name="lock" size={14} />
          凭证在服务端加密保存到本次任务，完成或取消后清除；不会出现在报告和分享链接中。
        </p>
        {kind === "糖果测试" && (
          <p className="source-note">
            本版本使用 5 道固定问题，按正确题数 / 5 × 100
            计算；这是有限样本的答题表现。
          </p>
        )}
        {kind === "模型指纹" && (
          <p className="source-note">
            重复采样 3
            次，记录回答与返回模型字段；当前没有校准指纹库，不给出真实型号认证结论。
          </p>
        )}
        <ErrorMessage error={error} />
        <div className="form-actions">
          <Link href="/tools/history/" className="text-link">
            检测记录
          </Link>
          <button type="submit" className="button" disabled={busy || !!running}>
            {busy ? "正在提交…" : running ? "正在检测…" : "开始检测"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
      {job && (
        <section className="test-progress">
          <div className="section-title">
            <h2>本次检测</h2>
            <Status value={job.status} />
          </div>
          <div className="progress-bar">
            <span
              style={{
                width:
                  (job.total ? (job.completed / job.total) * 100 : 0) + "%",
              }}
            />
          </div>
          <p>
            {job.completed} / {job.total} 项完成
            {running ? " · 工作进程正在执行，请稍候" : ""}
          </p>
          {job.error && <ErrorMessage error={job.error} />}
          {job.reports.map((r) => (
            <ReportView key={r.id} report={r} />
          ))}
        </section>
      )}
    </>
  );
}

export function TestHistory() {
  const { user, loading } = useAuth(),
    [items, setItems] = useState<Entity[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api<{ items: Entity[] }>("/tests/executions/")
        .then((d) => setItems(d.items))
        .catch((e) => setError(e.message));
  }, [user]);
  if (loading) return <div className="loading">正在读取记录…</div>;
  if (!user) return <LoginRequired />;
  return (
    <>
      <ErrorMessage error={error} />
      {items.length ? (
        <div className="application-list">
          {items.map((r) => (
            <article key={r.id}>
              <div>
                <h3>{r.name}</h3>
                <small>{dateText(r.created)}</small>
              </div>
              <Status value={r.status} />
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    setJob(await api<Job>("/tests/executions/" + r.id + "/"));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                查看结果 →
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="还没有检测记录"
          description="完成的任务与证据会保存在你的账户中。"
        >
          <Link className="button" href="/tools/api-check/">
            开始检测
          </Link>
        </Empty>
      )}
      {job && (
        <section className="detail-section">
          <h2>{job.name}</h2>
          {job.reports.map((r) => (
            <ReportView key={r.id} report={r} />
          ))}
        </section>
      )}
    </>
  );
}

export function ReportPage({ id }: { id: string }) {
  const [report, setReport] = useState<ReportData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      const token = new URLSearchParams(location.search).get("token") || "";
      try {
        const data = await api<ReportData>("/tests/reports/" + id + "/");
        if (active) setReport(data);
      } catch {
        try {
          const data = await api<ReportData>(
            "/public/reports/" + id + "/?token=" + encodeURIComponent(token),
          );
          if (active) setReport(data);
        } catch (e) {
          if (active) setError((e as Error).message);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="container page report-page">
      <nav className="breadcrumb">
        <Link href="/tools/api-check/">中转站检测</Link>
        <span>/</span>
        <span>检测报告</span>
      </nav>
      <ErrorMessage error={error} />
      {report ? (
        <ReportView report={report} />
      ) : (
        !error && <div className="loading">正在读取报告…</div>
      )}
    </div>
  );
}

function ReportView({ report: r }: { report: ReportData }) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const share = async () => {
    setError("");
    try {
      const result = await send<{ url: string }>(
        "/tests/reports/" + r.id + "/share/",
      );
      await navigator.clipboard.writeText(location.origin + result.url);
      setMessage("分享链接已复制");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const poster = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1200, 1500);
    c.fillStyle = "#2961ef";
    c.fillRect(78, 85, 7, 44);
    c.font = "bold 42px Arial";
    c.fillText("KUGNI", 110, 124);
    c.fillStyle = "#1d2e46";
    c.font = "bold 55px Arial";
    c.fillText(r.type + "报告", 80, 270);
    c.font = "32px Arial";
    c.fillStyle = "#586b84";
    c.fillText(r.model.slice(0, 48), 80, 340);
    c.fillStyle = "#2961ef";
    c.font = "bold 160px Arial";
    c.fillText(
      r.score == null
        ? r.evidence.success
          ? "完成"
          : "失败"
        : String(r.score),
      80,
      590,
    );
    c.fillStyle = "#586b84";
    c.font = "27px Arial";
    const lines = [
      r.score == null
        ? "依据真实请求记录，不提供推断分数"
        : r.evidence.formula || "有限样本的测试表现",
      "检测时间：" + dateText(r.date),
      "接口协议：" + text(r.evidence.protocol),
      r.evidence.averageLatencyMs
        ? "平均延迟：" + r.evidence.averageLatencyMs + " ms"
        : "",
      r.evidence.conclusion ? "仅展示采样结果，不能据此认证模型身份" : "",
      "记录与证据请查看完整报告。",
    ];
    lines
      .filter(Boolean)
      .forEach((line, i) => c.fillText(line.slice(0, 38), 80, 720 + i * 70));
    c.fillStyle = "#e4eaf3";
    c.fillRect(80, 1270, 1040, 2);
    c.fillStyle = "#586b84";
    c.font = "29px Arial";
    c.fillText("www.kugni.com", 80, 1340);
    c.fillText("发现连接，也看清每一份依据。", 80, 1400);
    const link = document.createElement("a");
    link.download = "kugni-report-" + r.id + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setMessage("报告海报已生成");
  };
  return (
    <article className="report-card">
      <header>
        <div>
          <span className="eyebrow">KUGNI TEST REPORT</span>
          <h1>{r.type}报告</h1>
          <p>
            {r.model} · {dateText(r.date)}
          </p>
        </div>
        <div className="report-score">
          <strong>
            {r.score == null
              ? r.evidence.success
                ? "已完成"
                : "未通过"
              : r.score}
          </strong>
          <small>
            {r.score == null ? "以检测证据为准" : "有限样本得分 / 100"}
          </small>
        </div>
      </header>
      <div className="report-actions">
        <button className="button secondary small" onClick={share}>
          <Icon name="link" size={15} />
          复制分享链接
        </button>
        <button className="button small" onClick={poster}>
          <Icon name="file" size={15} />
          生成分享海报
        </button>
        <Link className="text-link" href="/tools/api-check/">
          再测一次 →
        </Link>
      </div>
      <ErrorMessage error={error} />
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {r.evidence.error && <ErrorMessage error={r.evidence.error} />}
      {r.evidence.conclusion && (
        <p className="report-conclusion">{r.evidence.conclusion}</p>
      )}
      <div className="info-grid">
        {[
          ["接口协议", r.evidence.protocol],
          [
            "成功率",
            r.evidence.successRate != null
              ? r.evidence.successRate + "%"
              : "按分项查看",
          ],
          [
            "平均延迟",
            r.evidence.averageLatencyMs != null
              ? r.evidence.averageLatencyMs + " ms"
              : "按样本查看",
          ],
        ].map(([label, value]) => (
          <div className="info-item" key={String(label)}>
            <span>{String(label)}</span>
            <strong>{text(value)}</strong>
          </div>
        ))}
      </div>
      <section className="detail-section">
        <h2>检测证据</h2>
        {r.evidence.samples?.map((sample, i) => (
          <details className="report-sample" key={i} open={i === 0}>
            <summary>
              <span>{text(sample.category || "采样 " + (i + 1))}</span>
              <span>
                {sample.correct === undefined
                  ? text(sample.elapsedMs) + " ms"
                  : sample.correct
                    ? "正确"
                    : "未匹配"}
                <Icon name="chevron" size={13} />
              </span>
            </summary>
            <dl>
              {Object.entries(sample).map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {(
                      {
                        prompt: "问题",
                        expected: "期望回答",
                        answer: "实际回答",
                        text: "响应文本",
                        reportedModel: "返回模型",
                        elapsedMs: "耗时（ms）",
                        usage: "用量",
                        correct: "判定",
                        category: "类别",
                      } as Record<string, string>
                    )[k] || k}
                  </dt>
                  <dd>{text(v)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </section>
      <p className="source-note">
        报告记录指定时间、指定模型与测试集的响应，不代表服务商长期质量；密钥、请求地址不会进入分享内容。
      </p>
    </article>
  );
}
