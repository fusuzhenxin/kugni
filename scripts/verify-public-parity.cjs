/* Compare the running React app with the approved, independently running prototype.
 * Reference data (scores, demo copy) is deliberately not used as production evidence.
 */
const { chromium } = require("../web/node_modules/@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const reference = process.env.REFERENCE_URL || "http://127.0.0.1:4173";
const current = process.env.PUBLIC_URL || "http://127.0.0.1:3001";
const cases = [
  ["home", "/"],
  ["directory", "/stations/"],
  ["detail", "/stations/aruhub/"],
  ["login", "/auth/login/"],
  ["developers", "/developers/"],
  ["candy", "/tools/candy-test/"],
  ["fingerprint", "/tools/model-fingerprint/"],
  ["pricing", "/pricing/"],
  ["benefits", "/benefits/"],
];
const selectors = [
  "#header",
  "#global-search-trigger",
  ".connection-intro",
  ".connection-search",
  ".recent-tests",
  ".service-ledger",
  ".service-ledger th:first-child",
  ".service-ledger tbody tr:first-child",
  ".detail-hero",
  ".detail-tabs",
  ".member-auth-layout",
  ".member-auth-story",
  ".member-auth-form-panel",
  ".site-page-heading",
  ".candy-layout",
  ".fingerprint-panel",
  ".cost-heading",
  ".perk-hero",
  "#footer",
];
async function inspect(page, origin, route, theme) {
  const response = await page.goto(origin + route);
  if (response.status() !== 200)
    throw Error(origin + route + ": " + response.status());
  await page.waitForFunction(() => document.readyState === "complete");
  await page.evaluate(async (theme) => {
    await document.fonts.ready;
    const html = document.documentElement,
      site = document.querySelector(".public-site");
    html.dataset.theme = theme;
    if (site) site.dataset.theme = theme;
  }, theme);
  return page.evaluate((selectors) => {
    const geometry = {};
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const style = getComputedStyle(node),
        rect = node.getBoundingClientRect();
      geometry[selector] = {
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        color: style.color,
        background: style.backgroundColor,
        radius: style.borderRadius,
      };
    }
    return {
      geometry,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  }, selectors);
}
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [],
    failures = [];
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({
          viewport: { width, height: 1000 },
        }),
        page = await ctx.newPage();
      for (const theme of ["light", "dark"])
        for (const [name, route] of cases) {
          const before = await inspect(page, reference, route, theme);
          const after = await inspect(page, current, route, theme);
          const differences = [];
          if (after.overflow) differences.push("horizontal overflow");
          for (const [selector, expected] of Object.entries(before.geometry)) {
            const actual = after.geometry[selector];
            if (!actual) {
              differences.push(selector + " missing");
              continue;
            }
            for (const key of [
              "width",
              "fontSize",
              "fontFamily",
              "fontWeight",
              "color",
              "background",
              "radius",
            ]) {
              if (
                typeof expected[key] === "number"
                  ? Math.abs(expected[key] - actual[key]) > 2
                  : expected[key] !== actual[key]
              )
                differences.push(
                  selector +
                    " " +
                    key +
                    ": " +
                    expected[key] +
                    " / " +
                    actual[key],
                );
            }
            // These desktop regions have identical source data and approved geometry.
            if (
              width === 1440 &&
              ["home", "detail"].includes(name) &&
              [
                ".connection-intro",
                ".recent-tests",
                ".service-ledger tbody tr:first-child",
                ".detail-hero",
                ".detail-tabs",
              ].includes(selector)
            ) {
              if (
                Math.abs(expected.height - actual.height) > 2 ||
                Math.abs(expected.y - actual.y) > 2
              )
                differences.push(selector + " geometry changed");
            }
          }
          if (theme === "light")
            await page.screenshot({
              path: path.join(
                root,
                "verification",
                `restored-${name}-${width}.png`,
              ),
            });
          if (name === "home" && width === 390 && theme === "dark")
            await page.screenshot({
              path: path.join(
                root,
                "verification",
                "restored-home-mobile-dark.png",
              ),
              fullPage: true,
            });
          const result = {
            name,
            width,
            theme,
            selectors: Object.keys(before.geometry).length,
            differences,
          };
          results.push(result);
          if (differences.length) failures.push(result);
        }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(root, "verification/public-parity.json"),
    JSON.stringify(
      {
        reference,
        current,
        cases: results.length,
        checks: results.reduce((n, r) => n + r.selectors, 0),
        failures,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        checks: results.reduce((n, r) => n + r.selectors, 0),
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
