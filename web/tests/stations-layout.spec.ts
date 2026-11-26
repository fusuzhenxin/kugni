import { test, expect } from "@playwright/test";

for (const path of [
  "/en/",
  "/en/stations/",
  "/en/stations/categories/enterprise/",
  "/en/models/openai/",
  "/",
  "/stations/",
]) {
  test(`provider columns contain their text on ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1912, 1440, 390]) {
      await page.setViewportSize({ width, height: 956 });
      await page.goto(path);
      const ledger = page.locator(".service-ledger").first();
      await expect(ledger.locator("tbody tr").first()).toBeVisible();
      for (const theme of ["light", "dark"]) {
        await page
          .locator(".public-site")
          .evaluate(
            (node, value) => node.setAttribute("data-theme", value),
            theme,
          );
        const overflow = await ledger.evaluate((table) => {
          const failures: string[] = [];
          for (const cell of table.querySelectorAll("th,td")) {
            // Descriptions intentionally clamp to three lines. Other columns
            // must show their complete content without crossing cell edges.
            if (cell.classList.contains("ledger-description-cell")) continue;
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
                  (rect.left < box.left - 1 || rect.right > box.right + 1)
                )
                  failures.push(node.textContent.trim());
              }
            }
          }
          for (const row of table.querySelectorAll("tbody tr")) {
            const status = row
              .querySelector(".testing-status")!
              .getBoundingClientRect();
            const stability = row
              .querySelector(".ledger-stability")!
              .getBoundingClientRect();
            if (status.right > stability.left)
              failures.push("status overlaps stability");
          }
          return failures;
        });
        expect(overflow, `${path} ${width} ${theme}`).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width + 1);
        if (width === 1912) {
          expect(
            await ledger.evaluate(
              (node) => node.scrollWidth <= node.clientWidth + 1,
            ),
          ).toBe(true);
        }
        if (path === "/en/stations/") {
          await ledger.evaluate((node) => {
            window.scrollTo(
              0,
              window.scrollY + node.getBoundingClientRect().top - 110,
            );
          });
          // Mobile captures the actual problem columns, rather than only the
          // provider names at the left edge of the scrollable table.
          await ledger.evaluate((node) => {
            node.scrollLeft =
              node.clientWidth < 760
                ? (node.querySelector(".testing-cell") as HTMLElement)
                    .offsetLeft - 12
                : 0;
          });
          await page.screenshot({
            path: `../verification/provider-columns-${width}-${theme}.png`,
            animations: "disabled",
          });
        }
      }
    }
    expect(errors).toEqual([]);
  });
}
