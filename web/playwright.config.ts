import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.E2E_URL || "http://127.0.0.1:3001",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "../verification/playwright-report", open: "never" },
    ],
  ],
});
