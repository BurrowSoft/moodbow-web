// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The web's only service-role client stays where UX allowed it (#270): the
// Stripe webhook and the crons. Any other file importing it fails here.
const SRC = path.join(process.cwd(), "src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : /\.(ts|tsx|mts)$/.test(d.name) ? [path.join(dir, d.name)] : []));
const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");
const ALLOWED = [/^src\/app\/api\/webhooks\/stripe\/route\.ts$/, /^src\/app\/api\/cron\/[^/]+\/route\.ts$/];
const TEST = /\.test\.(ts|tsx)$/;

describe("the service role on the web", () => {
  // A static import, a dynamic import() or a require(), by alias or relative path.
  const REACHES = /(from\s+|import\s*\(\s*|require\s*\(\s*)["'](@\/lib\/plus|\.{1,2}(\/[^"']*)?)\/serviceRole(\.ts)?["']/;
  const reaches = (text: string) => text.split("\n").some((line) => REACHES.test(line) && !/^\s*import\s+type\s/.test(line));

  it("the guard sees every way in: import, import() and require(); a type-only import is no client", () => {
    expect(reaches('import { readEntitlement } from "@/lib/plus/serviceRole";')).toBe(true);
    expect(reaches('const m = await import("@/lib/plus/serviceRole");')).toBe(true);
    expect(reaches('const m = await import( "../plus/serviceRole" );')).toBe(true);
    expect(reaches('const m = require("./serviceRole");')).toBe(true);
    expect(reaches('import type { EntitlementWrite } from "./serviceRole";')).toBe(false);
    expect(reaches('import { x } from "@/lib/plus/serviceRoleNotes";')).toBe(false);
  });

  it("only the Stripe webhook and the crons import lib/plus/serviceRole", () => {
    const importers = files(SRC)
      .filter((f) => !TEST.test(f) && !f.endsWith(`${path.sep}serviceRole.ts`))
      .filter((f) => reaches(readFileSync(f, "utf8")))
      .map(rel);
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((f) => !ALLOWED.some((a) => a.test(f)))).toEqual([]);
  });

  it("nothing else reads the key, and it's never public", () => {
    const readers = files(SRC)
      .filter((f) => !TEST.test(f))
      .filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"))
      .map(rel);
    expect(readers).toEqual(["src/lib/plus/serviceRole.ts"]);
    const all = files(SRC).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
  });

  it("it reaches only entitlements, stripe_cancel_queue and picture_deletions, never a journal table; the pictures bucket only to remove queued files", () => {
    const text = readFileSync(path.join(SRC, "lib", "plus", "serviceRole.ts"), "utf8");
    const tables = [...text.matchAll(/(?<!storage)\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["entitlements", "stripe_cancel_queue", "picture_deletions"]));
    // Storage (035): the entry-pictures bucket, and only .remove (never a read, a list or a URL).
    const buckets = [...text.matchAll(/storage\.from\("([^"]+)"\)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(buckets).toEqual(["entry-pictures.remove"]);
    expect(text).not.toMatch(/createSignedUrl|getPublicUrl|\.download\(|\.list\(/);
    expect(text).not.toMatch(/\.rpc\(/);
    expect(text).not.toMatch(/export\s+(const|function)\s+db\b/);
  });
});
