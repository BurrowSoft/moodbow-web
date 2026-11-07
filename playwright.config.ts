import { defineConfig, devices } from "@playwright/test";
import { BYPASS_STATE, usesPreviewBypass } from "./e2e/previewBypass";

// Local / CI: runs against `npm run start` (run `npm run build` first).
// A Vercel Preview: E2E_BASE_URL=https://<preview-url> npm run test:e2e, with
// VERCEL_AUTOMATION_BYPASS_SECRET set in the shell when Deployment
// Protection is on (the value is the owner's; never commit it). It's only ever
// used once, for that host's cookie (e2e/previewBypass.ts).
const PORT = process.env.PORT ?? "3000";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const bypass = usesPreviewBypass(BASE_URL, process.env.VERCEL_AUTOMATION_BYPASS_SECRET);

export default defineConfig({
  testDir: "./e2e",
  // The staging journeys and the perf run have their own configs (playwright.journey/perf.config.ts).
  testIgnore: ["**/journey/**", "**/perf/**"],
  globalSetup: bypass ? "./e2e/previewBypass.ts" : undefined,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: bypass ? BYPASS_STATE : undefined,
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
