// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The visible keyboard focus (decision 150, WCAG 2.4.7) in globals.css.
const css = readFileSync(join("src", "app", "globals.css"), "utf8");
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? null : css.slice(start + selector.length + 2, css.indexOf("}", start)).trim();
};

describe("focus ring", () => {
  it("everywhere: the accent ring on :focus-visible (not on tabindex=-1 targets)", () => {
    expect(rule(':focus-visible:not([tabindex="-1"])')).toBe("outline: 2px solid var(--accent);\n  outline-offset: 3px;");
  });

  // The editor's date field: its calendar button is the browser's own part
  // inside the input, so the input isn't :focus-visible while it has focus
  // (Web Tester). The field keeps the same ring while focus is inside it.
  it("a date field keeps the same ring while focus is anywhere inside it (its calendar button too)", () => {
    expect(rule('input[type="date"]:focus-within')).toBe(rule(':focus-visible:not([tabindex="-1"])'));
  });
});
