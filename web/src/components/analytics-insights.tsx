"use client";
import type { Analytics } from "@/lib/types";

export function AnalyticsInsights({ data }: { data: Analytics }) {
  return (
    <div className="analytics-insights">
      <div className="admin-stats">
        <article className="stat-card">
          <span>当前在线访客</span>
          <strong>{data.online ?? 0}</strong>
          <small>最近 {data.onlineWindow || 90} 秒内有活动的匿名访客</small>
        </article>
        <article className="stat-card">
          <span>地区数据</span>
          <strong>{data.geoConfigured ? "已配置" : "待配置"}</strong>
          <small>使用本地 GeoIP 数据库；无法识别时显示未知</small>
        </article>
      </div>
      <div className="admin-breakdowns">
        <section className="admin-card">
          <div className="admin-card-header">
            <h2>访客地区</h2>
          </div>
          {data.regions?.length ? (
            data.regions.map((r) => (
              <div className="breakdown-row" key={r.name}>
                <span>{r.name}</span>
                <b>{r.value}</b>
              </div>
            ))
          ) : (
            <p className="muted">有真实访问后显示地区分布。</p>
          )}
        </section>
        <section className="admin-card">
          <div className="admin-card-header">
            <h2>实时访问页面</h2>
          </div>
          {data.livePages?.length ? (
            data.livePages.map((r) => (
              <div className="breakdown-row" key={r.name}>
                <span>{r.name}</span>
                <b>{r.value}</b>
              </div>
            ))
          ) : (
            <p className="muted">暂无可展示的实时页面。</p>
          )}
        </section>
      </div>
      {data.funnels?.map((f) => (
        <section className="admin-card" key={f.name}>
          <div className="admin-card-header">
            <div>
              <h2>{f.name}</h2>
              <p>同一会话按顺序到达各步骤；不是简单相除独立访客数。</p>
            </div>
          </div>
          <ol className="analytics-funnel">
            {f.steps.map((s, i) => (
              <li key={i}>
                <div>
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <strong>{s.count}</strong>
                </div>
                <progress value={s.rate} max={100} />
                <small>
                  整体 {s.rate}% · 上一步转化 {s.stepRate}%
                </small>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section className="admin-card">
        <div className="admin-card-header">
          <h2>会话访问路径</h2>
        </div>
        {data.paths?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>上一页</th>
                  <th>下一页</th>
                  <th>访问次数</th>
                </tr>
              </thead>
              <tbody>
                {data.paths.map((p, i) => (
                  <tr key={i}>
                    <td>{p.from}</td>
                    <td>{p.to}</td>
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            有同一会话连续访问多个页面后显示；站长统计仅使用自己的广告事件。
          </p>
        )}
      </section>
    </div>
  );
}
