import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPresentation } from "../src/presentation/render.mjs";

const password = readFileSync("../api/.env", "utf8")
  .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)![1]
  .trim();

test("station collection configuration supports create edit detail and delete", async ({
  page,
}) => {
  await page.goto("/admin/login/");
  await page.getByLabel("登录邮箱", { exact: true }).fill("admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\//);
  const csrf = (await (await page.request.get("/api/v1/auth/session/")).json())
    .csrf;
  const station = (
    await (await page.request.get("/api/v1/admin/records/stations/")).json()
  ).items[0];
  const base = "/api/v1/admin/records/station-sync-tasks/";
  const name = "UI 公告渠道配置 " + Date.now();
  let id = "";
  try {
    await page.goto("/admin/collection/stations/");
    await page
      .getByRole("button", { name: "新增站点公告与渠道采集", exact: true })
      .click();
    await page.locator("#field-name").fill(name);
    await page.locator("#field-station").click();
    await page.getByRole("option", { name: station.name, exact: true }).click();
    await page.locator("#field-sourceBaseUrl").fill("https://example.com");
    await page.getByRole("checkbox", { name: "站点公告", exact: true }).check();
    await page.getByRole("checkbox", { name: "渠道状态", exact: true }).check();
    await page.locator("#field-interval").fill("30");
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toContainText("仅手动");
    id = (
      await (
        await page.request.get(base + "?q=" + encodeURIComponent(name))
      ).json()
    ).items[0].id;
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator("#field-interval").fill("60");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect
      .poll(() =>
        page
          .locator("dialog[open]")
          .evaluate((node) => getComputedStyle(node).opacity),
      )
      .toBe("1");
    await page.locator(".admin-dialog-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({
      path: "../verification/station-source-editor-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "保存并更新", exact: true }).click();
    await expect(page.locator("dialog")).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
    await row.getByRole("button", { name: "详情", exact: true }).click();
    await expect(page.locator("dialog")).toContainText("60");
    await expect(page.locator("dialog")).toContainText("先保存草稿");
    await page
      .locator("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.screenshot({
      path: "../verification/station-source-configs.png",
      fullPage: true,
    });
    await row.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "确认操作", exact: true }).click();
    await expect(row).toHaveCount(0);
    id = "";
    await page.goto("/admin/collection/station-runs/");
    await expect(
      page.getByRole("heading", { name: "站点采集记录", exact: true }),
    ).toBeVisible();
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

test("channel and notice presentation is compact safe translated and mobile scrolls inside table", async ({
  page,
}) => {
  // Presentation fixture only: it never inserts a fabricated live channel status.
  const catalog = await (
    await page.request.get("/api/v1/public/catalog/")
  ).json();
  const listing = await (
    await page.request.get("/api/v1/public/stations/")
  ).json();
  const station = await (
    await page.request.get(
      "/api/v1/public/stations/" + listing.items[0].slug + "/",
    )
  ).json();
  const instant = new Date().toISOString();
  station.sourcePricing = { headers: [], rows: [] };
  station.channelSnapshot = {
    sourceType: "Uptime Kuma",
    sourceUrl: "https://example.com/status/api",
    collectedAt: instant,
    stale: false,
    channels: [
      {
        name: "GPT API",
        group: "OpenAI",
        status: "正常",
        uptime24h: 99.98,
        heartbeatAt: instant,
        platform: "openai",
        history: [
          {
            at: new Date(Date.now() - 3 * 3600000).toISOString(),
            status: "异常",
          },
          { at: new Date(Date.now() - 3600000).toISOString(), status: "正常" },
        ],
      },
      {
        name: "Claude API",
        group: "Anthropic",
        status: "未核验",
        uptime24h: null,
        heartbeatAt: "",
        note: "心跳缺失或超过 15 分钟",
      },
    ],
  };
  station.notices = Array.from({ length: 7 }, (_, i) => ({
    name: "Fixture notice " + i,
    body: "<script>window.sourceInjected=true</script> Maintenance details.",
    sourceUrl: i ? "javascript:alert(1)" : "https://example.com/api/notice",
    sourcePublishedAt: "2026-11-01",
    collectedAt: instant,
  }));
  await page.goto("/stations/" + station.slug + "/");
  const links = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLLinkElement).outerHTML).join(""),
    );
  for (const locale of ["zh-CN", "en"]) {
    const view = createPresentation({
      path: "/stations/" + station.slug,
      query: "",
      locale,
      catalog,
      stations: [station],
      pricing: { items: [], source: [] },
      reports: [],
      plans: [],
      content: {},
    });
    expect(view.main).toContain("&lt;script&gt;");
    expect(view.main).not.toContain("javascript:alert");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.setContent(
        `<!doctype html><html><head>${links}</head><body><div class="public-site" data-theme="${width === 390 ? "dark" : "light"}">${view.main}</div></body></html>`,
      );
      const channels = page.locator("#source-model-browser");
      await expect(page.locator(".station-channels")).toHaveCount(0);
      await expect(channels.locator("table")).toBeVisible();
      await expect(channels).toContainText(
        locale === "en" ? "Channel status" : "渠道状态",
      );
      await expect(channels).toContainText("99.98%");
      await expect(channels.locator(".channel-segment.good")).toHaveCount(1);
      await expect(channels.locator(".channel-segment.bad")).toHaveCount(1);
      await expect(channels.locator(".channel-segment.unknown")).toHaveCount(
        46,
      );
      await expect(
        channels.locator('a[href="https://example.com/status/api"]'),
      ).toHaveCount(1);
      const notice = page.locator(".station-source-notice").first();
      await expect(notice).toHaveAttribute("open", "");
      await expect(notice.locator("p")).toContainText("<script>");
      expect(await page.evaluate(() => "sourceInjected" in window)).toBe(false);
      await expect(page.locator(".station-source-notice").nth(5)).toBeHidden();
      await page.locator(".station-more-notices > summary").click();
      await expect(page.locator(".station-source-notice").nth(5)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await channels.evaluate((node) =>
        node.scrollIntoView({ block: "center" }),
      );
      await channels.screenshot({
        path: `../verification/station-channels-fixture-${locale}-${width}.png`,
        animations: "disabled",
      });
    }
  }
});

test("live station switches group model and history views and exposes published notices in SSR", async ({
  page,
}) => {
  const response = await page.request.get("/stations/wawa-zz/");
  const html = await response.text();
  expect(html).toContain("站点公告");
  expect(html).toContain("station-source-notice");
  expect(html).toContain("channel-segments");
  await page.goto("/stations/wawa-zz/");
  const browser = page.locator("#source-model-browser");
  await expect(
    browser.getByRole("button", { name: "按分组", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await browser.getByRole("button", { name: "7天", exact: true }).click();
  await expect(browser.locator('.channel-trend[data-range="7d"]')).toHaveCount(
    5,
  );
  const group = browser.locator(".model-group-link").first();
  const groupName = (await group.textContent())!.replace("›", "").trim();
  await group.click();
  await expect(
    browser.getByRole("button", { name: "按模型", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(browser.locator(".source-model-name small").first()).toHaveText(
    groupName,
  );
  await expect(browser.locator('.channel-trend[data-range="7d"]')).toHaveCount(
    1,
  );
  await browser.getByRole("button", { name: "30天", exact: true }).click();
  await expect(browser.locator('.channel-trend[data-range="30d"]')).toHaveCount(
    1,
  );
  await browser.getByRole("button", { name: "按分组", exact: true }).click();
  await expect(browser.locator("tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "站点公告", exact: true }).click();
  await expect(page.locator("#updates-heading")).toBeInViewport();
  await expect(
    page.locator(".station-source-notice[open]").first(),
  ).toBeVisible();
});

test("new public sources publish real notices and expose exact RightCode models", async ({
  page,
}) => {
  for (const [slug, count] of [
    ["rightcode", 14],
    ["xisu-ai", 3],
    ["aihubmix", 12],
    ["packycode", 135],
    ["0elog", 3],
    ["302-ai", 1],
  ] as const) {
    const response = await page.request.get(
      "/api/v1/public/stations/" + slug + "/",
    );
    expect(response.ok()).toBe(true);
    const station = await response.json();
    expect(station.notices.length).toBeGreaterThanOrEqual(count);
    const html = await (
      await page.request.get("/stations/" + slug + "/")
    ).text();
    expect(html).toContain("station-source-notice");
    expect(html).toContain("https://www.kugni.com/stations/" + slug + "/");
  }
  await page.goto("/stations/rightcode/");
  const browser = page.locator("#source-model-browser");
  await browser.locator(".model-group-link").first().click();
  await expect(
    browser.locator('b[title="最近时段可用率"]').first(),
  ).toBeVisible();
  await browser.getByRole("button", { name: "7天", exact: true }).click();
  await expect(
    browser.locator('.channel-trend[data-range="7d"]').first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto("/stations/aihubmix/");
  await expect(page.locator(".channel-source-state").first()).toContainText(
    "来源自报",
  );
});

test("missing channels explain coverage and newly discovered monitors retain their scope", async ({
  page,
}) => {
  await page.goto("/stations/7code/");
  await expect(page.locator("#source-model-browser")).toContainText(
    "来源未返回渠道数据",
  );
  for (const slug of ["zetatechs-api", "tuzi-api"]) {
    const response = await page.request.get(
      "/api/v1/public/stations/" + slug + "/",
    );
    expect(response.ok()).toBe(true);
    const station = await response.json();
    expect(station.channelSnapshot.channels.length).toBeGreaterThan(0);
    const html = await (
      await page.request.get("/stations/" + slug + "/")
    ).text();
    expect(html).toContain("channel-segment good");
    if (slug === "tuzi-api") {
      expect(station.channelSnapshot.modelChannels.length).toBeGreaterThan(0);
      await page.goto("/stations/tuzi-api/");
      const browser = page.locator("#source-model-browser");
      await browser.locator(".model-group-link").first().click();
      await expect(
        browser.locator('b[title="来源成功率"]').first(),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    } else {
      expect(station.channelSnapshot.channels).toHaveLength(3);
      expect(
        station.channelSnapshot.channels.every(
          (c: { modelIds?: string[]; heartbeatAt: string }) =>
            !c.modelIds?.length && !c.heartbeatAt,
        ),
      ).toBe(true);
      expect(html).toContain("按日历史");
    }
  }
});

test("AruHub exposes ordered calls with exact models and only available windows", async ({
  page,
}) => {
  const station = await (
    await page.request.get("/api/v1/public/stations/aruhub/")
  ).json();
  const snapshot = station.channelSnapshot;
  expect(snapshot.sourceType).toBe("AruHub 渠道状态");
  expect(snapshot.sourceUrl).toBe("https://aruhub.com/channel-status");
  expect(snapshot.historyKind).toBe("ordered-calls");
  expect(snapshot.channels.length).toBeGreaterThan(0);
  expect(snapshot.modelChannels.length).toBeGreaterThan(0);
  for (const channel of [...snapshot.channels, ...snapshot.modelChannels]) {
    expect(channel.heartbeatAt).toBe("");
    for (const window of Object.values(channel.windows) as {
      recentCalls: { modelId: string; success: boolean; at?: string }[];
      history?: unknown;
    }[]) {
      expect(window.history).toBeUndefined();
      for (const call of window.recentCalls) {
        expect(call.at).toBeUndefined();
        expect(typeof call.success).toBe("boolean");
        if (channel.modelIds.length)
          expect(channel.modelIds).toContain(call.modelId);
      }
    }
  }
  const html = await (await page.request.get("/stations/aruhub/")).text();
  expect(html).toContain('data-axis="calls"');
  expect(html).toContain("近期调用（非时间轴）");
  expect(html).toContain("https://www.kugni.com/stations/aruhub/");
  await page.goto("/stations/aruhub/");
  const browser = page.locator("#source-model-browser");
  const activeRange = snapshot.supportedRanges.includes("24h")
    ? "24h"
    : snapshot.supportedRanges[0];
  await expect(
    browser.locator(
      `[data-action="detail-model-range"][data-value="${activeRange}"]`,
    ),
  ).toHaveAttribute("aria-pressed", "true");
  const first = browser.locator("tbody tr").first();
  await expect(first.locator('[data-axis="calls"]')).toBeVisible();
  const groupName = (await first.locator(".model-group-link").textContent())!
    .replace("›", "")
    .trim();
  expect(
    snapshot.channels.some((c: { name: string }) => c.name === groupName),
  ).toBe(true);
  for (const range of ["90m", "24h", "7d", "30d"]) {
    await expect(
      browser.locator(
        `[data-action="detail-model-range"][data-value="${range}"]`,
      ),
    ).toHaveCount(snapshot.supportedRanges.includes(range) ? 1 : 0);
  }
  await browser.locator(".model-group-link").first().click();
  await expect(browser.locator(".source-model-name small").first()).toHaveText(
    groupName,
  );
  await expect(
    browser.locator('b[title="近期样本成功率"]').first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    (document.querySelector(".public-site") as HTMLElement).dataset.theme =
      "dark";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await browser.locator(".source-model-table").evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(browser.locator('[data-axis="calls"]').first()).toBeVisible();
});
