const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
export const sourceDate = (value) => {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const instant = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z",
  );
  return Number.isNaN(instant.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(instant);
};
export const sourceLink = (value, esc) => {
  const url = safeUrl(value);
  return url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">查看来源 ↗</a>`
    : "";
};

export function stationNotices(notices, esc) {
  const item = (notice, index) =>
    `<details class="station-source-notice"${index === 0 ? " open" : ""}><summary><h3>${esc(notice.title)}</h3>${notice.publishedAt ? `<time>${esc(sourceDate(notice.publishedAt))}</time>` : ""}</summary><div><p class="detail-desc">${esc(notice.text)}</p><div class="station-source-meta">${notice.collectedAt ? `<span>采集时间（北京时间） <time>${esc(sourceDate(notice.collectedAt))}</time></span>` : ""}${sourceLink(notice.sourceUrl, esc)}</div></div></details>`;
  return (
    notices.slice(0, 5).map(item).join("") +
    (notices.length > 5
      ? `<details class="station-more-notices"><summary>更多公告 <span>${notices.length - 5}</span></summary>${notices.slice(5).map(item).join("")}</details>`
      : "")
  );
}
