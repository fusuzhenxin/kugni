import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const password = readFileSync("../api/.env", "utf8")
  .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)![1]
  .trim();

async function login(page: Page) {
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱", { exact: true }).fill("admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\//);
}

test("registration code UI sends the email and preserves register fields", async ({
  page,
}) => {
  // Browser fixtures exercise interaction only; SMTP and code validation have API tests.
  let email = "";
  await page.route("**/api/v1/auth/email-code/", (route) => {
    email = route.request().postDataJSON().email;
    return route.fulfill({
      json: { message: "验证码已发送，请检查邮箱及垃圾邮件" },
    });
  });
  await page.goto("/auth/register/");
  const form = page.locator("#member-auth-form");
  await form.locator('[name="email"]').fill("ui-fixture@example.com");
  await form.locator("[data-email-code]").click();
  await expect(page.locator("#toast")).toContainText("验证码已发送");
  expect(email).toBe("ui-fixture@example.com");
  await expect(form.locator('[name="code"]')).toHaveAttribute(
    "autocomplete",
    "one-time-code",
  );
  await expect(form.locator('[name="email"]')).toHaveValue(email);
  await page.goto("/en/auth/register/");
  await expect(page.locator("[data-email-code]")).toHaveText("Send code");
  await expect(page.locator("#member-auth-form")).toContainText(
    "Email verification code",
  );
});

test("account editor persists configuration without returning secrets", async ({
  page,
}) => {
  await login(page);
  const csrf = (await (await page.request.get("/api/v1/auth/session/")).json())
    .csrf;
  const station = (
    await (await page.request.get("/api/v1/admin/records/stations/")).json()
  ).items[0];
  const response = await page.request.post(
    "/api/v1/admin/records/probe-accounts/",
    {
      headers: { "x-csrf-token": csrf },
      data: {
        values: {
          name: "UI 配置验收账户",
          station: station.id,
          adapter: "New API",
          baseUrl: "https://example.com",
          account: "ui-fixture",
          password: "fixture-not-a-real-account",
          protocols: ["OpenAI Responses"],
          status: "已暂停",
          syncInterval: 0,
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  const account = await response.json();
  try {
    expect(JSON.stringify(account)).not.toContain("fixture-not-a-real-account");
    const ctx = await (await page.request.get("/api/v1/admin/context/")).json();
    await page.goto(
      ctx.modules.find((m: { key: string }) => m.key === "probe-accounts").path,
    );
    const row = page.locator("tbody tr").filter({ hasText: account.name });
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.locator("#field-password")).toHaveValue("");
    await expect(dialog.locator("#field-managementToken")).toHaveValue("");
    await dialog.locator("#field-balanceThreshold").fill("2");
    await dialog.locator("#field-quotaPerUnit").fill("500000");
    await dialog.locator("#field-currency").fill("USD");
    await dialog.getByRole("button", { name: "保存并更新" }).click();
    await expect(dialog).toHaveCount(0);
    const saved = await (
      await page.request.get(
        "/api/v1/admin/records/probe-accounts/" + account.id + "/",
      )
    ).json();
    expect(Number(saved.balanceThreshold)).toBe(2);
    expect(saved.authConfigured).toBe(true);
    await row.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.locator("dialog[open]")).toContainText(
      "已配置加密登录凭证",
    );
    await page.screenshot({
      path: "../verification/features-account-editor.png",
      fullPage: true,
    });
  } finally {
    expect(
      (
        await page.request.post(
          "/api/v1/admin/records/probe-accounts/" +
            account.id +
            "/actions/delete/",
          { headers: { "x-csrf-token": csrf }, data: {} },
        )
      ).status(),
    ).toBe(200);
  }
});

test("new operational modules and live analytics fit desktop and mobile", async ({
  page,
}) => {
  await login(page);
  const context = await (
    await page.request.get("/api/v1/admin/context/")
  ).json();
  for (const key of [
    "account-sync-runs",
    "fingerprint-baselines",
    "reward-codes",
    "analytics-funnels",
    "messages",
  ]) {
    const module = context.modules.find((m: { key: string }) => m.key === key);
    expect(module).toBeTruthy();
    await page.goto(module.path);
    await expect(page.locator(".admin-heading h1")).toContainText(module.title);
    if (module.actions.includes("create")) {
      await page
        .locator(".admin-heading-actions .button")
        .filter({ hasText: "新增" })
        .click();
      await expect(
        page.locator("dialog[open] .admin-field").first(),
      ).toBeVisible();
      await page
        .locator("dialog[open]")
        .getByRole("button", { name: "取消", exact: true })
        .click();
    }
  }
  await page.goto(
    context.modules.find((m: { key: string }) => m.key === "traffic").path,
  );
  await expect(page.locator(".analytics-insights")).toContainText(
    "当前在线访客",
  );
  await expect(page.locator(".analytics-insights")).toContainText("已配置");
  await expect(page.locator(".analytics-funnel")).toBeVisible();
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).zoom),
  ).toBe("0.9");
  await page.screenshot({
    path: "../verification/features-analytics-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator(".analytics-insights")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/features-analytics-mobile.png",
    fullPage: true,
  });
});

test("streaming metrics and calibrated fingerprint reports render and share", async ({
  page,
}) => {
  await login(page);
  let execution: { type?: string } = {};
  await page.route("**/api/v1/tests/executions/", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    execution = route.request().postDataJSON();
    return route.fulfill({
      status: 202,
      json: { id: "ui-stream-job", status: "queued" },
    });
  });
  await page.route("**/api/v1/tests/executions/ui-stream-job/", (route) =>
    route.fulfill({
      json: {
        id: "ui-stream-job",
        status: "completed",
        total: 1,
        completed: 1,
        reports: [],
      },
    }),
  );
  await page.goto("/tools/api-check/");
  await page
    .locator('#check-form [name="endpoint"]')
    .fill("https://example.com/v1");
  await page.locator("#api-key").fill("fixture-key");
  await page.locator("#check-model").fill("fixture-model");
  await page.locator('[name="testType"]').selectOption("流式性能");
  await page.locator("#check-form button[type=submit]").click();
  await expect.poll(() => execution.type).toBe("流式性能");
  await expect(page.locator("#api-key")).toHaveValue("");
  await page.route("**/api/v1/tests/reports/ui-stream/", (route) =>
    route.fulfill({
      json: {
        id: "ui-stream",
        model: "fixture-model",
        type: "流式性能",
        status: "已通过",
        date: "2026-11-26T00:00:00Z",
        evidence: {
          success: true,
          ttftMs: 125,
          tokensPerSecond: 42.5,
          samples: [
            {
              text: "stream fixture",
              elapsedMs: 600,
              ttftMs: 125,
              outputTokens: 20,
              usage: { output_tokens: 20 },
            },
          ],
        },
      },
    }),
  );
  await page.goto("/tools/api-check/reports/ui-stream/");
  await expect(page.locator(".cr-stats")).toContainText("125 ms");
  await expect(page.locator(".cr-stats")).toContainText("42.5 tokens/s");
  await page.route("**/api/v1/tests/reports/ui-fingerprint/", (route) =>
    route.fulfill({
      json: {
        id: "ui-fingerprint",
        model: "fixture-model",
        type: "模型指纹",
        status: "已通过",
        date: "2026-11-26T00:00:00Z",
        evidence: {
          success: true,
          conclusion: "浏览器布局夹具，不是实际模型结论。",
          fingerprint: {
            state: "matched",
            matchedModel: "trusted-fixture",
            candidates: [
              { model: "trusted-fixture", similarity: 82.3, distance: 0.001 },
            ],
          },
          samples: [327, 299, 301].map((n) => ({
            count: n,
            expectedCount: n,
            distribution: [n, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          })),
        },
      },
    }),
  );
  await page.route("**/api/v1/tests/reports/ui-fingerprint/share/", (route) =>
    route.fulfill({
      json: { url: "/tools/api-check/reports/ui-fingerprint/?token=fixture" },
    }),
  );
  await page.goto("/tools/api-check/reports/ui-fingerprint/");
  await expect(page.locator(".fingerprint-result-hero")).toContainText(
    "trusted-fixture",
  );
  await expect(page.locator(".report-candidates")).toContainText("82.3%");
  await page
    .getByRole("button", { name: "分享海报", exact: true })
    .first()
    .click();
  await expect(page.locator(".report-share-canvas")).toHaveAttribute(
    "data-ready",
    "true",
  );
  await page.screenshot({
    path: "../verification/features-fingerprint-poster.png",
    fullPage: true,
  });
});

test("member can open a delivered reward without exposing it in the collapsed row", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/member/points/", async (route) => {
    const response = await route.fetch();
    const actual = await response.json();
    return route.fulfill({
      json: {
        ...actual,
        redemptions: [
          {
            id: "ui-delivery",
            name: "浏览器发码夹具",
            status: "已发放",
            fulfillment: "UI-FIXTURE-REWARD-CODE",
            deliveryMode: "自动发码",
          },
        ],
      },
    });
  });
  await page.goto("/account/points/");
  await page.getByRole("tab", { name: "兑换好礼", exact: true }).click();
  await expect(page.locator(".points-local-note")).toContainText(
    "任务与积分以账户记录为准",
  );
  const delivery = page.locator(".points-delivery");
  await expect(delivery.locator("summary")).toContainText("已发放");
  await expect(delivery.locator("p")).toBeHidden();
  await delivery.locator("summary").click();
  await expect(delivery.locator("p")).toHaveText("UI-FIXTURE-REWARD-CODE");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="theme"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/features-reward-mobile-dark.png",
    fullPage: true,
  });
});
