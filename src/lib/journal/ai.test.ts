// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Where AI shows on the web (M9): the global switch AND the "ai-live"
// condition not hidden; Reflect also needs a current AI consent and AI on.
let gate: "live" | "draft" | "hidden" = "draft";
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
const { aiShown, canReflect, isFocusArea, isTone } = await import("./ai");
const { POLICY_VERSIONS } = await import("@/lib/legalVersions");

const consented = { ai: { version: POLICY_VERSIONS.ai, granted: true } };
const me = (over: object = {}) => ({ ai_available: true, consents: consented, settings: { reminder_on: true, reminder_time: null, ai_enabled: true }, ...over });

beforeEach(() => {
  gate = "draft";
});

describe("aiShown / canReflect", () => {
  it("shown only with the global switch on and ai-live not hidden", () => {
    expect(aiShown(me())).toBe(true);
    expect(aiShown(me({ ai_available: false }))).toBe(false);
    expect(aiShown({})).toBe(false);
    gate = "hidden";
    expect(aiShown(me())).toBe(false);
  });

  it("Reflect also needs the current AI consent and AI on in settings", () => {
    expect(canReflect(me())).toBe(true);
    expect(canReflect(me({ consents: { ai: { version: POLICY_VERSIONS.ai, granted: false } } }))).toBe(false);
    expect(canReflect(me({ consents: { ai: { version: "2025-01-01", granted: true } } }))).toBe(false);
    // The AI go-live (UX, 23 Nov; migration 043): asked again, so a tick at the old version doesn't count.
    expect(POLICY_VERSIONS.ai).toBe("2026-12-01");
    expect(canReflect(me({ consents: { ai: { version: "2026-10-02", granted: true } } }))).toBe(false);
    expect(canReflect(me({ settings: { reminder_on: true, reminder_time: null, ai_enabled: false } }))).toBe(false);
    gate = "hidden";
    expect(canReflect(me())).toBe(false);
  });

  it("the AI consent is granted in one place: Me → AI's action, from its sheet (UX, 23 Nov, the AI go-live)", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) && !/\.test\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []));
    const grants = files("src")
      .filter((f) => /consentItem\(\s*"ai"\s*,\s*true\s*\)/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(process.cwd(), f).split(path.sep).join("/"));
    expect(grants).toEqual(["src/app/[locale]/app/me/actions.ts"]);
  });

  it("only the database's tone and focus values", () => {
    expect(["warm", "direct", "brief"].every(isTone)).toBe(true);
    expect(isTone("shouty")).toBe(false);
    expect(isFocusArea("self_esteem")).toBe(true);
    expect(isFocusArea("money")).toBe(false);
  });
});
