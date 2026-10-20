// @vitest-environment node
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import en from "./en.json";
import th from "./th.json";
import drafts from "./th-draft.json";

// The Thai scaffold (1.1 F prep, scripts/th-scaffold.mjs): not offered yet
// (a native read first, thai_reviewed), but kept in step with en.json so it
// can't drift while English changes.
const flatten = (obj: unknown, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = String(v);
  }
  return out;
};
// A message's ICU arguments, from the parsed message (branch text isn't one), with
// their kind: Thai has no plural forms, so a plural and a plain {n} match, but a
// select must stay a select (a plain {range} would show the raw English value).
type Node = { type: number; value?: string; options?: Record<string, { value: Node[] }>; children?: Node[] };
const args = (msg: string) => {
  const names = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type !== 0 && n.type !== 7 && n.value) names.add(`${n.value}:${n.type === 5 ? "select" : "value"}`);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
      if (n.children) walk(n.children);
    }
  };
  walk(new IntlMessageFormat(msg, "en", undefined, { ignoreTag: true }).getAst() as Node[]);
  return [...names].sort();
};
const E = flatten(en);
const T = flatten(th);
const draftKeys = new Set((drafts as { key: string }[]).map((d) => d.key));

describe("th.json", () => {
  it("has exactly en.json's keys", () => {
    expect(Object.keys(T).sort()).toEqual(Object.keys(E).sort());
  });

  it("every Thai string uses the same placeholders as English", () => {
    for (const key of Object.keys(E)) expect(args(T[key]), key).toEqual(args(E[key]));
  });

  it("th-draft lists the strings without a reviewed Thai: each a real key; anything not a UX draft is still English", () => {
    // A UX draft may equal the English on purpose (the brand name "Moodbow").
    for (const d of drafts as { key: string; reason: string }[]) {
      expect(E[d.key], d.key).toBeDefined();
      if (!d.reason.startsWith("UX draft")) expect(T[d.key], d.key).toBe(E[d.key]);
    }
  });

  it("every string has its Thai: r1's or a UX draft (none left in English)", () => {
    expect((drafts as { reason: string }[]).filter((d) => !d.reason.startsWith("UX draft"))).toEqual([]);
  });

  it("isn't offered yet: English only until a native speaker has read it", () => {
    expect(routing.locales).toEqual(["en"]);
  });
});
