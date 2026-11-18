// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { renderExportText, type Translate } from "../exportText";

// The 1.4 F drafts of export-text.md and export_fixture.json/.txt for moodbow-app's
// feat/routine-038 (the Routine section). The .txt was written by hand from v1's file; until it's
// synced into content/contracts, the drafts are here.
const v2 = path.join(process.cwd(), "src", "lib", "exportV2");
const t = createTranslator({ locale: "en", messages }) as unknown as Translate;
const read = (p: string) => fs.readFileSync(p);

describe("readable export with Routine (draft)", () => {
  it("export_fixture.json v2 → export_fixture.txt v2, byte for byte", () => {
    const doc = JSON.parse(read(path.join(v2, "export_fixture.json")).toString("utf8"));
    const actual = renderExportText(doc, t);
    expect(actual).toBe(read(path.join(v2, "export_fixture.txt")).toString("utf8"));
    expect(Buffer.from(actual, "utf8").equals(read(path.join(v2, "export_fixture.txt")))).toBe(true);
  });

  it("no routine items: no Routine section, the v1 file unchanged", () => {
    const doc = JSON.parse(read(path.join(v2, "export_fixture.json")).toString("utf8"));
    const v1 = read(path.join(process.cwd(), "content", "contracts", "export_fixture.txt")).toString("utf8");
    expect(renderExportText({ ...doc, routine: [] }, t)).toBe(v1);
    expect(renderExportText({ ...doc, routine: undefined }, t)).toBe(v1);
  });

  it("the spec's keys are the web's en words", () => {
    const md = read(path.join(v2, "export-text.md")).toString("utf8");
    for (const [key, value] of Object.entries(messages.export).filter(([k]) => k.startsWith("exportRoutine"))) expect(md, key).toContain(`| ${key} | ${value} |`);
  });

  it("a line break in a name shows as a space; never a mood", () => {
    const doc = JSON.parse(read(path.join(v2, "export_fixture.json")).toString("utf8"));
    doc.routine[0].name = "Morning\nmeds";
    const text = renderExportText(doc, t);
    expect(text).toContain("- Morning meds · started 2026-09-27");
    const section = text.split("\n\nRoutine\n")[1].split("\n\n")[0];
    expect(section).not.toMatch(/mood|\/5/i);
  });
});
