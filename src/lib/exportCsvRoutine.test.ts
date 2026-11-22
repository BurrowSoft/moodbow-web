import { describe, expect, it } from "vitest";
import csv from "../../content/contracts/export-csv.json";
import en from "@/messages/en.json";
import { renderExportCsv } from "./exportCsv";
import type { ExportDoc } from "./exportText";

// export-csv.json's routineCases (1.4 F), the app's contract (content/contracts, synced from moodbow-app master
// 2a2c5812; the cases were first drafted by scripts/gen-export-csv-routine.mjs).
const t = (key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en) as string;

describe("export-csv.json: routine", () => {
  it("the cases without Routine render the same with the flag off", () => {
    for (const c of csv.cases.filter((x) => x.locale === "en")) expect(renderExportCsv(c.input as unknown as ExportDoc, t), c.name).toBe(c.csv);
  });

  for (const c of csv.routineCases) {
    it(c.name, () => {
      expect(renderExportCsv(c.input as unknown as ExportDoc, t, { routine: true })).toBe(c.csv);
    });
  }

  it("flag off: routine data in the JSON changes nothing", () => {
    const withRoutine = csv.routineCases[0].input as unknown as ExportDoc;
    const without = { ...withRoutine, routine: undefined } as ExportDoc;
    expect(renderExportCsv(withRoutine, t)).toBe(renderExportCsv(without, t));
  });
});
