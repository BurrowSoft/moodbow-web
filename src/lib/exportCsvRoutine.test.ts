import { describe, expect, it } from "vitest";
import v2 from "./export-csv.v2.contract.json";
import v1 from "../../content/contracts/export-csv.json";
import en from "@/messages/en.json";
import { renderExportCsv } from "./exportCsv";
import type { ExportDoc } from "./exportText";

// export-csv.json with routineCases (1.4 F), drafted for moodbow-app's feat/routine-038 by
// scripts/gen-export-csv-routine.mjs. Until it's synced into content/contracts, the draft is here.
const t = (key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string;

describe("export-csv.json: routine", () => {
  it("the existing cases are unchanged, and render the same with the flag off", () => {
    expect(v2.cases).toEqual(v1.cases);
    for (const c of v1.cases.filter((x) => x.locale === "en")) expect(renderExportCsv(c.input as unknown as ExportDoc, t), c.name).toBe(c.csv);
  });

  for (const c of v2.routineCases) {
    it(c.name, () => {
      expect(renderExportCsv(c.input as unknown as ExportDoc, t, { routine: true })).toBe(c.csv);
    });
  }

  it("flag off: routine data in the JSON changes nothing", () => {
    const withRoutine = v2.routineCases[0].input as unknown as ExportDoc;
    const without = { ...withRoutine, routine: undefined } as ExportDoc;
    expect(renderExportCsv(withRoutine, t)).toBe(renderExportCsv(without, t));
  });
});
