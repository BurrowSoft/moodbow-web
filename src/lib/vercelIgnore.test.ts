// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decide } from "../../scripts/vercel-ignore.mjs";

// Which pushes build a Vercel deployment (scripts/vercel-ignore.mjs, vercel.json's ignoreCommand; UX, 20 Nov: Build
// CPU was most of November's bill). Exit 1 builds, exit 0 skips; this checks the decision behind the exit code.
const preview = (files: string[] | null, ref = "fix/something") => decide({ env: "preview", ref, files });

describe("vercel-ignore", () => {
  it("is vercel.json's ignoreCommand", () => {
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).ignoreCommand).toBe("node scripts/vercel-ignore.mjs");
  });

  it("always builds Production, master, preview/* and test/plus-walk, whatever changed", () => {
    expect(decide({ env: "production", ref: "master", files: ["e2e/smoke.spec.ts"] }).build).toBe(true);
    for (const ref of ["master", "preview/abc123", "test/plus-walk"]) expect(preview(["docs/a.md"], ref).build, ref).toBe(true);
  });

  it("builds a Preview when something that ships changed", () => {
    for (const file of [
      "src/app/[locale]/page.tsx",
      "src/messages/de.json",
      "content/legal/en/privacy.md",
      "content/help/fr/tags.md",
      "public/badges/google-play-en.png",
      "assets/fonts/Poppins-Medium.ttf",
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "postcss.config.mjs",
      "tsconfig.json",
      "vercel.json",
    ]) expect(preview([file]).build, file).toBe(true);
  });

  it("skips a Preview when only tests, docs or tooling changed", () => {
    for (const files of [
      ["e2e/smoke.spec.ts"],
      ["src/lib/conditions.test.ts", "src/app/[locale]/app/me/me.test.ts"],
      ["docs/plus-entitlements.md", "README.md"],
      [".github/workflows/ci.yml"],
      ["scripts/sync-contracts.mjs", "playwright.config.ts", "vitest.config.mts"],
    ]) expect(preview(files).build, files.join(", ")).toBe(false);
  });

  it("builds a mixed push, and builds whenever it can't tell", () => {
    expect(preview(["e2e/smoke.spec.ts", "src/app/globals.css"]).build).toBe(true);
    expect(preview(null).build).toBe(true);
    expect(preview([]).build).toBe(true);
  });

  it("says why in one line", () => {
    expect(preview(["e2e/smoke.spec.ts"]).why).toBe("only tests, docs or tooling changed (1 file(s), e.g. e2e/smoke.spec.ts)");
    expect(preview(["src/app/globals.css"]).why).toBe("1 shipping file(s) changed, e.g. src/app/globals.css");
  });
});
