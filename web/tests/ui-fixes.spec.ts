import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const password =
  process.env.E2E_PASSWORD ||
  readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();

test("header disclosures sit below the navigation and work on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1912, height: 956 });
  await page.goto("/");
  await page.locator('[data-nav-group="check"]').hover();
  const menu = page.locator('[data-nav-menu="check"]');
  await expect(menu).toBeVisible();
  const header = await page.locator("#header").boundingBox(),
    box = await menu.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await expect(menu.getByRole("link", { name: "检测首页" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../verification/fixed-header-dropdown.png",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开主导航" }).click();
  await page.getByRole("button", { name: "展开中转站检测菜单" }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "糖果测试" }).click();
  await expect(page).toHaveURL(/\/tools\/candy-test\/$/);
});

test("home model links open model profiles with matching providers, including without JavaScript", async ({
  page,
  browser,
}) => {
  const source = (
    await (
      await page.request.get("/api/v1/public/stations/?page_size=100")
    ).json()
  ).items;
  await page.goto("/");
  const hrefs = [
    ...new Set(
      await page
        .locator(".model-index-item")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href")!),
        ),
    ),
  ];
  await page
    .locator('.model-index-list a[href="/models/claude/"]')
    .first()
    .click();
  await expect(page).toHaveURL(/\/models\/claude\/$/);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const ssr = await context.newPage();
  try {
    for (const href of hrefs) {
      const slug = href.split("/").filter(Boolean).at(-1)!;
      const brand = {
        openai: "GPT",
        claude: "Claude",
        gemini: "Gemini",
        deepseek: "DeepSeek",
        grok: "Grok",
        qwen: "Qwen",
        kimi: "Kimi",
        glm: "GLM",
      }[slug as "openai"];
      expect(brand).toBeTruthy();
      const expected = source.filter((s: { models: string[] }) =>
        s.models.includes(brand!),
      );
      const response = await ssr.goto("http://127.0.0.1:3001" + href);
      expect(response!.status()).toBe(200);
      await expect(ssr.locator(".atlas-detail h1")).toHaveText(
        slug === "openai" ? "OpenAI / GPT" : brand!,
      );
      await expect(ssr.locator(".atlas-provider-heading h2")).toContainText(
        "支持该模型的服务商",
      );
      await expect(ssr.locator(".service-ledger tbody tr")).toHaveCount(
        expected.length,
      );
      const links = await ssr
        .locator(".service-ledger a.table-name")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("href")).sort(),
        );
      expect(links).toEqual(
        expected
          .map((station: { slug: string }) => `/stations/${station.slug}/`)
          .sort(),
      );
      await expect(ssr.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://www.kugni.com" + href,
      );
      await expect(ssr.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "index, follow",
      );
    }
  } finally {
    await context.close();
  }
  expect(hrefs).toHaveLength(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".model-index-more summary").click();
  await page.locator('.model-index-overflow a[href="/models/grok/"]').click();
  await expect(page).toHaveURL(/\/models\/grok\/$/);
  await expect(page.locator(".atlas-detail h1")).toHaveText("Grok");
  await page.screenshot({
    path: "../verification/fixed-model-profile-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/models/openai/");
  await page.screenshot({
    path: "../verification/fixed-model-profile-desktop.png",
    animations: "disabled",
  });
});

test("duplicate directory heading and public attribution links are removed", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/stations/",
    "/stations/categories/enterprise/",
    "/stations/aicodemirror/",
    "/about/",
    "/compare/stations/",
  ]) {
    await page.goto(path);
    await expect(page.locator(".catalog-directory-head")).toHaveCount(0);
    await expect(page.locator(".public-site")).not.toContainText(/VeriDrop/i);
    await expect(page.locator('.public-site a[href*="veridrop"]')).toHaveCount(
      0,
    );
  }
  await page.goto("/stations/");
  await page.screenshot({
    animations: "disabled",
    path: "../verification/fixed-directory-desktop.png",
    fullPage: true,
  });
});

test("workspace selects support keyboard, dismissal and modal choices", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱").fill("admin@kugni.com");
  await page.getByLabel("登录密码").fill(password!);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.locator(".admin-heading h1")).toBeVisible();
  const range = page.getByRole("combobox", { name: "统计范围" });
  await range.click();
  await expect(page.getByRole("option", { name: "最近 7 天" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.screenshot({
    animations: "disabled",
    path: "../verification/fixed-admin-dropdown.png",
  });
  const response = page.waitForResponse((res) =>
    res.url().includes("/admin/analytics/overview/?days=30"),
  );
  await range.press("ArrowDown");
  await range.press("Enter");
  expect((await response).ok()).toBe(true);
  await expect(range).toContainText("最近 30 天");
  await range.click();
  await range.press("Escape");
  await expect(range).toHaveAttribute("aria-expanded", "false");
  await range.click();
  await page.locator(".admin-heading h1").click();
  await expect(range).toHaveAttribute("aria-expanded", "false");
  const ctx = await (await page.request.get("/api/v1/admin/context/")).json();
  await page.goto(
    ctx.modules.find((module: { key: string }) => module.key === "plans").path,
  );
  await page
    .locator(".admin-heading-actions .button")
    .filter({ hasText: "新增" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#field-station").click();
  const list = page.locator(".workspace-select-menu:popover-open");
  const box = await list.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await list.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "添加 Key 分组" }).click();
  await page.getByRole("combobox", { name: "第 1 组 Key" }).click();
  await expect(
    page.getByRole("option", { name: "选择 Key", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "../verification/fixed-admin-modal-select-mobile.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  expect(errors).toEqual([]);
});
