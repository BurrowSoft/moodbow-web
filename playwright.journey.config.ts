import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The launch journeys (e2e/journey), against a build pointed at staging:
//   npm run build (with NEXT_PUBLIC_SUPABASE_* = staging) && npm run test:journeys
// Desktop only, to keep them under ~3 min; no retries, so a flaky step shows.
export default defineConfig({
  ...base,
  testDir: "./e2e/journey",
  testIgnore: undefined,
  retries: 0,
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], locale: "en-US" } }],
  // The server needs only the public staging values; the admin key stays in
  // the test process (webServer.env merges over process.env).
  webServer: base.webServer && !Array.isArray(base.webServer) ? { ...base.webServer, env: { SUPABASE_STAGING_SECRET_KEY: "" } } : base.webServer,
});
