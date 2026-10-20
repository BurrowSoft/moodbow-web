// @vitest-environment node
import { describe, expect, it } from "vitest";
import fixture from "../../content/contracts/export_fixture.json";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import { BOM, CSV_COLUMNS, csvCell, renderExportCsv } from "./exportCsv";
import type { ExportDoc, Translate } from "./exportText";
import { parseCsv } from "./import/csv";
import { planImport } from "./import/journalImport";

// A translator over a messages file ("today.mood4").
const translator =
  (messages: object): Translate =>
  (key) =>
    key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages) as string;
const t = translator(en);
const TODAY = "2026-12-31";

const checkIn = (local_date: string, mood: number, over: object = {}) => ({ local_date, mood, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null, ...over });
let n = 0;
const entry = (entry_date: string, body: string, is_moment = false) => ({ id: `e${++n}`, entry_date, body, is_moment });
const doc = (check_ins: ExportDoc["check_ins"], entries: ExportDoc["entries"]): ExportDoc => ({
  format: "moodbow-export",
  format_version: 1,
  exported_at: "2026-10-21T09:00:00Z",
  account: { email: "a@example.com" },
  check_ins,
  entries,
});

// Every hard case in one journal.
const TRICKY = doc(
  [
    checkIn("2026-10-01", 4, { sleep_hours: "7.5", sleep_quality: "good", exercise_minutes: 30, stress: 2 }),
    checkIn("2026-10-02", 1, { sleep_hours: 0, exercise_minutes: 0 }),
    checkIn("2026-10-05", 5),
  ],
  [
    entry("2026-10-01", "Morning walk.", true),
    entry("2026-10-01", "Evening: tea, and \"a quiet\" talk.\r\nTwo lines.\r\n\r\n"),
    entry("2026-10-03", "- milk\n- eggs"),
    entry("2026-10-03", "=SUM(A1:A9) is not a formula here"),
    entry("2026-10-03", "'= starts with an apostrophe"),
    entry("2026-10-04", "  indented, with spaces at the end  "),
    entry("2026-10-04", "@mention +1 -1"),
    entry("2026-10-04", "Same words twice"),
    entry("2026-10-04", "Same words twice"),
    entry("2026-10-05", "วันนี้ไปเดินเล่นกับ Mai ✨", true),
  ],
);

// What "identical" means (§P): the same check-ins (date + all five values)
// and the same entries (date, text with \n line endings, moment, order).
function expectRoundTrip(source: ExportDoc) {
  const result = planImport(renderExportCsv(source, t), TODAY);
  if (result.status !== "ok") throw new Error(`import failed: ${JSON.stringify(result)}`);
  const { plan } = result;
  expect(plan.format).toBe("generic");
  const wantDays = (source.check_ins ?? []).map((c) => ({
    date: c.local_date,
    mood: c.mood,
    ...(c.sleep_hours !== null ? { sleep_hours: Number(c.sleep_hours) } : {}),
    ...(c.sleep_quality !== null ? { sleep_quality: c.sleep_quality } : {}),
    ...(c.exercise_minutes !== null ? { exercise_minutes: c.exercise_minutes } : {}),
    ...(c.stress !== null ? { stress: c.stress } : {}),
  }));
  expect(plan.days).toEqual(wantDays);
  const wantEntries = (source.entries ?? []).map((e) => ({ date: e.entry_date, body: e.body.replace(/\r\n?/g, "\n"), isMoment: e.is_moment }));
  expect(plan.entries.map((e) => ({ date: e.date, body: e.body, isMoment: e.isMoment === true }))).toEqual(wantEntries);
  return plan;
}

describe("renderExportCsv (1.1 P): the round trip through our own import", () => {
  it("every hard case comes back identical", () => {
    const plan = expectRoundTrip(TRICKY);
    // The same words twice on one day stay two entries (each its own id).
    expect(plan.entries.filter((e) => e.body === "Same words twice").map((e) => e.dup ?? 0)).toEqual([0, 1]);
    expect(plan.skipped).toEqual({ future: 0, tooLong: 0, olderDays: 0, olderEntries: 0 });
  });

  it("the shared export fixture comes back identical", () => {
    expectRoundTrip(fixture as unknown as ExportDoc);
  });

  it("an entry on a day without a check-in: blank check-in cells, and no check-in on re-import", () => {
    const plan = expectRoundTrip(doc([], [entry("2026-10-03", "Just words.")]));
    expect(plan.days).toEqual([]);
  });

  it("in Thai the mood word is Thai, and it still round-trips", () => {
    const csv = renderExportCsv(TRICKY, translator(th));
    expect(csv).toContain(`,${th.today.mood4},`);
    const result = planImport(csv, TODAY);
    expect(result.status === "ok" && result.plan.days.length).toBe(3);
  });
});

describe("renderExportCsv: the file", () => {
  const csv = renderExportCsv(TRICKY, t);
  const table = parseCsv(csv)!;

  it("UTF-8 BOM, the 9 columns, CRLF rows", () => {
    expect(csv.startsWith(BOM)).toBe(true);
    expect(table[0]).toEqual([...CSV_COLUMNS]);
    expect(csv.slice(1).split("\r\n")[0]).toBe("date,mood,mood_word,sleep_hours,sleep_quality,movement_minutes,stress,moment,note");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("one row per entry, oldest first, the day's check-in on each; a check-in alone is one row", () => {
    const rows = table.slice(1);
    expect(rows.map((r) => r[0])).toEqual(["2026-10-01", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-03", "2026-10-03", "2026-10-04", "2026-10-04", "2026-10-04", "2026-10-04", "2026-10-05"]);
    expect(rows[0]).toEqual(["2026-10-01", "4", en.today.mood4, "7.5", "good", "30", "2", "yes", "Morning walk."]);
    expect(rows[1].slice(0, 8)).toEqual(["2026-10-01", "4", en.today.mood4, "7.5", "good", "30", "2", ""]);
    expect(rows[2]).toEqual(["2026-10-02", "1", en.today.mood1, "0", "", "0", "", "", ""]);
    expect(rows[3].slice(1, 7)).toEqual(["", "", "", "", "", ""]);
  });

  it("no AI reflections, ever", () => {
    const withAi = { ...TRICKY, ai_reflections: [{ entry_id: "e1", body: "A REFLECTION FROM THE MODEL", created_at: "x" }] };
    expect(renderExportCsv(withAi, t)).not.toContain("A REFLECTION FROM THE MODEL");
  });
});

describe("csvCell: RFC 4180 and formula injection", () => {
  it("quotes a cell with a quote, a comma or a line break, quotes doubled", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("two\r\nlines")).toBe('"two\r\nlines"');
  });

  it("every formula start (= + - @ tab CR) gets a ' and can't run in a spreadsheet", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe('"\'\rx"');
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
});
