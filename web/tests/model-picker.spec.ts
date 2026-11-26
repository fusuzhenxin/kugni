import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("model picker includes published IDs, brand icons, search and custom input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const input = page.locator("#home-model");
  await expect(input).toHaveAttribute("role", "combobox");
  expect(
    await input.evaluate((node) => getComputedStyle(node).borderTopWidth),
  ).toBe("0px");
  const catalog = await (
    await page.request.get("/api/v1/public/catalog/")
  ).json();
  const ids = catalog.modelSuggestions
    .map((m: { modelId: string }) => m.modelId)
    .sort();
  expect(ids.length).toBe(52);
  expect(
    await page
      .locator("#home-model-options option")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLOptionElement).value).sort(),
      ),
  ).toEqual(ids);
  const brands = await page
    .locator("#home-model-options option")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).dataset.brand || ""),
    );
  const groups = brands.filter(
    (brand, index) => index === 0 || brand !== brands[index - 1],
  );
  expect(groups.slice(0, 3)).toEqual(["GPT", "Claude", "Gemini"]);
  expect(new Set(groups).size).toBe(groups.length);
  await input.click();
  const menu = page.locator(".public-model-menu:popover-open");
  let shown = await menu.locator('[role="option"]').count();
  while (shown < ids.length) {
    await menu.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect
      .poll(() => menu.locator('[role="option"]').count())
      .toBeGreaterThan(shown);
    shown = await menu.locator('[role="option"]').count();
  }
  const renderedBrands = await menu
    .locator('[role="option"]')
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          node
            .querySelector("[data-model-brand]")
            ?.getAttribute("data-model-brand") || "",
      ),
    );
  expect(renderedBrands).toEqual(brands);
  await input.press("Escape");
  for (const [query, brand] of [
    ["doubao", "豆包"],
    ["minimax", "MiniMax"],
    ["mimo", "MiMo"],
    ["grok", "Grok"],
    ["claude", "Claude"],
  ]) {
    await input.fill(query);
    const option = page
      .locator(".public-model-option")
      .filter({ has: page.locator(`[data-model-brand="${brand}"]`) })
      .first();
    await expect(option.locator("img")).toHaveAttribute(
      "data-model-brand",
      brand,
    );
    await expect
      .poll(() =>
        option
          .locator("img")
          .evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const id = await option
      .locator(".public-model-option-name")
      .evaluate((node) => node.firstChild!.textContent!);
    await option.click();
    await expect(input).toHaveValue(id!);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-model-mark] img")).toHaveAttribute(
      "data-model-brand",
      brand,
    );
  }
  await input.fill("qwen");
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /listbox-0$/);
  await input.press("Enter");
  await expect(input).toHaveValue(/qwen/i);
  await input.click();
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.fill("custom-private-model-id");
  await expect(page.locator(".public-model-caption")).toContainText(
    "未找到匹配型号",
  );
  await input.press("ArrowDown");
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await page.locator("h1").click();
  expect(
    await input.evaluate((node) =>
      new FormData(node.closest("form")!).get("model"),
    ),
  ).toBe("custom-private-model-id");
  expect(errors).toEqual([]);
});

test("source models also show their brand mark in global search and pricing", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#global-search-trigger").click();
  await page.locator("dialog[open] input").fill("mimo");
  const result = page
    .locator(".discovery-result")
    .filter({ has: page.locator('[data-model-brand="MiMo"]') })
    .first();
  await expect(result).toBeVisible();
  const href = await result.getAttribute("href");
  await result.click();
  await expect(page).toHaveURL(
    new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
  );
  await expect(
    page.locator('.relay-current-model [data-model-brand="MiMo"]'),
  ).toBeVisible();
});

test("all detection pages share icons and usable popovers in both languages and themes", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/tools/api-check/",
    "/tools/candy-test/",
    "/tools/model-fingerprint/",
    "/en/",
    "/en/tools/candy-test/",
  ]) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const input = page.locator("[data-model-picker]").first();
      await expect(input).toHaveAttribute("role", "combobox");
      for (const theme of ["light", "dark"]) {
        await page
          .locator(".public-site")
          .evaluate(
            (node, theme) => node.setAttribute("data-theme", theme),
            theme,
          );
        await input.fill("minimax");
        const menu = page.locator(".public-model-menu:popover-open");
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(901);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width + 1);
        if (path === "/")
          await page.screenshot({
            path: `../verification/model-picker-${width}-${theme}.png`,
            animations: "disabled",
          });
        if (path.startsWith("/en/"))
          expect(await menu.innerText()).not.toMatch(/[\u3400-\u9fff]/);
        await input.press("Escape");
      }
    }
  }
});

test("model menus prefer a shorter downward list when the full menu cannot fit", async ({
  page,
}) => {
  for (const width of [1912, 1440, 390]) {
    await page.setViewportSize({ width, height: 956 });
    await page.goto("/");
    const input = page.locator("#home-model");
    await expect(input).toHaveAttribute("role", "combobox");
    await input.scrollIntoViewIfNeeded();
    // Keep only 240 visual pixels below the field even when page scale changes.
    const bottom = await input.evaluate(
      (node) =>
        node.closest("[data-model-field]")!.getBoundingClientRect().bottom,
    );
    const height = Math.round(bottom + 240);
    await page.setViewportSize({ width, height });
    await input.click();
    const field = await page
      .locator("[data-model-field]")
      .first()
      .boundingBox();
    const menu = page.locator(".public-model-menu:popover-open");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(field!.y + field!.height + 5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(height - 10);
    expect(box!.height).toBeLessThan(300);
    expect(
      await menu.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    if (width === 1912)
      await page.screenshot({
        path: "../verification/model-picker-downward.png",
        animations: "disabled",
      });
    await menu.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const last = menu.locator('[role="option"]').last();
    const model = await last
      .locator(".public-model-option-name")
      .evaluate((node) => node.firstChild!.textContent!);
    await last.click();
    await expect(input).toHaveValue(model);
    await expect(input).toHaveAttribute("aria-expanded", "false");
  }
});

test("Key discovery refreshes the same picker and submits the selected exact ID", async ({
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
  await page.route("**/api/v1/tests/discover/", (route) =>
    route.fulfill({
      json: {
        models: [
          { id: "fixture-minimax-model" },
          { id: "fixture-qwen-model" },
          { id: "fixture-claude-model" },
          { id: "fixture-gpt-model" },
        ],
        errors: [],
      },
    }),
  );
  let requestModel: string | undefined;
  await page.route("**/api/v1/tests/executions/", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestModel = route.request().postDataJSON().model;
    return route.fulfill({
      status: 202,
      json: { id: "fixture-picker", status: "completed", reports: [] },
    });
  });
  await page.goto("/");
  await page.locator("#home-endpoint").fill("https://example.com/v1");
  await page.locator("#home-api-key").fill("fixture-only");
  await page.locator('[data-action="home-demo-key"]').click();
  await expect(page.locator("#home-model")).toHaveValue(
    "fixture-minimax-model",
  );
  await page.locator("#home-model").click();
  await expect(page.locator(".public-model-option")).toHaveCount(4);
  expect(
    await page
      .locator(".public-model-option img")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-model-brand")),
      ),
  ).toEqual(["GPT", "Claude", "Qwen", "MiniMax"]);
  await page
    .locator(".public-model-option")
    .filter({ hasText: "fixture-qwen-model" })
    .click();
  await page.locator("#home-check-form button[type=submit]").click();
  await expect.poll(() => requestModel).toBe("fixture-qwen-model");
  await expect(page.locator("#home-api-key")).toHaveValue("");
});

test("model IDs remain available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3001/");
    await expect(page.locator("#home-model")).toHaveAttribute(
      "list",
      "home-model-options",
    );
    const catalog = await (
      await page.request.get("/api/v1/public/catalog/")
    ).json();
    expect(await page.locator("#home-model-options option").count()).toBe(
      catalog.modelSuggestions.length,
    );
    await page.locator("#home-model").fill("custom-model-id");
    await expect(page.locator("#home-model")).toHaveValue("custom-model-id");
  } finally {
    await context.close();
  }
});

test("admin common models update SSR suggestions after create, edit, pause and delete", async ({
  page,
  context,
}) => {
  const password = readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();
  const base = "/api/v1/admin/records/model-suggestions/";
  let recordId = "";
  const name = "gpt-ui-config-" + Date.now();
  const renamed = name + "-edited";
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱", { exact: true }).fill("admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\//);
  const publicPage = await context.newPage();
  const publicIds = async (path = "/") => {
    await publicPage.goto(path);
    return publicPage
      .locator("datalist option")
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  };
  try {
    // Warm the public cache before changing configuration.
    expect(await publicIds()).not.toContain(name);
    await page.goto("/admin/models/suggestions/");
    await expect(
      page.getByRole("heading", { name: "常用模型", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "新增常用模型", exact: true })
      .click();
    await page.locator("#field-name").fill(name);
    await page.locator("#field-sort").fill("0");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toBeVisible();
    recordId = (await (await page.request.get(base + "?q=" + name)).json())
      .items[0].id;
    await expect.poll(async () => (await publicIds())[0]).toBe(name);
    // Keep the record visible even when editing its order moves it beyond page one.
    await page.getByLabel("搜索记录", { exact: true }).fill(name);
    await page.getByRole("button", { name: "查询", exact: true }).click();
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator("#field-name").fill(renamed);
    await page.locator("#field-sort").fill("999");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    await expect
      .poll(async () => (await publicIds("/en/")).includes(renamed))
      .toBe(true);
    const ids = await publicIds();
    expect(ids).not.toContain(name);
    expect(ids.indexOf(renamed)).toBe(10); // All ten configured GPT choices precede it.
    await row.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.locator("dialog")).toContainText(renamed);
    await page
      .locator("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await row.getByRole("button", { name: "切换启停", exact: true }).click();
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await expect(row).toContainText("停用");
    await expect
      .poll(async () => (await publicIds()).includes(renamed))
      .toBe(false);
    await row.getByRole("button", { name: "切换启停", exact: true }).click();
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await expect(row).toContainText("启用");
    await expect
      .poll(async () =>
        (await publicIds("/tools/api-check/")).includes(renamed),
      )
      .toBe(true);
    await page.screenshot({
      path: "../verification/admin-common-models.png",
      animations: "disabled",
    });
    await row.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect
      .poll(async () => (await publicIds()).includes(renamed))
      .toBe(false);
  } finally {
    // Remove only this test's temporary record, including after a UI assertion failure.
    if (recordId) {
      const session = await (
        await page.request.get("/api/v1/auth/session/")
      ).json();
      await page.request.post(base + recordId + "/actions/delete/", {
        headers: { "x-csrf-token": session.csrf },
        data: {},
      });
    }
    await publicPage.close();
  }
});
