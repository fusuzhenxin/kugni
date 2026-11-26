import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AdminContext } from "../src/lib/types";

const password =
  process.env.E2E_PASSWORD ||
  readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)![1]
    .trim();

async function login(page: Page, path: string, publisher = false) {
  await page.goto(
    `${publisher ? "/publisher" : "/admin"}/login/?next=${encodeURIComponent(path)}`,
  );
  await page
    .getByLabel("登录邮箱", { exact: true })
    .fill(publisher ? "local-publisher@kugni.com" : "admin@kugni.com");
  await page.getByLabel("登录密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page).toHaveURL(path);
  await expect(page.locator(".admin-heading h1")).toBeVisible();
}

async function expectCurrentVisible(page: Page, path: string) {
  const nav = page.getByRole("navigation", { name: "后台导航", exact: true });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("href", path);
  await expect(current).toBeVisible();
  await expect
    .poll(() =>
      current.evaluate((link) => {
        const bounds = link.getBoundingClientRect(),
          viewport = link.closest("nav")!.getBoundingClientRect();
        return (
          bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1
        );
      }),
    )
    .toBe(true);
}

test("workspace groups collapse, persist, search and reveal the selected deep menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 620 });
  const path = "/admin/analytics/funnels/";
  await login(page, path);
  const nav = page.getByRole("navigation", { name: "后台导航", exact: true });
  await expectCurrentVisible(page, path);
  await expect(
    nav.locator('.admin-nav-panel[aria-hidden="false"]'),
  ).toHaveCount(1);
  const group = nav.getByRole("button", { name: "流量统计", exact: true });
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(nav.locator('[aria-current="page"]')).toBeHidden();
  await group.focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[aria-hidden="true"]')),
    ),
  ).toBe(false);
  await group.focus();
  await page.keyboard.press("Enter");
  await expectCurrentVisible(page, path);

  const context: AdminContext = await (
    await page.request.get("/api/v1/admin/context/")
  ).json();
  const extraGroup = context.modules.find((m) => m.key === "stations")!.group;
  await nav.getByRole("button", { name: extraGroup, exact: true }).click();
  await page.reload();
  await expectCurrentVisible(page, path);
  await expect(
    nav.getByRole("button", { name: extraGroup, exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    nav.getByRole("button", { name: "数据采集", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  const search = page.getByRole("textbox", {
    name: "搜索后台菜单",
    exact: true,
  });
  await search.fill("采集登录账号");
  await expect(nav.getByRole("link")).toHaveCount(1);
  await nav.getByRole("link", { name: "采集登录账号", exact: true }).click();
  await expect(page).toHaveURL("/admin/collection/accounts/");
  await search.fill("");
  await expectCurrentVisible(page, "/admin/collection/accounts/");
  await page.goBack();
  await expectCurrentVisible(page, path);
  await page.goForward();
  await expectCurrentVisible(page, "/admin/collection/accounts/");

  // Reproduce a long, fully expanded menu in a short viewport.
  const collapsedNames = await nav
    .getByRole("button", { expanded: false })
    .allTextContents();
  for (const name of collapsedNames)
    await nav.getByRole("button", { name, exact: true }).click();
  const last = context.modules.at(-1)!;
  await page.goto(last.path);
  await expectCurrentVisible(page, last.path);
  expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const selector of [".admin-brand", ".admin-sidebar-bottom"]) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(621);
  }
  await page.screenshot({
    path: "../verification/sidebar-desktop-selected.png",
    animations: "disabled",
  });
  await page.reload();
  await expectCurrentVisible(page, last.path);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开后台菜单", exact: true }).click();
  await expectCurrentVisible(page, last.path);
  await page.screenshot({
    path: "../verification/sidebar-admin-mobile.png",
    animations: "disabled",
  });
});

test("publisher uses the same folding menu and closes its mobile drawer after navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, "/publisher/dashboard/", true);
  await page.getByRole("button", { name: "展开后台菜单", exact: true }).click();
  await expectCurrentVisible(page, "/publisher/dashboard/");
  const context: AdminContext = await (
    await page.request.get("/api/v1/admin/context/")
  ).json();
  expect(context.modules.every((m) => m.surface === "publisher")).toBe(true);
  const target = context.modules.at(-1)!;
  const nav = page.getByRole("navigation", { name: "后台导航", exact: true });
  const group = nav.getByRole("button", { name: target.group, exact: true });
  if ((await group.getAttribute("aria-expanded")) !== "true")
    await group.click();
  await nav.getByRole("link", { name: target.title, exact: true }).click();
  await expect(page).toHaveURL(target.path);
  await expect(page.locator(".admin-backdrop")).toHaveCount(0);
  await page.getByRole("button", { name: "展开后台菜单", exact: true }).click();
  await expectCurrentVisible(page, target.path);
  await page.screenshot({
    path: "../verification/sidebar-publisher-mobile.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "关闭侧栏", exact: true }).click({
    position: { x: 375, y: 100 },
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
