import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Web performance (e2e/perf): opt-in, never in CI. One worker, no retries,
// Chromium only (CDP throttling). See e2e/perf/vitals.spec.ts.
export default defineConfig({
  ...base,
  testDir: "./e2e/perf",
  testIgnore: undefined,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // No traces or screenshots: journal mode types a password at sign-in.
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
