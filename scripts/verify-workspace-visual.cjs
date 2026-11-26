const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../web/node_modules/playwright");
const project = path.resolve(__dirname, "..");
const password = fs
  .readFileSync(path.join(project, "api/.env"), "utf8")
  .match(/^BOOTSTRAP_PASSWORD=(.+)$/m)[1]
  .trim();

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      baseURL: "http://127.0.0.1:3001",
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3001/admin/login/");
    await page.getByLabel("登录邮箱").fill("admin@kugni.com");
    await page.getByLabel("登录密码").fill(password);
    await page.getByRole("button", { name: "进入工作台" }).click();
    await page.waitForURL("**/admin/dashboard/");
    await page.locator(".admin-heading h1").waitFor();
    const ctx = await (await page.request.get("/api/v1/admin/context/")).json();
    const results = [];
    async function shot(name) {
      await page.screenshot({
        path: path.join(project, "verification", `workspace-${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (overflow) throw new Error(`${name}: viewport overflow`);
      results.push(name);
    }
    for (const key of [
      "stations",
      "categories",
      "users",
      "roles",
      "plans",
      "test-keys",
    ]) {
      const module = ctx.modules.find((m) => m.key === key);
      if (!module) throw new Error(`Missing module: ${key}`);
      await page.goto("http://127.0.0.1:3001" + module.path);
      await page.locator(".admin-heading h1").waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector(".admin-main .loading") &&
          !document
            .querySelector(".admin-main .empty h3")
            ?.textContent?.includes("正在读取"),
      );
      await shot(key + "-list");
      if (module.actions.includes("create")) {
        await page
          .locator(".admin-heading-actions .button")
          .filter({ hasText: "新增" })
          .click();
        await page.locator("dialog[open]").waitFor();
        await shot(key + "-create");
        const checkbox = page
          .locator("dialog[open] input[type=checkbox]")
          .first();
        if (await checkbox.count()) {
          const box = await checkbox.boundingBox();
          if (box.width > 20 || box.height > 20)
            throw new Error(`${key}: checkbox dimensions`);
        }
        if (key === "plans") {
          await page.locator("#field-station").click();
          await page
            .locator(".workspace-select-menu:popover-open [role=option]")
            .nth(1)
            .click();
          await page.getByRole("button", { name: "添加 Key 分组" }).click();
          await page.getByRole("button", { name: "添加 Key 分组" }).click();
          await shot("plans-key-groups");
          await page.setViewportSize({ width: 390, height: 844 });
          await shot("plans-key-groups-mobile");
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
        await page
          .locator("dialog[open]")
          .getByRole("button", { name: "取消", exact: true })
          .click();
        if (key === "plans")
          await page
            .getByRole("button", { name: "放弃修改", exact: true })
            .click();
      }
      const row = page.locator(".admin-table tbody tr").first();
      if (await row.count()) {
        for (const [action, name] of [
          ["详情", "detail"],
          ["编辑", "edit"],
          ["删除", "delete"],
        ]) {
          const button = row.getByRole("button", { name: action, exact: true });
          if (!(await button.count())) continue;
          await button.click();
          await page.locator("dialog[open]").waitFor();
          await shot(key + "-" + name);
          if (key === "stations" && name === "edit") {
            await page.setViewportSize({ width: 390, height: 844 });
            await shot("stations-edit-mobile");
            await page.setViewportSize({ width: 1440, height: 1000 });
          }
          await page
            .locator("dialog[open]")
            .getByRole("button", {
              name: action === "详情" ? "关闭" : "取消",
              exact: true,
            })
            .click();
        }
        if (module.bulkActions.includes("edit")) {
          await row.getByRole("checkbox").check();
          await page
            .getByRole("button", { name: "批量编辑", exact: true })
            .click();
          await page.locator("dialog[open]").waitFor();
          await shot(key + "-bulk-edit");
          await page
            .locator("dialog[open]")
            .getByRole("button", { name: "取消", exact: true })
            .click();
        }
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      JSON.stringify({ screenshots: results, runtimeErrors: errors }, null, 2),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
