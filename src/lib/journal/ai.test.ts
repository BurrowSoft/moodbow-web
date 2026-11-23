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

  it("the AI consent is granted in one place, its writer, and only Me → AI's sheet and Bo's yes call it (UX, 23 Nov, the AI go-live; the Reviewer)", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(ts|tsx)$/.test(d.name) && !/\.test\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []));
    const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");
    const all = files("src");
    expect(all.filter((f) => /consentItem\(\s*"ai"\s*,\s*true\s*\)/.test(readFileSync(f, "utf8"))).map(rel)).toEqual(["src/lib/journal/aiConsentWrite.ts"]);
    // Its callers, by name (a static import, an import() or a require(); never a "use client" file): Me → AI's
    // action (aiShown read again, the sheet's confirm) and Bo's (bo-live, Bo's own gate).
    const reaches = (text: string) => /(from\s+|import\s*\(\s*|require\s*\(\s*)["'](@\/lib\/journal|\.{1,2}(\/[^"']*)?)\/aiConsentWrite["']/.test(text);
    const callers = all.filter((f) => !f.endsWith("aiConsentWrite.ts") && reaches(readFileSync(f, "utf8"))).map(rel).sort();
    expect(callers).toEqual(["src/app/[locale]/app/bo/actions.ts", "src/app/[locale]/app/me/actions.ts"]);
    for (const f of callers) expect(readFileSync(f, "utf8").trimStart().startsWith('"use client"'), f).toBe(false);
    // Not a server action itself (no directive line anywhere in it): a browser can't call it.
    expect(readFileSync("src/lib/journal/aiConsentWrite.ts", "utf8")).not.toMatch(/^\s*["']use (server|client)["'];?\s*$/m);
  });

  it("only the database's tone and focus values", () => {
    expect(["warm", "direct", "brief"].every(isTone)).toBe(true);
    expect(isTone("shouty")).toBe(false);
    expect(isFocusArea("self_esteem")).toBe(true);
    expect(isFocusArea("money")).toBe(false);
  });
});
