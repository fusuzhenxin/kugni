import { test, expect } from "@playwright/test";
const model = "/models/gpt-6-2-astra/";
const plans = "/coding-plans/openai-codex/product-subscription/";

test("specific model pages include searchable providers and usable detail links in SSR", async ({
  page,
  browser,
}) => {
  await page.goto("/models/?q=gpt-6.2-astra");
  await page.locator(".catalog-model-name").click();
  await expect(page).toHaveURL(new RegExp(model));
  const prices = await (
    await page.request.get("/api/v1/public/pricing/")
  ).json();
  const exactCount = prices.source.filter(
    (source: { rows: { cells: string[] }[] }) =>
      source.rows.some((row) => row.cells[0].toLowerCase() === "gpt-6.2-astra"),
  ).length;
  expect(exactCount).toBeGreaterThan(0);
  const providers = page.locator("#model-providers");
  await expect(providers.locator("tbody tr")).toHaveCount(exactCount);
  await expect(providers).toContainText("按已收录的具体型号匹配");
  const verifiedName = (await providers
    .locator(".table-name .table-sub")
    .first()
    .textContent())!.trim();
  const verifiedLink = await providers
    .locator(".table-name")
    .first()
    .getAttribute("href");
  await providers
    .getByRole("textbox", { name: "搜索服务商", exact: true })
    .fill(verifiedName);
  await providers.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(providers.locator("tbody tr")).toHaveCount(1);
  await expect(providers.locator(".table-name")).toContainText(verifiedName);
  await providers.locator(".table-name").click();
  await expect(page).toHaveURL("http://127.0.0.1:3001" + verifiedLink);
  const plain = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await plain.newPage();
    await p.goto("http://127.0.0.1:3001" + model);
    await expect(p.locator("#model-providers tbody tr")).toHaveCount(
      exactCount,
    );
    await expect(p.locator(".catalog-model-more")).not.toHaveAttribute("open");
    await p.locator(".catalog-model-more > summary").click();
    await expect(p.locator(".catalog-facts")).toBeVisible();
    await p.goto("http://127.0.0.1:3001" + plans);
    await p.locator("#tier-2 > summary").click();
    await expect(p.locator("#tier-2")).toHaveAttribute("open", "");
    await expect(p.locator("#tier-2 .catalog-tier-prices")).toContainText(
      "$20",
    );
  } finally {
    await plain.close();
  }
});

test("plan overview opens the selected tier and keyboard can collapse it", async ({
  page,
}) => {
  await page.goto(plans);
  await expect(page.locator(".catalog-plan-preview")).toHaveCount(7);
  await expect(page.locator("#tier-2")).not.toHaveAttribute("open");
  await page.locator('[data-tier-link="tier-2"]').click();
  await expect(page.locator("#tier-2")).toHaveAttribute("open", "");
  await expect(
    page.locator("#tier-2 .catalog-supported-models img").first(),
  ).toBeVisible();
  await page.locator("#tier-2 > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tier-2")).not.toHaveAttribute("open");
});

test("model providers and redesigned subscriptions fit desktop, phone and dark mode", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 956 });
    for (const path of [model, plans]) {
      for (const theme of ["light", "dark"]) {
        await page.goto(path);
        await page
          .locator(".public-site")
          .evaluate((el, t) => el.setAttribute("data-theme", t), theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path + theme,
        ).toBeLessThanOrEqual(width + 1);
        await expect(page.locator(".catalog-brand-orbit img")).toBeVisible();
        await page.screenshot({
          path: `../verification/detail-redesign-${path === model ? "gpt" : "chatgpt"}-${width}-${theme}.png`,
          animations: "disabled",
        });
        if (path === model) {
          await expect(page.locator(".catalog-model-more")).not.toHaveAttribute(
            "open",
          );
          const table = await page
            .locator("#model-providers .station-table")
            .boundingBox();
          expect(table!.y).toBeLessThan(width > 760 ? 520 : 760);
          await page
            .locator("#model-providers")
            .evaluate((el) => el.scrollIntoView({ block: "start" }));
          await page.screenshot({
            path: `../verification/detail-providers-${width}-${theme}.png`,
            animations: "disabled",
          });
        }
      }
    }
  }
  await page.goto("/en" + model);
  await expect(page.locator("#model-providers")).toContainText(
    "Matched by the listed model ID",
  );
  expect(errors).toEqual([]);
});
