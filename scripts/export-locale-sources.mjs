// Inventory rendered labels plus client messages. Translation never runs in a browser.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createPresentation } from "../web/src/presentation/render.mjs";
import { decodeHTML, hasChinese } from "../web/src/presentation/localization.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../web/package.json", import.meta.url));
const ts = require("typescript");
const api = process.env.API_URL || "http://127.0.0.1:8000/api/v1";
const get = async (path) => {
  const response = await fetch(api + path);
  if (!response.ok) throw new Error(`Source request failed: ${path} (${response.status})`);
  return response.json();
};
const [catalog, listing, pricing, reports, plans] = await Promise.all([
  get("/public/catalog/"), get("/public/stations/?page_size=100"), get("/public/pricing/"), get("/public/reports/"), get("/public/coding-plans/"),
]);
const phrases = new Set();
const audit = [];
function add(value) {
  const text = decodeHTML(value).trim();
  if (hasChinese(text) && text.length < 10000 && !/[<>]/.test(text)) phrases.add(text);
}
function scanHTML(html) {
  html = html.replace(/<([a-z][\w-]*)\b[^>]*\btranslate="no"[^>]*>[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<(script|style|pre|code|textarea)\b([^>]*)>[\s\S]*?<\/\1>/gi, "<$1$2></$1>");
  for (const token of html.split(/(<[^>]*>)/g)) {
    if (token.startsWith("<")) for (const match of token.matchAll(/(?:placeholder|title|alt|aria-label)="([^"]*)"/g)) add(match[1]);
    else add(token);
  }
}
const paths = [...new Set([
  ...catalog.routes.filter((r) => !/^\/(admin|publisher)(\/|$)/.test(r.path)).map((r) => r.path),
  ...catalog.models.map((model) => "/models/" + model.slug),
  ...catalog.categories.map((category) => "/stations/categories/" + category.slug),
  ...listing.items.map((station) => "/stations/" + station.slug),
])];
for (const path of paths) {
  let stations = listing.items;
  if (/^\/stations\/[^/]+$/.test(path)) {
    const detail = await get("/public/stations/" + path.split("/").at(-1) + "/");
    stations = stations.map((s) => s.id === detail.id ? detail : s);
  }
  const content = await get("/public/content/?path=" + encodeURIComponent(path));
  const payload = { path, query: "", catalog, stations, pricing, reports: reports.items, plans: plans.items, content };
  const presentation = createPresentation(payload);
  for (const html of [presentation.header, presentation.main, presentation.footer, presentation.tray]) scanHTML(html);
  const english = createPresentation({ ...payload, locale: "en" });
  audit.push({ path, missing: english.missingTranslations });
}
for (const file of ["public-controller.tsx", "auth-page.tsx"]) {
  const code = await readFile(root + "web/src/components/" + file, "utf8");
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
await mkdir(root + "shared/locales", { recursive: true });
await writeFile(root + "shared/locales/sources.json", JSON.stringify([...phrases].sort(), null, 2) + "\n");
await mkdir(root + "verification", { recursive: true });
await writeFile(root + "verification/locale-coverage.json", JSON.stringify(audit, null, 2) + "\n");
console.log(`Inventoried ${phrases.size} source strings from ${paths.length} public routes.`);
console.log(`English pages without missing labels: ${audit.filter((r) => !r.missing.length).length}/${audit.length}`);
