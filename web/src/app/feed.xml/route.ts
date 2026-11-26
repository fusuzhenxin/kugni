import { serverApi, canonical, siteURL } from "@/lib/server-api";
const xml = (v: string) =>
  v.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function GET() {
  const data = await serverApi<{
    items: { name: string; slug: string; summary: string; updated: string }[];
  }>("/public/stations/?page_size=20&sort=newest", ["stations"]);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>KUGNI 目录更新</title><link>${siteURL}</link><description>公开站点资料更新</description>${data.items.map((s) => `<item><title>${xml(s.name)}</title><link>${canonical("/stations/" + s.slug + "/")}</link><guid>${canonical("/stations/" + s.slug + "/")}</guid><description>${xml(s.summary)}</description><pubDate>${new Date(s.updated).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } },
  );
}
