import english from "../../../shared/locales/en.json" with { type: "json" };

export const hasChinese = (value) => /[\u3400-\u9fff]/u.test(value);
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const decodeHTML = (value) =>
  value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (all, entity) => {
      if (entity[0] === "#")
        return String.fromCodePoint(
          parseInt(
            entity.slice(entity[1].toLowerCase() === "x" ? 2 : 1),
            entity[1].toLowerCase() === "x" ? 16 : 10,
          ),
        );
      return (
        { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[
          entity.toLowerCase()
        ] || all
      );
    },
  );

export function splitLocale(path) {
  const english = /^\/en(?:\/|$)/.test(path);
  return {
    locale: english ? "en" : "zh-CN",
    path: english ? path.slice(3) || "/" : path,
  };
}

export function localePath(value, locale = "zh-CN") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return value;
  const { path } = splitLocale(value);
  // Assets, API endpoints and both workspaces have no public language variant.
  if (
    /^\/(?:admin|publisher|api|assets|uploads|_next)(?:\/|$)/.test(path) ||
    /\.[a-z\d]+(?:[?#]|$)/i.test(path)
  )
    return path;
  return locale === "en" ? "/en" + (path === "/" ? "/" : path) : path;
}

export function createLocalizer(
  locale = "zh-CN",
  overrides = {},
  pendingSources = [],
) {
  const dictionary = { ...english, ...overrides };
  const missing = new Set();
  const pending = new Set(pendingSources);
  const keys = Object.keys(dictionary)
    .filter((key) => hasChinese(key) && key.length >= 2 && dictionary[key])
    .sort((a, b) => b.length - a.length);
  const pattern = keys.length
    ? new RegExp(
        keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "gu",
      )
    : null;
  function text(value, track = false) {
    if (typeof value !== "string" || locale !== "en" || !hasChinese(value))
      return value;
    const source = value.trim();
    if (pending.has(source)) missing.add(source);
    let translated = dictionary[source];
    if (!translated) {
      translated = source
        .replace(/第\s*(\d+)\s*题/g, "Question $1")
        .replace(/第\s*(\d+)\s*\/\s*(\d+)\s*页/g, "Page $1 of $2")
        .replace(/第\s*(\d+)\s*页/g, "Page $1")
        .replace(/每页\s*(\d+)\s*条/g, "$1 per page");
      translated = pattern
        ? translated.replace(pattern, (match) => dictionary[match])
        : translated;
      // Counters vary with filters, pages, real reports and account data.
      translated = translated
        .replace(/(\d+)\s*家/g, "$1 providers")
        .replace(/(\d+)\s*个/g, "$1")
        .replace(/(\d+)\s*条/g, "$1 entries")
        .replace(/(\d+)\s*项/g, "$1 items")
        .replace(/(\d+)\s*题/g, "$1 questions")
        .replace(/(\d+)\s*分/g, "$1 points");
    }
    if (track && hasChinese(translated)) missing.add(source);
    // Keep an incomplete translation readable until its full source is ready.
    if (hasChinese(translated)) translated = source;
    return (
      value.slice(0, value.indexOf(source)) +
      translated +
      value.slice(value.indexOf(source) + source.length)
    );
  }
  function html(markup, track = false) {
    if (locale !== "en") return markup;
    // Preserve submitted enum values while translating the visible option label.
    markup = markup.replace(
      /<option\b([^>]*)>([^<]*)<\/option>/gi,
      (all, attributes, label) =>
        /\bvalue\s*=/.test(attributes)
          ? all
          : `<option${attributes} value="${escapeHTML(decodeHTML(label))}">${label}</option>`,
    );
    const protectedTags = [];
    return markup
      .split(/(<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>)/g)
      .map((token) => {
        if (token.startsWith("<")) {
          const tag = token.match(/^<(\/?)([a-z\d-]+)/i);
          if (tag) {
            const name = tag[2].toLowerCase();
            if (tag[1]) {
              if (protectedTags.at(-1) === name) protectedTags.pop();
            } else if (
              !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
                name,
              ) &&
              !token.endsWith("/>")
            ) {
              if (
                protectedTags.length ||
                /^(script|style|pre|code|textarea)$/.test(name) ||
                /\btranslate=["']no["']/i.test(token)
              )
                protectedTags.push(name);
            }
          }
          return token
            .replace(
              /\b(placeholder|title|alt|aria-label)="([^"]*)"/gi,
              (_, attr, value) =>
                `${attr}="${escapeHTML(text(decodeHTML(value), track))}"`,
            )
            .replace(
              /\bhref="([^"]*)"/gi,
              (_, value) => `href="${localePath(value, locale)}"`,
            );
        }
        return protectedTags.length
          ? token
          : escapeHTML(text(decodeHTML(token), track));
      })
      .join("");
  }
  return { text, html, missing, dictionary };
}
