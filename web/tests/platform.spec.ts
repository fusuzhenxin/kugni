import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
const password =
  process.env.E2E_PASSWORD ||
  readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();
const adminEmail = process.env.E2E_ADMIN || "admin@kugni.com";
const publisherEmail = process.env.E2E_PUBLISHER || "local-publisher@kugni.com";
const origin = process.env.E2E_URL || "http://127.0.0.1:3001";

async function login(page: Page, email = adminEmail) {
  await page.goto(
    email === publisherEmail ? "/publisher/login/" : "/admin/login/",
  );
  await page.getByLabel("登录邮箱", { exact: true }).fill(email);
  await page.getByLabel("登录密码", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/(admin|publisher)\/dashboard\//);
  await expect(page.locator(".admin-heading h1")).toBeVisible();
}
async function session(request: APIRequestContext) {
  const r = await request.get("/api/v1/auth/session/");
  return (await r.json()).csrf as string;
}

test("public pages include readable content and canonical links without JavaScript", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  const source = JSON.parse(readFileSync("../shared/seed.json", "utf8"));
  const paths: string[] = source.routes
    .filter((r: { index: boolean }) => r.index)
    .map((r: { path: string }) => (r.path === "/" ? "/" : r.path + "/"));
  for (const path of paths) {
    const response = await p.goto(origin + path);
    expect(response?.status(), path).toBe(200);
    await expect(p.locator("h1").first()).toBeVisible();
    expect(await p.locator('link[rel="canonical"]').getAttribute("href")).toBe(
      "https://www.kugni.com" + path,
    );
    expect(
      (await p.locator('meta[name="description"]').getAttribute("content"))
        ?.length,
    ).toBeGreaterThan(10);
  }
  await p.goto(origin + "/");
  await expect(p.locator(".service-ledger tbody tr")).toHaveCount(20);
  const site = await p
    .locator('.service-ledger tbody a[href^="/stations/"]')
    .first()
    .getAttribute("href");
  await p.goto(origin + site!);
  await expect(p.locator("#overview-heading")).toBeVisible();
  const response = await p.goto(origin + "/this-page-must-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(p.locator('meta[name="robots"]').first()).toHaveAttribute(
    "content",
    /noindex/,
  );
  await ctx.close();
});

test("search, public navigation and mobile dark layout work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#global-search-trigger").click();
  await page
    .locator("dialog[open]")
    .getByRole("combobox", { name: "搜索站点或模型", exact: true })
    .fill("AICodeMirror");
  await expect(page.locator(".discovery-result")).toHaveCount(1);
  await page.locator(".discovery-result").click();
  await expect(page.locator("h1")).toContainText("AICodeMirror");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "展开主导航" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.getByRole("button", { name: "收起主导航" }).click();
  await page.locator('[data-action="theme"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/home-mobile-dark.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("all authorized admin modules load with persisted APIs", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: "../verification/admin-dashboard.png",
    animations: "disabled",
    fullPage: true,
  });
  const ctx = await (await page.request.get("/api/v1/admin/context/")).json();
  for (const module of ctx.modules) {
    await page.goto(module.path);
    await expect(page.locator(".admin-heading h1")).toHaveText(module.title);
    await expect(page.locator(".admin-main .error-message")).toHaveCount(0);
    await expect(page.locator(".admin-main .loading")).toHaveCount(0);
  }
  expect(ctx.modules.length).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test("category create, edit, detail and delete update the public page", async ({
  page,
}) => {
  await login(page);
  const slug = "e2e-category-" + Date.now();
  let id = "";
  const csrf = await session(page.request);
  try {
    const context = await (
      await page.request.get("/api/v1/admin/context/")
    ).json();
    await page.goto(
      context.modules.find((m: { key: string }) => m.key === "categories").path,
    );
    await page
      .locator(".admin-heading-actions .button")
      .filter({ hasText: "新增" })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("#field-name").fill("浏览器验证分类");
    await dialog.locator("#field-slug").fill(slug);
    await dialog
      .locator("#field-description")
      .fill("这是一条由后台发布、可从公开页面读取的分类说明。");
    await dialog.getByRole("button", { name: "保存并更新" }).click();
    await expect(dialog).toHaveCount(0);
    const list = await (
      await page.request.get(
        "/api/v1/admin/records/categories/?q=" +
          encodeURIComponent("浏览器验证分类"),
      )
    ).json();
    id = list.items.find((r: { slug: string }) => r.slug === slug).id;
    await page
      .locator("tr")
      .filter({ hasText: "浏览器验证分类" })
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    await page
      .locator("dialog[open] #field-description")
      .fill("修改后的分类说明，直接更新页面缓存。");
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "保存并更新" })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await page.request.get("/stations/categories/" + slug + "/")).text(),
        { timeout: 15000 },
      )
      .toContain("修改后的分类说明，直接更新页面缓存。");
    await page
      .locator("tr")
      .filter({ hasText: "浏览器验证分类" })
      .getByRole("button", { name: "详情", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toContainText(slug);
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page
      .locator("tr")
      .filter({ hasText: "浏览器验证分类" })
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "确认操作" })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    id = "";
    await expect
      .poll(
        async () =>
          (
            await page.request.get("/stations/categories/" + slug + "/")
          ).status(),
        { timeout: 15000 },
      )
      .toBe(404);
  } finally {
    if (id)
      await page.request.post(
        "/api/v1/admin/records/categories/" + id + "/actions/delete/",
        { headers: { "x-csrf-token": csrf }, data: {} },
      );
  }
});

test("publisher scope, profile and mobile administration work", async ({
  page,
}) => {
  await login(page, publisherEmail);
  const response = await page.request.get("/api/v1/admin/records/users/");
  expect(response.status()).toBe(403);
  const ctx = await (await page.request.get("/api/v1/admin/context/")).json();
  for (const module of ctx.modules) {
    await page.goto(module.path);
    await expect(page.locator(".admin-heading h1")).toHaveText(module.title);
    await expect(page.locator(".admin-main .error-message")).toHaveCount(0);
    await expect(page.locator(".admin-main .loading")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publisher/dashboard/");
  await expect(page.locator(".admin-heading h1")).toBeVisible();
  await expect(page.locator(".admin-main .loading")).toHaveCount(0);
  const title = page.locator(".admin-breadcrumb strong");
  expect(
    await title.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/publisher-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("station URL rename returns 301 and sitemap follows published data", async ({
  page,
}) => {
  await login(page);
  const csrf = await session(page.request);
  const headers = { "x-csrf-token": csrf };
  const slug = "e2e-station-" + Date.now();
  const response = await page.request.post("/api/v1/admin/records/stations/", {
    headers,
    data: {
      values: {
        name: "浏览器路径验证",
        slug,
        domain: "https://www.kugni.com/",
        summary: "这是临时的本地浏览器路径验证记录，验证后删除。",
        status: "已收录",
      },
    },
  });
  expect(response.status()).toBe(201);
  const record = await response.json();
  try {
    expect((await page.request.get("/stations/" + slug + "/")).status()).toBe(
      200,
    );
    const edited = await page.request.patch(
      "/api/v1/admin/records/stations/" + record.id + "/",
      { headers, data: { values: { slug: slug + "-new" } } },
    );
    expect(edited.status()).toBe(200);
    await expect
      .poll(async () =>
        (
          await page.request.get("/stations/" + slug + "/", { maxRedirects: 0 })
        ).status(),
      )
      .toBe(301);
    const redirect = await page.request.get("/stations/" + slug + "/", {
      maxRedirects: 0,
    });
    expect(new URL(redirect.headers().location, origin).href).toBe(
      origin + "/stations/" + slug + "-new/",
    );
    await expect
      .poll(async () => (await page.request.get("/sitemap.xml")).text())
      .toContain("https://www.kugni.com/stations/" + slug + "-new/");
    const html = await (await page.request.get("/stations/?q=test")).text();
    expect(html).toMatch(/name="robots" content="noindex/);
  } finally {
    await page.request.post(
      "/api/v1/admin/records/stations/" + record.id + "/actions/delete/",
      { headers, data: {} },
    );
  }
});

test("report evidence, copy link and PNG poster work in browser", async ({
  page,
}) => {
  // Browser-only fixture; protocol execution, ownership and review are tested against the API separately.
  await page.route("**/api/v1/tests/reports/e2e-fixture/", (route) =>
    route.fulfill({
      json: {
        id: "e2e-fixture",
        model: "e2e-fixture-model",
        type: "糖果测试",
        score: 80,
        status: "已通过",
        date: "2026-11-25T00:00:00Z",
        evidence: {
          success: true,
          protocol: "OpenAI Responses",
          formula: "正确题数 / 5 × 100",
          samples: [
            {
              category: "算术",
              prompt: "17+28",
              expected: "45",
              answer: "45",
              correct: true,
              elapsedMs: 120,
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/v1/tests/reports/e2e-fixture/share/", (route) =>
    route.fulfill({
      json: { url: "/tools/api-check/reports/e2e-fixture/?token=fixture" },
    }),
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/tools/api-check/reports/e2e-fixture/");
  await expect(page.locator(".report-score-ring strong")).toHaveText("80");
  await expect(page.locator(".report-question-body")).toContainText("45");
  await page
    .getByRole("button", { name: "复制链接", exact: true })
    .first()
    .click();
  await expect(page.locator("#toast")).toContainText("已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "e2e-fixture/?token=fixture",
  );
  await page
    .getByRole("button", { name: "分享海报", exact: true })
    .first()
    .click();
  await expect(page.locator(".report-share-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载海报", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("KUGNI-糖果测试-分享海报.png");
  expect(await download.failure()).toBeNull();
  await download.saveAs("../verification/report-poster-fixture.png");
});

test("approved filters, client artwork and manual fingerprint tabs remain interactive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .locator('.model-index-list a[href="/models/claude/"]')
    .first()
    .click();
  await expect(page).toHaveURL(/\/models\/claude\/$/);
  const count = await page.locator(".service-ledger tbody tr").count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(20);
  await page.goto("/developers/");
  const clients = page.locator("[data-developer-client]");
  const chosen = clients.nth(1),
    name = await chosen.getAttribute("data-developer-client");
  await chosen.click();
  await expect(page.locator("#developer-current-client")).toHaveText(name!);
  await expect(page.locator("#developer-install-prompt")).toContainText(name!);
  await page.goto("/tools/model-fingerprint/");
  await page.getByRole("tab", { name: "手动粘贴回答" }).click();
  await expect(page.locator("#model-test-manual-form")).toBeVisible();
  await expect(page.locator("#model-test-form")).toBeHidden();
  await page.getByRole("tab", { name: "API 自动检测" }).click();
  await expect(page.locator("#model-test-form")).toBeVisible();
  await page.goto("/pricing/?model=gpt-4o");
  const models = page.locator("#cost-model option");
  if ((await models.count()) > 1) {
    const model = await models.nth(1).getAttribute("value");
    await page.locator("#cost-model").selectOption(model!);
    await expect(page.locator(".relay-current-model h2")).toHaveText(model!);
  }
  await page.locator("[name=q]").fill("no-matching-provider-for-parity");
  await expect(page.locator(".relay-empty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("restored key discovery and candy quantity send the actual API contract", async ({
  page,
}) => {
  await login(page);
  let discovery: Record<string, unknown> | undefined,
    execution: Record<string, unknown> | undefined;
  await page.route("**/api/v1/tests/discover/", (route) => {
    discovery = route.request().postDataJSON();
    return route.fulfill({
      json: {
        models: [{ id: "fixture-gpt-model" }, { id: "fixture-claude-model" }],
        errors: [],
      },
    });
  });
  await page.route("**/api/v1/tests/executions/", (route) => {
    if (route.request().method() === "POST") {
      execution = route.request().postDataJSON();
      return route.fulfill({
        status: 202,
        json: { id: "ui-fixture-job", status: "queued" },
      });
    }
    return route.continue();
  });
  await page.route("**/api/v1/tests/executions/ui-fixture-job/", (route) =>
    route.fulfill({
      json: {
        id: "ui-fixture-job",
        status: "completed",
        total: 1,
        completed: 1,
        reports: [],
      },
    }),
  );
  await page.goto("/tools/candy-test/");
  await page.locator("[name=endpoint]").fill("https://example.com/v1");
  await page.locator("#tool-api-key").fill("fixture-secret-for-browser-test");
  await page.locator("[data-tool-action=models]").click();
  await expect(page.locator("#tool-model")).toHaveValue("fixture-gpt-model");
  expect(discovery?.protocol).toBe("OpenAI Chat Completions");
  expect(discovery?.model).toBeTruthy();
  await page
    .locator(".candy-quantity label")
    .filter({ has: page.locator('[name=count][value="20"]') })
    .click();
  await expect(page.locator("#candy-distribution-count")).toHaveText(
    "20 / 20 题",
  );
  await page.locator("#model-test-form button[type=submit]").click();
  await expect(page.locator("#toast")).toContainText("检测已进入队列");
  expect(execution?.questionCount).toBe(20);
  expect(execution?.type).toBe("糖果测试");
  expect(execution?.model).toBe("fixture-gpt-model");
  await expect(page.locator("#tool-api-key")).toHaveValue("");
});
