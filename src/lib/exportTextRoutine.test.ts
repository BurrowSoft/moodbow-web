// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { renderExportText, type Translate } from "./exportText";

// The readable export's Routine section (1.4 F): export-text.md and export_fixture.json/.txt as the app's contract has
// them (content/contracts, synced from moodbow-app master 2a2c5812; the web's drafts until then).
const dir = path.join(process.cwd(), "content", "contracts");
const t = createTranslator({ locale: "en", messages }) as unknown as Translate;
const read = (name: string) => fs.readFileSync(path.join(dir, name));
const fixture = () => JSON.parse(read("export_fixture.json").toString("utf8"));

describe("readable export with Routine", () => {
  it("export_fixture.json → export_fixture.txt, byte for byte", () => {
    const actual = renderExportText(fixture(), t);
    expect(actual).toBe(read("export_fixture.txt").toString("utf8"));
    expect(Buffer.from(actual, "utf8").equals(read("export_fixture.txt"))).toBe(true);
  });

  it("no routine items: no Routine section, everything else the same", () => {
    // The fixture's text with its Routine block (heading, items, the blank line after) left out.
    const withoutRoutine = read("export_fixture.txt").toString("utf8").replace(/^Routine\n(?:.+\n)+\n/m, "");
    expect(withoutRoutine).not.toContain("\nRoutine\n");
    expect(renderExportText({ ...fixture(), routine: [] }, t)).toBe(withoutRoutine);
    expect(renderExportText({ ...fixture(), routine: undefined }, t)).toBe(withoutRoutine);
  });

  it("the spec's keys are the web's en words", () => {
    const md = read("export-text.md").toString("utf8");
    for (const [key, value] of Object.entries(messages.export).filter(([k]) => k.startsWith("exportRoutine"))) expect(md, key).toContain(`| ${key} | ${value} |`);
  });

  it("a line break in a name shows as a space; never a mood", () => {
    const doc = fixture();
    doc.routine[0].name = "Morning\nmeds";
    const text = renderExportText(doc, t);
    expect(text).toContain("- Morning meds · started 2026-09-27");
    const section = text.split("\n\nRoutine\n")[1].split("\n\n")[0];
    expect(section).not.toMatch(/mood|\/5/i);
  });
});
