import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { routing } from "@/i18n/routing";
import en from "./en.json";

// One entry per shipped locale (English only for the beta; the localization
// PR adds th, es, pt-BR, fr, de here and in routing.locales).
const FILES: Record<string, unknown> = { en };

// "a.b.c" → string, for every leaf.
function flatten(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

// ICU arguments and tags used by a message, e.g. {days}, <support>.
function placeholders(msg: string): string[] {
  const args = [...msg.matchAll(/\{(\w+)/g)].map((m) => `{${m[1]}}`);
  const tags = [...msg.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...args, ...tags].sort();
}

describe("message files", () => {
  const base = flatten(en);

  it("has a file for every locale", () => {
    expect(Object.keys(FILES).sort()).toEqual([...routing.locales].sort());
  });

  for (const [locale, messages] of Object.entries(FILES)) {
    const flat = flatten(messages);

    it(`${locale}: same keys as en`, () => {
      expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort());
    });

    it(`${locale}: every value is a non-empty string that parses as ICU`, () => {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim(), key).not.toBe("");
        expect(() => new IntlMessageFormat(value as string, locale), key).not.toThrow();
      }
    });

    it(`${locale}: same placeholders as en`, () => {
      for (const [key, value] of Object.entries(flat)) {
        expect(placeholders(value as string), key).toEqual(placeholders(base[key] as string));
      }
    });
  }
});
