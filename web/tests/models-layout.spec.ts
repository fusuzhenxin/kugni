import { test, expect } from "@playwright/test";

test("language menu supports selection, keyboard and dismissal", async ({
  page,
}) => {
  await page.goto("/en/models/?q=Claude");
  const menu = page.locator("[data-language-menu]");
  const trigger = page.locator("[data-language-toggle]");
  await expect(trigger).toContainText("EN");
  await trigger.click();
  await expect(menu.locator('[aria-current="true"]')).toHaveText("ENEnglish");
  await expect(menu.locator("[data-language-switch]")).toHaveAttribute(
    "href",
    "/models/?q=Claude",
  );
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  await expect(trigger).toBeFocused();
  await trigger.press("ArrowDown");
  await expect(menu.locator("[data-language-option]").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator("[data-language-option]").last()).toBeFocused();
  await page.locator("h1").click();
  await expect(menu).not.toHaveAttribute("open");
  await trigger.click();
  await menu.locator("[data-language-switch]").click();
  await expect(page).toHaveURL(/\/models\/\?q=Claude$/);
  await expect(page.locator("[data-language-toggle]")).toContainText("中文");
});

test("model tables keep translated text inside each column at every viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1912, 1440, 390]) {
    await page.setViewportSize({ width, height: 956 });
    for (const theme of ["light", "dark"]) {
      await page.goto("/en/models/");
      await page
        .locator(".public-site")
        .evaluate(
          (node, value) => node.setAttribute("data-theme", value),
          theme,
        );
      const overflow = await page
        .locator(".catalog-table")
        .evaluate((table) => {
          const failures: string[] = [];
          for (const cell of table.querySelectorAll("th,td")) {
            const box = cell.getBoundingClientRect();
            const walker = document.createTreeWalker(
              cell,
              NodeFilter.SHOW_TEXT,
            );
            let node;
            while ((node = walker.nextNode())) {
              if (!node.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) {
                if (
                  rect.width &&
                  (rect.x < box.x - 1 || rect.right > box.right + 1)
                )
                  failures.push(node.textContent.trim());
              }
            }
          }
          return failures;
        });
      expect(overflow, `${width} ${theme}`).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      if (width === 1912) {
        expect(
          await page
            .locator(".catalog-table-scroll")
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
        ).toBe(true);
      }
      await page.locator("[data-language-toggle]").click();
      const box = await page.locator(".language-options").boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `../verification/models-menu-${width}-${theme}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
    }
  }
  expect(errors).toEqual([]);
});

test("language selection also works without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:3001/en/models/");
    await page.locator("[data-language-toggle]").click();
    await page.locator("[data-language-switch]").click();
    await expect(page).toHaveURL(/\/models\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  } finally {
    await context.close();
  }
});
