import Link from "next/link";
import type { Catalog, ListResult, Station } from "@/lib/types";
import { Badge, Empty, Icon } from "./ui";
import { FavoriteButton } from "./station-actions";
import { OutboundLink } from "./track";

export function StationList({ items }: { items: Station[] }) {
  if (!items.length)
    return (
      <Empty
        title="暂时没有匹配的站点"
        description="试试其他分类、模型或搜索词。"
      />
    );
  return (
    <div className="station-list">
      {items.map((s) => (
        <article className="station-row" key={s.id}>
          <Link className="station-identity" href={"/stations/" + s.slug + "/"}>
            <span className="station-logo">
              {s.logo ? (
                <img
                  src={s.logo}
                  alt=""
                  width="42"
                  height="42"
                  loading="lazy"
                />
              ) : (
                <Icon name="globe" size={27} />
              )}
            </span>
            <span>
              <strong>{s.name}</strong>
              <small>{s.domain.replace(/^https?:\/\//, "")}</small>
            </span>
          </Link>
          <div className="station-description">
            <p>{s.summary}</p>
            <div className="tag-row">
              {s.models.map((m) => (
                <Badge key={m}>{m}</Badge>
              ))}
              {s.tags?.slice(0, 2).map((t) => (
                <span className="text-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="station-policy">
            <span>
              {s.payments?.slice(0, 2).join(" / ") || "支付方式未公开"}
            </span>
            <small>
              开票：{s.invoice === "—" ? "未确认" : s.invoice || "未确认"}
            </small>
          </div>
          <div className="station-row-actions">
            <FavoriteButton id={s.id} compact />
            <Link
              href={"/stations/" + s.slug + "/"}
              aria-label={"查看 " + s.name + " 详情"}
            >
              <Icon name="arrow" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Directory({
  result,
  catalog,
  category = "",
  query = "",
  model = "",
  payment = "",
  sort = "",
  basePath = "/stations/",
}: {
  result: ListResult<Station>;
  catalog: Catalog;
  category?: string;
  query?: string;
  model?: string;
  payment?: string;
  sort?: string;
  basePath?: string;
}) {
  return (
    <section id="directory" className="directory">
      <div className="category-navigation">
        <Link href="/stations/" className={!category ? "active" : ""}>
          全部站点
        </Link>
        {catalog.categories.map((c) => (
          <Link
            key={c.id}
            href={"/stations/categories/" + c.slug + "/"}
            className={category === c.slug ? "active" : ""}
          >
            {c.name}
          </Link>
        ))}
        <span className="directory-count">{result.total} 家服务商</span>
      </div>
      <form className="directory-filters" action={basePath}>
        <label className="filter-search">
          <Icon name="search" />
          <input
            name="q"
            defaultValue={query}
            placeholder="搜索站点、域名或介绍"
            aria-label="搜索站点"
          />
        </label>
        <select name="model" defaultValue={model} aria-label="模型生态">
          <option value="">全部模型</option>
          {["GPT", "Claude", "Gemini", "DeepSeek"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select name="payment" defaultValue={payment} aria-label="支付方式">
          <option value="">全部支付方式</option>
          {["支付宝", "微信支付", "USDT", "银行卡", "PayPal"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort || "recommended"}
          aria-label="排序"
        >
          <option value="recommended">目录顺序</option>
          <option value="newest">最近收录</option>
        </select>
        <button className="button secondary small" type="submit">
          筛选
        </button>
      </form>
      <StationList items={result.items} />
      {result.total > result.pageSize && (
        <nav className="pagination" aria-label="目录分页">
          {Array.from(
            { length: Math.ceil(result.total / result.pageSize) },
            (_, i) => {
              const params = new URLSearchParams({
                page: String(i + 1),
                ...(query ? { q: query } : {}),
                ...(model ? { model } : {}),
                ...(payment ? { payment } : {}),
              });
              return (
                <Link
                  href={basePath + "?" + params}
                  key={i}
                  aria-current={i + 1 === result.page ? "page" : undefined}
                >
                  {i + 1}
                </Link>
              );
            },
          )}
        </nav>
      )}
      <p className="source-note">
        公开资料快照 · {catalog.sourceDate} ·
        收录信息与当前服务状态可能不同，请以前往官网时的说明为准。
      </p>
    </section>
  );
}

export function StationIntro({ station: s }: { station: Station }) {
  return (
    <div className="station-detail-hero">
      <div className="station-detail-identity">
        <span className="station-logo large">
          {s.logo ? (
            <img src={s.logo} alt="" width="62" height="62" />
          ) : (
            <Icon name="globe" size={34} />
          )}
        </span>
        <div>
          <div className="tag-row">
            <Badge>{s.serviceStatus}</Badge>
            {s.models.map((m) => (
              <span className="text-tag" key={m}>
                {m}
              </span>
            ))}
          </div>
          <h1>{s.name}</h1>
          <p>{s.domain.replace(/^https?:\/\//, "")}</p>
        </div>
        <div className="station-detail-actions">
          <FavoriteButton id={s.id} />
          <OutboundLink href={s.registerUrl || s.domain} className="button">
            前往官网
            <Icon name="arrow" size={16} />
          </OutboundLink>
        </div>
      </div>
      <p className="detail-summary">{s.summary}</p>
      <div className="detail-policy-grid">
        {[
          ["支付方式", s.payments.join(" / ") || "未公开"],
          ["最低充值", String(s.minRecharge || "未公开")],
          ["发票政策", s.invoice === "—" ? "未确认" : s.invoice || "未确认"],
          ["退款政策", s.refund === "—" ? "未确认" : s.refund || "未确认"],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
