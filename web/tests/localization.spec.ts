import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const origin = process.env.E2E_URL || "http://127.0.0.1:3001";
const password =
  process.env.E2E_PASSWORD ||
  readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();
const han = /[\u3400-\u9fff]/u;

test("English content and SEO are present without JavaScript", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const sitemap = await (await request.get("/sitemap.xml")).text();
  try {
    for (const path of [
      "/",
      "/stations/",
      "/stations/categories/enterprise/",
      "/stations/aicodemirror/",
      "/models/openai/",
      "/developers/",
      "/tools/api-check/",
      "/tools/candy-test/",
      "/tools/model-fingerprint/",
    ]) {
      const enPath = "/en" + path;
      expect((await page.goto(origin + enPath))?.status(), enPath).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await page.locator("h1").first().innerText(), enPath).not.toMatch(
        han,
      );
      expect(
        await page.locator('meta[name="description"]').getAttribute("content"),
        enPath,
      ).not.toMatch(han);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://www.kugni.com" + enPath,
      );
      await expect(
        page.locator('link[hreflang="zh-CN"][rel="alternate"]'),
      ).toHaveAttribute("href", "https://www.kugni.com" + path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "index, follow",
      );
      expect(
        sitemap.includes("<loc>https://www.kugni.com" + enPath + "</loc>"),
        enPath,
      ).toBe(true);
    }
    await page.goto(origin + "/models/openai/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", "https://www.kugni.com/en/models/openai/");
    for (const path of [
      "/en/stations/?q=test",
      "/en/account/",
      "/en/auth/login/",
    ]) {
      await page.goto(origin + path);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        "content",
        /noindex/,
      );
    }
    for (const path of [
      "/en/must-not-exist/",
      "/en/models/openai/extra/",
      "/en/stations/categories/enterprise/extra/",
      "/tools/unknown/reports/fake/",
    ]) {
      expect((await page.goto(origin + path))?.status(), path).toBe(404);
    }
  } finally {
    await context.close();
  }
});

test("language switching and search keep the current English route", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/models/openai/");
  await page.locator("[data-language-toggle]").click();
  await page.locator("[data-language-switch]").click();
  await expect(page).toHaveURL(/\/en\/models\/openai\/$/);
  await page.locator("#global-search-trigger").click();
  await page.locator("dialog[open] input").fill("AICodeMirror");
  await expect(page.locator(".discovery-result").first()).toHaveAttribute(
    "href",
    "/en/stations/aicodemirror/",
  );
  expect(await page.locator(".discovery-group-title").innerText()).not.toMatch(
    han,
  );
  await page.locator(".discovery-result").first().click();
  await expect(page).toHaveURL(/\/en\/stations\/aicodemirror\/$/);
  await page.locator("[data-language-toggle]").click();
  await page.locator("[data-language-switch]").click();
  await expect(page).toHaveURL(/\/stations\/aicodemirror\/$/);
  expect(errors).toEqual([]);
});

test("English mobile and desktop layouts fit both themes", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
      await page.goto("/en/");
      await page
        .locator(".public-site")
        .evaluate(
          (node, value) => node.setAttribute("data-theme", value),
          theme,
        );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (width === 1440) {
        const actions = await page.locator(".header-actions").boundingBox();
        const nav = await page.locator("#primary-navigation").boundingBox();
        expect(nav!.x + nav!.width).toBeLessThanOrEqual(actions!.x + 1);
      }
      await page.screenshot({
        path: `../verification/english-home-${width}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/");
  await page.locator("[data-header-menu-toggle]").click();
  await page.locator('[data-nav-toggle="check"]').click();
  await page
    .locator('[data-nav-menu="check"] a[href="/en/tools/candy-test/"]')
    .click();
  await expect(page).toHaveURL(/\/en\/tools\/candy-test\/$/);
});

test("fingerprint prompts and submitted option values keep their original meaning", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/en/tools/model-fingerprint/");
  await page.locator('[data-tool-mode="manual"]').click();
  await page
    .locator(".fingerprint-questions details")
    .first()
    .locator("summary")
    .click();
  const prompt = await page
    .locator("[data-fingerprint-prompt]")
    .first()
    .innerText();
  expect(prompt).toMatch(han);
  await page.locator("[data-tool-copy]").first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    prompt,
  );
  expect((await page.goto("/en/submit-station/"))?.status()).toBe(200);
  const options = await page.locator("select option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: node.textContent || "",
    })),
  );
  expect(options.length).toBeGreaterThan(0);
  expect(options.some((option) => han.test(option.value))).toBe(true);
  for (const option of options.filter((option) => han.test(option.value)))
    expect(option.label).not.toMatch(han);
});

test("publishing and reviewing a translation refreshes English SEO without blocking Chinese", async ({
  page,
}) => {
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱").fill("admin@kugni.com");
  await page.getByLabel("登录密码").fill(password!);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.locator(".admin-heading h1")).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/auth/session/")).json())
    .csrf;
  const headers = { "x-csrf-token": csrf };
  const slug = "locale-fixture-" + Date.now();
  const source = "新增翻译校验内容，序号" + Date.now();
  const created = await page.request.post("/api/v1/admin/records/stations/", {
    headers,
    data: {
      values: {
        name: slug,
        slug,
        summary: source,
        status: "已收录",
        domain: "https://www.kugni.com/",
      },
    },
  });
  expect(created.status()).toBe(201);
  const record = await created.json();
  const englishURL = "https://www.kugni.com/en/stations/" + slug + "/";
  try {
    await expect
      .poll(async () =>
        (await page.request.get("/stations/" + slug + "/")).text(),
      )
      .toContain(source);
    const waiting = await (
      await page.request.get("/en/stations/" + slug + "/")
    ).text();
    expect(waiting).toMatch(/name="robots" content="(?:noindex|index, follow)/);
    const listed = (
      await (await page.request.get("/sitemap.xml")).text()
    ).includes("<loc>" + englishURL + "</loc>");
    if (listed) {
      // A live worker can finish between the HTML and sitemap requests.
      await expect
        .poll(async () =>
          /name="robots" content="index, follow/.test(
            await (await page.request.get("/en/stations/" + slug + "/")).text(),
          ),
        )
        .toBe(true);
    }
    const rows = (
      await (
        await page.request.get("/api/v1/admin/records/translations/?q=" + slug)
      ).json()
    ).items;
    let row = rows.find((item: { field: string }) => item.field === "summary");
    expect(row).toBeTruthy();
    if (row.status === "翻译中") {
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(
                  "/api/v1/admin/records/translations/" + row.id + "/",
                )
              ).json()
            ).status,
        )
        .not.toBe("翻译中");
      row = await (
        await page.request.get(
          "/api/v1/admin/records/translations/" + row.id + "/",
        )
      ).json();
    }
    const edited = await page.request.patch(
      "/api/v1/admin/records/translations/" + row.id + "/",
      {
        headers,
        data: {
          values: {
            translation:
              "A newly published provider with a reviewed English introduction.",
            version: row.version,
          },
        },
      },
    );
    expect(edited.status()).toBe(200);
    await expect
      .poll(async () =>
        /name="robots" content="index, follow/.test(
          await (await page.request.get("/en/stations/" + slug + "/")).text(),
        ),
      )
      .toBe(true);
    const translated = await (
      await page.request.get("/en/stations/" + slug + "/")
    ).text();
    expect(translated).toContain(
      'name="description" content="A newly published provider with a reviewed English introduction."',
    );
    expect(await (await page.request.get("/sitemap.xml")).text()).toContain(
      "<loc>" + englishURL + "</loc>",
    );
    const renamed = slug + "-renamed";
    await page.request.patch(
      "/api/v1/admin/records/stations/" + record.id + "/",
      { headers, data: { values: { slug: renamed } } },
    );
    const redirect = await page.request.get("/en/stations/" + slug + "/", {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(301);
    expect(redirect.headers().location).toContain(
      "/en/stations/" + renamed + "/",
    );
    await page.goto("/admin/content/translations/");
    await expect(page.locator(".admin-heading h1")).toHaveText("英文翻译");
  } finally {
    await page.request.post(
      "/api/v1/admin/records/stations/" + record.id + "/actions/delete/",
      { headers, data: {} },
    );
  }
});

test("English reports share an English link and generate a translated poster", async ({
  page,
}) => {
  // Browser fixture only: no fabricated test result is persisted or published.
  await page.route("**/api/v1/tests/reports/locale-report-fixture/", (route) =>
    route.fulfill({
      json: {
        id: "locale-report-fixture",
        model: "fixture-model",
        type: "糖果测试",
        score: 100,
        status: "已通过",
        date: "2026-11-25T00:00:00Z",
        evidence: {
          success: true,
          total: 1,
          correct: 1,
          samples: [
            {
              category: "数量关系",
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
  await page.route(
    "**/api/v1/tests/reports/locale-report-fixture/share/",
    (route) =>
      route.fulfill({
        json: {
          url: "/tools/api-check/reports/locale-report-fixture/?token=fixture",
        },
      }),
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/en/tools/api-check/reports/locale-report-fixture/");
  await expect(page.locator(".report-score-ring strong")).toHaveText("100");
  await page
    .getByRole("button", { name: "Copy link", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(
      "/en/tools/api-check/reports/locale-report-fixture/?token=fixture",
    );
  await page
    .getByRole("button", { name: "Share poster", exact: true })
    .first()
    .click();
  await expect(page.locator(".report-share-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  expect(await page.locator(".report-share-dialog").innerText()).not.toMatch(
    han,
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download poster", exact: true })
    .click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  await download.saveAs("../verification/english-report-poster-fixture.png");
});
