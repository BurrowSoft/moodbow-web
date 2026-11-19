// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The e2e specs find elements by test id, role or label, never by the page's
// structure (UX, after #350: a lifebuoy wrapper added first in <main> broke a
// "main > div" lookup). A position or child selector breaks silently when a
// layout changes; this keeps new ones out.
const E2E = join(__dirname, "..", "..", "e2e");
function specs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? specs(path) : /\.ts$/.test(name) ? [path] : [];
  });
}

const STRUCTURE = [/:(first|last|nth)-(child|of-type)/, /:nth-last-/, /\bmain\s*>\s*\w/, /\b(div|span|li|ul|p)\s*>\s*(div|span|li|ul|p)\b/, /\bbutton\s*>\s*span\b/];

describe("e2e selectors", () => {
  it("no structure selectors in the specs", () => {
    const found = specs(E2E).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => ({ where: `${relative(E2E, path).split("\\").join("/")}:${i + 1}`, line }))
        .filter(({ line }) => STRUCTURE.some((re) => re.test(line))),
    );
    expect(found).toEqual([]);
  });
});
