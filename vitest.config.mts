import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // e2e/ holds Playwright specs (npm run test:e2e); vitest must not collect them.
    include: ["src/**/*.test.{ts,tsx}"],
    // Under machine load (a build or server running alongside) a test that
    // takes under a second alone can pass the 5 s default; 15 s keeps those
    // green without hiding a real hang.
    testTimeout: 15_000,
    // npm run test:coverage (UX, the coverage report): the source under
    // src/, reported per file. No thresholds yet; the report is for finding
    // gaps on the critical paths, not a gate.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/**/fixtures/**"],
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
