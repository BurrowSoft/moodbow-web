// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DELETE_WORD, exportFileName, journalFileName, localDay } from "./account";

// Coverage pass (UX): the export files' names and the day they carry.
describe("account helpers", () => {
  it("DELETE is the same word in every language", () => {
    expect(DELETE_WORD).toBe("DELETE");
  });

  it("file names carry the export day; without one, plain names", () => {
    expect(exportFileName("2026-10-02")).toBe("moodbow-export-2026-10-02.json");
    expect(exportFileName("")).toBe("moodbow-export.json");
    expect(journalFileName("2026-10-02")).toBe("moodbow-journal-2026-10-02.txt");
    expect(journalFileName("")).toBe("moodbow-journal.txt");
  });

  it("localDay: the calendar day in the zone; UTC for an unknown zone; blank for a bad instant", () => {
    expect(localDay("2026-10-02T23:30:00Z", "Asia/Bangkok")).toBe("2026-10-03");
    expect(localDay("2026-10-02T23:30:00Z", "America/Sao_Paulo")).toBe("2026-10-02");
    expect(localDay("2026-10-02T23:30:00Z", "Not/AZone")).toBe("2026-10-02");
    expect(localDay("not a date", "UTC")).toBe("");
    expect(localDay("", "UTC")).toBe("");
  });
});
