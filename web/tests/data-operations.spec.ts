import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPresentation } from "../src/presentation/render.mjs";

const password = readFileSync("../api/.env", "utf8")
  .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)![1]
  .trim();

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱", { exact: true }).fill("admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\//);
}

test("collection health displays actual coverage, filters stations and fits mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.goto("/admin/collection/health/");
  await expect(
    page.getByRole("heading", { name: "采集健康", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ops-metric")).toHaveCount(4);
  await expect(page.locator(".ops-table tbody tr")).toHaveCount(20);
  await page.screenshot({
    path: "../verification/collection-health-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("搜索采集站点").fill("aruhub");
  await expect(page.locator(".ops-table tbody tr")).toHaveCount(1);
  await page.locator(".ops-table details summary").click();
  await expect(page.locator(".ops-table details[open]")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/collection-health-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("translation health shows completion, provider status and maintenance entry", async ({
  page,
}) => {
  await login(page);
  await page.goto("/admin/content/translation-health/");
  await expect(
    page.getByRole("heading", { name: "英文完成度", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ops-metric")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "核对并复用译文", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".ops-progress-list progress").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "核对并复用译文", exact: true })
    .click();
  await expect(page.locator(".ops-message")).toContainText("已核对现有译文");
  await page.screenshot({
    path: "../verification/translation-health-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("SEO inspection task create edit detail delete uses the normal admin workflow", async ({
  page,
}) => {
  await login(page);
  const name = "SEO UI verification " + Date.now();
  const base = "/api/v1/admin/records/seo-inspection-tasks/";
  const csrf = (await (await page.request.get("/api/v1/auth/session/")).json())
    .csrf;
  let id = "";
  try {
    await page.goto("/admin/content/seo-inspections/");
    await page
      .getByRole("button", { name: "新增SEO 巡检", exact: true })
      .click();
    await page.locator("#field-name").fill(name);
    await page.getByRole("checkbox", { name: "中文", exact: true }).check();
    await page.getByRole("checkbox", { name: "英文", exact: true }).check();
    await page.locator("#field-maxPages").fill("20");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toBeVisible();
    id = (
      await (
        await page.request.get(base + "?q=" + encodeURIComponent(name))
      ).json()
    ).items[0].id;
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator("#field-maxPages").fill("25");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    await row.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.locator("dialog")).toContainText("25");
    await page
      .locator("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await row.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await expect(row).toHaveCount(0);
    id = "";
    await page.screenshot({
      path: "../verification/seo-inspections-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    if (!id)
      id =
        (
          await (
            await page.request.get(base + "?q=" + encodeURIComponent(name))
          ).json()
        ).items[0]?.id || "";
    if (id)
      await page.request.post(base + id + "/actions/delete/", {
        headers: { "x-csrf-token": csrf },
        data: {},
      });
  }
});

test("live automatic pricing and FluxLane history are server rendered with accurate scopes", async ({
  page,
}) => {
  const station = await (
    await page.request.get("/api/v1/public/stations/0elog/")
  ).json();
  expect(station.sourcePricing.collectedAt).toBeTruthy();
  expect(station.sourcePricing.modelCount).toBeGreaterThan(0);
  expect(
    station.sourcePricing.rows.every(
      (r: { pricing: { currency: string; unitVerified: boolean } }) =>
        r.pricing.currency === "未确认" && !r.pricing.unitVerified,
    ),
  ).toBe(true);
  const html = await (await page.request.get("/stations/0elog/")).text();
  expect(html).toContain("报价更新于");
  expect(html).toContain("https://www.kugni.com/stations/0elog/");
  const flux = await (
    await page.request.get("/api/v1/public/stations/fluxlane/")
  ).json();
  expect(flux.channelSnapshot.historyScope).toBe("site-wide");
  expect(flux.channelSnapshot.supportedRanges).toEqual(["7d"]);
  expect(flux.channelSnapshot.channels[0].windows["7d"].history).toHaveLength(
    7,
  );
  expect(
    flux.channelSnapshot.modelChannels.every(
      (r: { windows: { "7d": { history: unknown[] } } }) =>
        !r.windows["7d"].history.length,
    ),
  ).toBe(true);
  await page.goto("/stations/fluxlane/");
  await expect(
    page.locator('[data-action="detail-model-range"][data-value="7d"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#source-model-browser")).toContainText(
    "全站调用表现",
  );
  await page
    .locator('[data-action="detail-model-mode"][data-value="model"]')
    .click();
  await expect(page.locator("#source-model-browser")).toContainText(
    "全站型号汇总",
  );
});

test("English plan readiness tracks actual translated content and exposes complete SEO", async ({
  page,
}) => {
  const slug = "anthropic-claude/product-subscription";
  const catalog = await (
    await page.request.get("/api/v1/public/catalog/")
  ).json();
  const importedPackages = await (
    await page.request.get("/api/v1/public/model-packages/?slug=" + slug)
  ).json();
  const bundle = await (
    await page.request.get("/api/v1/public/localization/")
  ).json();
  const payload = {
    path: "/coding-plans/" + slug,
    query: "",
    locale: "en",
    catalog,
    stations: [],
    pricing: { items: [], source: [] },
    reports: [],
    plans: [],
    content: {},
    importedPackages,
    translations: { ...bundle.dictionary },
    pendingTranslations: [],
  };
  const originalName = importedPackages.items[0].name;
  importedPackages.items[0].name = "测试待校对套餐名称";
  const pending = createPresentation(payload);
  expect(pending.missingTranslations).toContain("测试待校对套餐名称");
  payload.translations["测试待校对套餐名称"] = "Reviewed plan name";
  const ready = createPresentation(payload);
  expect(ready.main).toContain("Reviewed plan name");
  expect(ready.missingTranslations).toHaveLength(0);
  importedPackages.items[0].name = originalName;
  const response = await page.request.get("/en/coding-plans/" + slug + "/");
  const html = await response.text();
  expect(html.includes('name="robots" content="index, follow')).toBe(true);
  expect(html).toContain("https://www.kugni.com/en/coding-plans/" + slug + "/");
  expect(html).not.toContain(
    "Translation pending. Refer to the linked source for details.",
  );
});
