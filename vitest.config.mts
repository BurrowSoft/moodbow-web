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
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
