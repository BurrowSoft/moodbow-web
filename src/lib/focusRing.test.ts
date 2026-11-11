// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
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

  // A date or time field: its picker button is the browser's own part inside
  // the input, so the input isn't :focus-visible while it has focus (Web
  // Tester: the editor's date; Set up's and Me's reminder time, 12 Nov). The
  // field keeps the same ring while focus is inside it.
  const PICKERS = 'input:is([type="date"], [type="time"], [type="datetime-local"], [type="month"], [type="week"]):focus-within';
  it("a date or time field keeps the same ring while focus is anywhere inside it (its picker button too)", () => {
    expect(rule(PICKERS)).toBe(rule(':focus-visible:not([tabindex="-1"])'));
  });
  it("every input type with a picker button is in that rule, and each field this app has is one", () => {
    for (const type of ["date", "time", "datetime-local", "month", "week"]) expect(PICKERS).toContain(`[type="${type}"]`);
    const used = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        if (name.isDirectory()) walk(path);
        else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) for (const m of readFileSync(path, "utf8").matchAll(/type="(date|time|datetime-local|month|week)"/g)) used.add(m[1]);
      }
    };
    walk("src");
    // The editor's date and the reminders' time today; a new one is covered or this fails.
    expect([...used]).toEqual(expect.arrayContaining(["date", "time"]));
    for (const type of used) expect(PICKERS).toContain(`[type="${type}"]`);
  });
});
