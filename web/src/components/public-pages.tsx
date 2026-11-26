import Link from "next/link";
import type {
  Catalog,
  Content,
  Entity,
  ListResult,
  Station,
} from "@/lib/types";
import { dateText, text } from "@/lib/types";
import { canonical } from "@/lib/server-api";
import { editorial } from "@/lib/editorial";
import { Directory, StationIntro, StationList } from "./stations";
import { Badge, Empty, Icon, SectionTitle } from "./ui";
import { ReviewForm } from "./station-actions";
import { PricingCalculator } from "./pricing";
import { SubmissionForm } from "./account-page";
import { AdSlot } from "./ads";

export function JsonLD({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
export function FAQ({ items }: { items: string[][] }) {
  if (!items.length) return null;
  return (
    <section className="detail-section">
      <h2>常见问题</h2>
      <div className="faq-list">
        {items.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <Icon name="chevron" size={14} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <JsonLD
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
    </section>
  );
}
export function Breadcrumb({ items }: { items: [string, string][] }) {
  return (
    <>
      <nav className="breadcrumb" aria-label="面包屑导航">
        {items.map(([name, path], i) => (
          <span key={path}>
            {i > 0 && <span className="breadcrumb-separator">/</span>}
            {i < items.length - 1 ? <Link href={path}>{name}</Link> : name}
          </span>
        ))}
      </nav>
      <JsonLD
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map(([name, path], i) => ({
            "@type": "ListItem",
            position: i + 1,
            name,
            item: canonical(path),
          })),
        }}
      />
    </>
  );
}

export function HomePage({
  result,
  catalog,
  reports,
}: {
  result: ListResult<Station>;
  catalog: Catalog;
  reports: Entity[];
}) {
  return (
    <div className="container page home-page">
      <section className="home-hero">
        <span className="eyebrow">
          <Icon name="sparkles" size={14} />
          FIND YOUR NEXT CONNECTION
        </span>
        <h1>
          好用的 AI，<em>从这里连接。</em>
        </h1>
        <p>发现 API 服务，比较模型与价格，让每一次选择都有据可依。</p>
        <form action="/stations/" className="hero-search">
          <Icon name="search" size={21} />
          <input
            name="q"
            placeholder="搜索服务商、模型，或你需要的能力"
            aria-label="搜索服务商"
          />
          <button className="button" type="submit">
            发现连接
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <div className="hero-quicklinks">
          <span>热门探索</span>
          <Link href="/models/openai/">OpenAI / GPT</Link>
          <Link href="/models/claude/">Claude</Link>
          <Link href="/models/gemini/">Gemini</Link>
          <Link href="/models/deepseek/">DeepSeek</Link>
        </div>
      </section>
      <section className="recent-tests">
        <strong>
          <Icon name="zap" size={16} />
          最近实测
        </strong>
        <div className="recent-items">
          {reports.length ? (
            reports.map((r) => (
              <Link href={"/tools/api-check/reports/" + r.id + "/"} key={r.id}>
                <span>{text(r.model)}</span>
                {r.score != null && <b>{text(r.score)} 分</b>}
              </Link>
            ))
          ) : (
            <span className="muted">
              首批公开报告正在准备，审核后会显示在这里。
            </span>
          )}
        </div>
        <Link href="/tools/api-check/" className="text-link">
          去检测
          <Icon name="arrow" size={14} />
        </Link>
      </section>
      <AdSlot placement="首页横幅" />
      <Directory result={result} catalog={catalog} basePath="/stations/" />
      <FAQ
        items={[
          [
            "如何选择合适的 API 服务商？",
            "先核对所需的具体模型、接口协议、支付方式和服务政策，再用独立测试凭证验证实际调用。模型生态标签不代表支持该厂商的所有型号。",
          ],
          [
            "这里的数据是实时监控吗？",
            "初始目录资料来自标注日期的公开快照。真实检测报告单独展示测试时间、模型和证据，未检测的数据不会标记为实时。",
          ],
        ]}
      />
    </div>
  );
}

export function StationPage({ station: s }: { station: Station }) {
  return (
    <div className="container page">
      <Breadcrumb
        items={[
          ["首页", "/"],
          ["站点目录", "/stations/"],
          [s.name, "/stations/" + s.slug + "/"],
        ]}
      />
      <StationIntro station={s} />
      <nav className="anchor-nav" aria-label="详情内容">
        <a href="#overview">站点概览</a>
        <a href="#pricing">模型与价格</a>
        <a href="#reports">检测记录</a>
        <a href="#notices">公告</a>
        <a href="#reviews">用户评价</a>
      </nav>
      <section id="overview" className="detail-section">
        <SectionTitle title="连接之前，先了解这些" />
        <div className="info-grid">
          {[
            ["服务状态", s.serviceStatus],
            ["支持模型生态", s.models.join(" / ")],
            ["资料日期", s.sourceDate],
            ["API 基础地址", text(s.apiBase || "未公开")],
            ["接入文档", text(s.docsUrl || "未公开")],
            ["优惠信息", s.promo && s.promo !== "—" ? text(s.promo) : "未公开"],
          ].map(([label, value]) => (
            <div className="info-item" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="source-note">
          来源：{s.source || "平台核对资料"} ·
          快照中的可用率和延迟不是当前监控结果。请在实际接入前核验。
        </p>
      </section>
      <section id="pricing" className="detail-section">
        <SectionTitle
          title="模型与价格"
          description="标准化报价与来源原始分组分别列示，缺少单位时不做跨站价格推断。"
        />
        {s.pricing?.length ? <PricingCalculator quotes={s.pricing} /> : null}
        {s.sourcePricing?.rows?.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {s.sourcePricing.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.sourcePricing.rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      {r.cells.map((v, n) => (
                        <td key={n}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="source-note">
              来源分组快照 · {s.sourcePricing.dataAsOf} ·
              原文倍率与价格未确认统一计费单位，不参与预算计算。
            </p>
          </>
        ) : (
          !s.pricing?.length && (
            <Empty
              title="暂未取得可核对的公开报价"
              description="请前往服务商官网核对型号、分组、币种和计费单位。"
            />
          )
        )}
      </section>
      <AdSlot placement="站点详情页" />
      <section id="reports" className="detail-section">
        <SectionTitle
          title="实测记录"
          description="只展示已经公开的测试证据，不根据收录标签推断质量。"
        />
        {s.reports?.length ? (
          s.reports.map((r) => (
            <article className="notice-card" key={r.id}>
              <Link href={"/tools/api-check/reports/" + r.id + "/"}>
                <h3>
                  {text(r.model)} · {text(r.type)}
                </h3>
                <p>
                  {r.score == null ? "查看响应证据" : text(r.score) + " 分"} ·{" "}
                  {dateText(r.date)}
                </p>
              </Link>
            </article>
          ))
        ) : (
          <Empty
            title="这个站点还没有公开实测"
            description="配置凭证后可发起检测，报告按发布策略审核。"
          />
        )}
      </section>
      <section id="notices" className="detail-section">
        <SectionTitle title="站点公告" />
        {s.notices?.length ? (
          s.notices.map((r) => (
            <article className="notice-card" key={r.id}>
              <h3>{r.name}</h3>
              <p>{text(r.body)}</p>
              <time>{dateText(r.updated)}</time>
            </article>
          ))
        ) : (
          <p className="muted">暂无公开公告。</p>
        )}
      </section>
      <section id="reviews" className="detail-section">
        <SectionTitle
          title="用户评价"
          description="真实体验有助于其他开发者判断，评价审核后公开。"
        />
        {s.reviews?.map((r) => (
          <article className="notice-card" key={r.id}>
            <h3>
              {text(r.author)}
              <span className="text-tag"> · {text(r.rating)} 星</span>
            </h3>
            <p>{text(r.body)}</p>
            {!!r.reply && <p>平台回复：{text(r.reply)}</p>}
          </article>
        ))}
        {!s.reviews?.length && (
          <p className="muted">还没有公开评价，分享你的第一手体验。</p>
        )}
        <ReviewForm stationId={s.id} />
      </section>
      <JsonLD
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: s.name + " API 服务资料",
          description: s.summary,
          url: canonical("/stations/" + s.slug + "/"),
          dateModified: s.updated,
        }}
      />
    </div>
  );
}

const vendorIcons: Record<string, string> = {
  openai: "openai",
  claude: "claude",
  gemini: "gemini",
  deepseek: "deepseek",
};
export function ModelsPage({ catalog }: { catalog: Catalog }) {
  return (
    <div className="container page">
      <Breadcrumb
        items={[
          ["首页", "/"],
          ["模型资料库", "/models/"],
        ]}
      />
      <div className="page-header">
        <div>
          <h1>为你的下一次创造，找到合适的模型</h1>
          <p>
            从模型生态与能力出发，了解官方入口，再核对服务商实际支持的具体型号。
          </p>
        </div>
      </div>
      <div className="model-grid">
        {catalog.models.map((m) => (
          <Link
            href={"/models/" + m.slug + "/"}
            className="model-card"
            key={m.id}
          >
            <img
              className="brand-image"
              src={
                "/assets/brands/" +
                (vendorIcons[m.slug || ""] || "openai") +
                ".svg"
              }
              alt=""
              width="38"
              height="38"
            />
            <h2>{m.name}</h2>
            <p>{text(m.summary)}</p>
            <span className="text-link">
              查看生态与服务商
              <Icon name="arrow" size={15} />
            </span>
          </Link>
        ))}
      </div>
      <AdSlot placement="模型资料页" />
    </div>
  );
}
export function ModelPage({
  model,
  result,
  catalog,
}: {
  model: Entity;
  result: ListResult<Station>;
  catalog: Catalog;
}) {
  const official: Record<string, string> = {
    openai: "https://platform.openai.com/docs/models",
    claude: "https://docs.anthropic.com/en/docs/about-claude/models",
    gemini: "https://ai.google.dev/gemini-api/docs/models",
    deepseek: "https://api-docs.deepseek.com/",
  };
  return (
    <div className="container page">
      <Breadcrumb
        items={[
          ["首页", "/"],
          ["模型资料库", "/models/"],
          [model.name, "/models/" + model.slug + "/"],
        ]}
      />
      <div className="page-header">
        <div>
          <span className="eyebrow">MODEL ECOSYSTEM</span>
          <h1>{model.name}</h1>
          <p>
            {text(model.summary)}{" "}
            具体版本、上下文、工具调用和缓存支持需核对官网及服务商当前说明。
          </p>
        </div>
        <a
          className="button secondary"
          href={official[model.slug || ""] || "https://www.kugni.com/models/"}
          target="_blank"
          rel="noopener noreferrer"
        >
          官方模型文档 ↗
        </a>
      </div>
      <SectionTitle
        title="支持此生态的服务商"
        description="生态覆盖用于初步筛选，不代表每个型号都可调用。"
      />
      <StationList items={result.items} />
      <FAQ
        items={[
          [
            "如何确认支持我需要的具体型号？",
            "在服务商模型列表、文档或测试工具中获取可调用模型，核对模型 ID 与协议后执行小额测试。",
          ],
          [
            "同一个模型名称就能直接比较价格吗？",
            "还需要核对分组、输入输出价格、缓存、币种、计费单位与倍率。条件不同的报价不能直接排序。",
          ],
        ]}
      />
    </div>
  );
}

export function EditorialPage({
  path,
  content,
  settings = {},
}: {
  path: string;
  content: Content;
  settings?: Record<string, string>;
}) {
  const local = editorial[path],
    page = content.page,
    title = text(content.seo?.title || local?.title || page?.title || "KUGNI"),
    description = text(
      content.seo?.description || local?.description || page?.description || "",
    );
  const sections = local?.sections || page?.document || [],
    faq = local?.faq || (local ? [] : page?.faq || []);
  return (
    <div className="container page">
      <div className="editorial">
        <Breadcrumb
          items={[
            ["首页", "/"],
            [title, path],
          ]}
        />
        <div className="page-header">
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        {path === "/business" ? (
          <>
            <div className="business-intro">
              <Icon name="sparkles" size={28} />
              <h2>让好服务，被更多开发者看见。</h2>
              <p>品牌展示、产品活动与开发者内容，选择适合你的合作方式。</p>
            </div>
            <div className="contact-cards">
              {[
                [
                  "品牌展示",
                  "首页、站点目录与详情页的明确标记推广",
                  "megaphone",
                ],
                [
                  "开发者活动",
                  "适用人群、周期与参与方式清晰的活动合作",
                  "gift",
                ],
                ["内容共创", "有来源、有案例的接入与使用内容", "book"],
              ].map(([name, body, icon]) => (
                <a
                  key={name}
                  href={"mailto:" + (settings.email || "liyifeng900@gmail.com")}
                >
                  <Icon name={icon} size={24} />
                  <h3>{name}</h3>
                  <p>{body}</p>
                </a>
              ))}
            </div>
            <section className="editorial-section">
              <h2>一起把合作信息说清楚</h2>
              <p>
                请附上品牌或站点名称、合作目标、展示位置、时间与相关链接。商业展示不会购买排名、评价或检测得分。
              </p>
            </section>
            <Contacts settings={settings} />
          </>
        ) : path === "/contact" ? (
          <>
            <Contacts settings={settings} />
            <FeedbackFormNote />
          </>
        ) : null}
        {sections.map(([heading, body]) => (
          <section className="editorial-section" key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
        {!sections.length && path !== "/business" && path !== "/contact" && (
          <section className="editorial-section">
            <h2>了解更多</h2>
            <p>{description}</p>
            <p>
              如需核对资料，请通过公开联系方式提供页面地址、来源链接和核对时间。
            </p>
          </section>
        )}
        <FAQ items={faq} />
      </div>
    </div>
  );
}
function Contacts({ settings }: { settings: Record<string, string> }) {
  return (
    <div className="contact-cards">
      <a href={"mailto:" + (settings.email || "liyifeng900@gmail.com")}>
        <Icon name="message" size={24} />
        <h3>邮件联系</h3>
        <p>{settings.email || "liyifeng900@gmail.com"}</p>
      </a>
      <a
        href={settings.telegram || "https://t.me/asAnnie1"}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="link" size={24} />
        <h3>Telegram</h3>
        <p>{settings.telegram || "@asAnnie1"}</p>
      </a>
      <a
        href={"https://qm.qq.com/q/" + (settings.qq || "2201219073")}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="users" size={24} />
        <h3>QQ</h3>
        <p>{settings.qq || "2201219073"}</p>
      </a>
    </div>
  );
}
function FeedbackFormNote() {
  return (
    <section className="editorial-section">
      <h2>资料纠错与功能反馈</h2>
      <p>
        附上页面地址、问题字段、原始说明链接和核对时间。不要提交密码、API Key
        或其他人的个人信息。
      </p>
      <Link href="/account/feedback/" className="button secondary">
        提交反馈
        <Icon name="arrow" size={16} />
      </Link>
    </section>
  );
}

export function DevelopersPage() {
  return (
    <div className="container page">
      <section className="developer-hero">
        <div>
          <span className="eyebrow">
            <Icon name="code" size={15} />
            BUILT FOR DEVELOPERS
          </span>
          <h1>把服务发现，接进你的工作流。</h1>
          <p>
            让工具和 AI
            助手读取有来源的站点资料、模型生态与评测说明。公开读取无需 API
            Key，引用时保留数据日期和原始链接。
          </p>
          <div className="form-actions">
            <a
              className="button"
              href="/api/v1/public/stations/"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看公开数据
              <Icon name="arrow" size={16} />
            </a>
            <Link className="text-link" href="/methodology/">
              了解资料边界
            </Link>
          </div>
        </div>
        <img
          src="/assets/illustrations/developers/example-find-light.webp"
          alt="AI 客户端读取服务目录的界面示意"
          width="520"
          height="340"
        />
      </section>
      <div className="model-grid">
        {[
          [
            "公开站点",
            "/api/v1/public/stations/",
            "按名称、分类、模型筛选，支持分页。",
          ],
          [
            "模型与分类",
            "/api/v1/public/catalog/",
            "读取当前分类、模型生态与目录配置。",
          ],
          [
            "标准化报价",
            "/api/v1/public/pricing/",
            "标准化报价与来源分组分开返回。",
          ],
          ["评测方法", "/methodology/", "理解请求、计分和模型身份判断的边界。"],
        ].map(([title, url, description]) => (
          <a href={url} className="model-card" key={url}>
            <Icon name="code" size={25} />
            <h2>{title}</h2>
            <p>{description}</p>
            <code>{url}</code>
          </a>
        ))}
      </div>
      <section className="detail-section">
        <SectionTitle
          title="几行代码，开始查询"
          description="接口返回来源字段；不能把站点标签当作实时质量或官方认证。"
        />
        <pre className="code-block">{`const response = await fetch('https://www.kugni.com/api/v1/public/stations/?model=Claude&page=1');\nconst { items, total } = await response.json();\n\nfor (const station of items) {\n  console.log(station.name, station.domain, station.sourceDate);\n}`}</pre>
      </section>
      <section className="detail-section">
        <h2>使用 AI 客户端时</h2>
        <p className="muted">
          让客户端读取公开 JSON 与评测方法，保留来源和日期。当前公开能力为 HTTP
          JSON；未提供远程 MCP 服务地址。
        </p>
        <div className="developer-examples">
          <img
            src="/assets/illustrations/developers/client-codex-light.webp"
            alt="Codex 读取公开资料的操作示意"
            loading="lazy"
          />
          <img
            src="/assets/illustrations/developers/example-station-light.webp"
            alt="核对站点资料与来源的示意"
            loading="lazy"
          />
        </div>
      </section>
      <FAQ
        items={[
          [
            "可以读取什么？",
            "公开站点、分类与模型生态、标准化报价与来源分组、已公开检测报告。账户、凭证和内部报告不在公开数据中。",
          ],
          [
            "如何判断数据是否实时？",
            "检查 sourceDate、updated 与检测报告时间。初始目录快照和后续数据库更新是不同来源，不能混称实时监控。",
          ],
        ]}
      />
    </div>
  );
}
export function SubmitPage({ catalog }: { catalog: Catalog }) {
  return (
    <div className="container page narrow-page">
      <Breadcrumb
        items={[
          ["首页", "/"],
          ["申请收录", "/submit-station/"],
        ]}
      />
      <div className="page-header">
        <div>
          <h1>让好的连接，被更多人发现。</h1>
          <p>
            准备完整的站点资料，平台核对后收录。只选择当前目录分类，避免重复或夸大描述。
          </p>
        </div>
      </div>
      <SubmissionForm catalog={catalog} />
    </div>
  );
}
