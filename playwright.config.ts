import { defineConfig, devices } from "@playwright/test";

// Local / CI: runs against `npm run start` (run `npm run build` first).
// A Vercel Preview: E2E_BASE_URL=https://<preview-url> npm run test:e2e, with
// VERCEL_AUTOMATION_BYPASS_SECRET set in the shell when Deployment
// Protection is on (the value is the owner's; never commit it).
const PORT = process.env.PORT ?? "3000";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], locale: "en-US" } },
    { name: "mobile", use: { ...devices["Pixel 7"], locale: "en-US" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
