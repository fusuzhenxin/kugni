import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const detail = "/coding-plans/anthropic-claude/product-subscription/";

test("catalog navigation, filters, pagination and model SEO", async ({
  page,
}) => {
  await page.goto("/models/");
  await page.locator('[data-nav-toggle="model"]').click();
  await expect(page.locator("#model-nav-menu")).toContainText("模型大全");
  await expect(page.locator("#model-nav-menu")).toContainText("模型套餐");
  await expect(page.locator(".catalog-statline")).toContainText("656");
  const first = await page
    .locator(".catalog-model-name")
    .first()
    .getAttribute("href");
  await page
    .locator(".catalog-pagination")
    .first()
    .getByRole("link", { name: "下一页", exact: false })
    .click();
  await expect(page).toHaveURL(/page=2/);
  expect(
    await page.locator(".catalog-model-name").first().getAttribute("href"),
  ).not.toBe(first);
  await page.locator("input[name=q]").fill("glm-5.4");
  await page.locator(".catalog-filters button").click();
  await expect(page.locator(".catalog-table tbody tr")).toHaveCount(1);
  await expect(page.locator("meta[name=robots]")).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.locator(".catalog-model-name").click();
  await expect(page.locator("h1")).toHaveText("GLM-5.4");
  await expect(page.locator(".catalog-model-highlights")).toContainText("1M");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://www.kugni.com/models/glm-5-4/",
  );
  expect(
    await page
      .locator('script[type="application/ld+json"]')
      .last()
      .textContent(),
  ).toContain("SoftwareApplication");
  expect((await page.goto("/models/does-not-exist-kugni/"))?.status()).toBe(
    404,
  );
});

test("product list and complete Claude tiers preserve currencies and annual totals", async ({
  page,
}) => {
  await page.goto("/coding-plans/");
  await expect(page.locator(".catalog-product")).toHaveCount(32);
  await expect(page.locator(".catalog-statline")).toContainText("125");
  await page.locator("input[name=q]").fill("Claude");
  await page.locator(".catalog-filters button").click();
  await expect(page.locator(".catalog-product")).toHaveCount(1);
  await page.locator(".catalog-product h2 a").click();
  await expect(page).toHaveURL(new RegExp(detail));
  await expect(page.locator(".catalog-tier")).toHaveCount(5);
  const pro = page.locator(".catalog-tier").first();
  await expect(pro.locator(".catalog-tier-prices")).toContainText("$20");
  await expect(pro.locator(".catalog-tier-prices")).toContainText("$200");
  await expect(pro.locator(".catalog-tier-prices")).toContainText("年付总价");
  await expect(pro.locator(".catalog-notes")).not.toBeEmpty();
  await expect(
    pro.locator(".catalog-tags").filter({ hasText: "Claude" }),
  ).toContainText("Claude");
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    "https://www.kugni.com" + detail,
  );
});

test("SSR content, responsive themes and sitemap", async ({
  browser,
  page,
}) => {
  const plain = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await plain.newPage();
    await p.goto("http://127.0.0.1:3001" + detail);
    await expect(p.locator(".catalog-tier")).toHaveCount(5);
    await p.goto("http://127.0.0.1:3001/models/?q=glm-5.4");
    await expect(p.locator(".catalog-table tbody tr")).toHaveCount(1);
  } finally {
    await plain.close();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 956 });
    for (const path of ["/coding-plans/", detail, "/models/glm-5-4/"]) {
      for (const theme of ["light", "dark"]) {
        await page.goto(path);
        await page
          .locator(".public-site")
          .evaluate((el, t) => el.setAttribute("data-theme", t), theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          path,
        ).toBeLessThanOrEqual(width + 1);
        await page.screenshot({
          path: `../verification/catalog-${path.split("/").filter(Boolean).join("-")}-${width}-${theme}.png`,
          animations: "disabled",
        });
      }
    }
  }
  const xml = await (await page.request.get("/sitemap.xml")).text();
  expect(xml).toContain("https://www.kugni.com" + detail);
  expect(xml).toContain("https://www.kugni.com/models/glm-5-4/");
  expect(xml).toContain("https://www.kugni.com/en" + detail);
});

test("admin collection task can configure a daily schedule and restore it", async ({
  page,
}) => {
  const password = readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱", { exact: true }).fill("admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\//);
  const base = "/api/v1/admin/records/collection-tasks/hvoy-catalog-task/";
  const original = await (await page.request.get(base)).json();
  const csrf = (await (await page.request.get("/api/v1/auth/session/")).json())
    .csrf;
  try {
    await page.goto("/admin/collection/tasks/");
    await expect(
      page.getByRole("heading", { name: "数据采集任务", exact: true }),
    ).toBeVisible();
    const row = page
      .locator("tbody tr")
      .filter({ hasText: "模型与套餐资料更新" });
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByRole("combobox", { name: "更新周期", exact: true }).click();
    await page.getByRole("option", { name: "每日定时", exact: true }).click();
    await page.locator("#field-dailyTime").fill("03:30");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    await expect(row).toContainText("03:30");
    await page.screenshot({
      path: "../verification/admin-collection-tasks.png",
    });
    await page.goto("/admin/collection/runs/");
    await expect(page.locator("tbody")).toContainText("已完成");
  } finally {
    const r = await page.request.patch(base, {
      headers: { "x-csrf-token": csrf || "" },
      data: {
        values: {
          schedule: original.schedule,
          dailyTime: original.dailyTime,
          status: original.status,
        },
      },
    });
    expect(r.ok()).toBe(true);
  }
});
