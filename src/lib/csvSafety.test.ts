// @vitest-environment node
import { describe, expect, it } from "vitest";
import { neutralizeCell, restoreCell } from "./csvSafety";

const TRIGGERS = ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx", "=HYPERLINK(\"http://x\")"];

describe("CSV formula injection (1.1 P)", () => {
  it("every formula start gets one ' in front", () => {
    for (const cell of TRIGGERS) expect(neutralizeCell(cell), JSON.stringify(cell)).toBe(`'${cell}`);
  });

  it("a ' already in front of a formula start is kept by doubling", () => {
    expect(neutralizeCell("'=x")).toBe("''=x");
    expect(neutralizeCell("''- y")).toBe("'''- y");
  });

  it("anything else is untouched: text, a plain leading ', an apostrophe inside, numbers, empty", () => {
    for (const cell of ["A walk", "'hello", "it's", "7.5", "", "a=b", " -indented"]) expect(neutralizeCell(cell)).toBe(cell);
  });

  it("restoring is the exact inverse, both ways", () => {
    const notes = [...TRIGGERS, "- milk\n- eggs", "'=x", "''-y", "'hello", "it's", "plain", "", "'", "''"];
    for (const note of notes) expect(restoreCell(neutralizeCell(note)), JSON.stringify(note)).toBe(note);
  });

  it("restoring leaves a ' that wasn't ours (a file from elsewhere)", () => {
    expect(restoreCell("'hello")).toBe("'hello");
    expect(restoreCell("'")).toBe("'");
    expect(restoreCell("'- milk")).toBe("- milk");
  });
});
