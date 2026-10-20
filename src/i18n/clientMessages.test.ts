// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { pickMessages, PUBLIC_CLIENT_NAMESPACES } from "./clientMessages";

// The guard for perf fix 3: outside the journal only PUBLIC_CLIENT_NAMESPACES
// reach the browser, so every client component that can render there must
// use only those (a missing one would show raw keys in production).
const SRC = join(process.cwd(), "src");
const JOURNAL = join(SRC, "app", "[locale]", "app") + sep;
// Shared components used only inside the journal (which gets every message).
const JOURNAL_ONLY_COMPONENTS = ["SafetyCard"];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
const all = files(SRC);
const isClient = (src: string) => /^\s*["']use client["']/.test(src);

describe("the messages sent outside the journal", () => {
  it("cover every namespace a client component outside /app uses", () => {
    const missing: string[] = [];
    for (const f of all) {
      if (f.startsWith(JOURNAL)) continue;
      if (JOURNAL_ONLY_COMPONENTS.some((c) => f.endsWith(`${sep}${c}.tsx`))) continue;
      const src = readFileSync(f, "utf8");
      if (!isClient(src)) continue;
      // A namespace-less useTranslations() needs every message: not allowed here.
      if (/useTranslations\(\s*\)/.test(src)) missing.push(`${relative(SRC, f)}: useTranslations() without a namespace`);
      for (const [, ns] of src.matchAll(/useTranslations\(\s*["']([A-Za-z]+)["']/g)) {
        if (!(PUBLIC_CLIENT_NAMESPACES as readonly string[]).includes(ns)) missing.push(`${relative(SRC, f)}: ${ns}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the journal-only shared components are imported only from inside /app", () => {
    for (const c of JOURNAL_ONLY_COMPONENTS) {
      const importers = all.filter((f) => !f.endsWith(`${sep}${c}.tsx`) && new RegExp(`from ["']@/components/${c}["']`).test(readFileSync(f, "utf8")));
      expect(importers.length, c).toBeGreaterThan(0);
      expect(importers.filter((f) => !f.startsWith(JOURNAL)).map((f) => relative(SRC, f)), c).toEqual([]);
    }
  });

  it("every listed namespace exists; pickMessages keeps only those", () => {
    for (const ns of PUBLIC_CLIENT_NAMESPACES) expect(messages, ns).toHaveProperty(ns);
    const picked = pickMessages(messages, PUBLIC_CLIENT_NAMESPACES);
    expect(Object.keys(picked).sort()).toEqual([...PUBLIC_CLIENT_NAMESPACES].sort());
    expect(JSON.stringify(picked).length).toBeLessThan(JSON.stringify(messages).length / 2);
  });
});
