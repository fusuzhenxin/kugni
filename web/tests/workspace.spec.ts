import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const password =
  process.env.E2E_PASSWORD ||
  readFileSync("../api/.env", "utf8")
    .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)?.[1]
    .trim();

test("workspace entry preserves return path and logout stays in the workspace", async ({
  page,
}) => {
  await page.goto("/admin/stations/");
  await expect(page).toHaveURL(/\/admin\/login\/\?next=/);
  await expect(
    page.getByRole("heading", { name: "平台管理登录", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".public-site")).toHaveCount(0);
  await page.screenshot({
    path: "../verification/workspace-login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("登录邮箱").fill("admin@kugni.com");
  await page.getByLabel("登录密码").fill(password!);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/admin\/stations\/$/);
  await expect(page.locator(".admin-table tbody tr").first()).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login\/$/);
  await expect(page.getByLabel("登录邮箱")).toBeVisible();
});

test("mobile publisher login rejects a platform account without issuing a session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publisher/login/");
  await expect(
    page.getByRole("heading", { name: "站长工作台登录", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../verification/workspace-login-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("登录邮箱").fill("admin@kugni.com");
  await page.getByLabel("登录密码").fill(password!);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.locator(".workspace-form .error-message")).toContainText(
    "无权登录该工作台",
  );
  expect(
    (await (await page.request.get("/api/v1/auth/session/")).json()).user,
  ).toBeNull();
  await page.getByLabel("登录邮箱").fill("local-publisher@kugni.com");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/publisher\/dashboard\/$/);
  await page.getByRole("button", { name: "展开后台菜单" }).click();
  await expect(
    page.getByRole("navigation", { name: "后台导航" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭侧栏" }).click();
});

test("workspace login refuses external or cross-workspace return paths", async ({
  page,
}) => {
  await page.goto("/admin/login/?next=" + encodeURIComponent("//example.com/"));
  await page.getByLabel("登录邮箱").fill("admin@kugni.com");
  await page.getByLabel("登录密码").fill(password!);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard\/$/);
  await page.goto("/admin/login/?next=/publisher/dashboard/");
  await expect(page).toHaveURL(/\/admin\/dashboard\/$/);
  await page.goto("/publisher/login/");
  await expect(
    page.getByRole("heading", { name: "请切换对应账户" }),
  ).toBeVisible();
});
