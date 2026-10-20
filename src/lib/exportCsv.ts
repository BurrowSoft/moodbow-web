// Export as a spreadsheet (1.1 P, decision 201; specs/1.1-features.md §P):
// the journal as a CSV any spreadsheet opens, and that Moodbow's own import
// reads back identically. Made in the browser from export_my_data()'s JSON
// (the .txt and .json come from the same document); no AI reflections.
//
// One row per entry, oldest first (the JSON's order: by date, then
// created_at), with that day's check-in on each of its rows; a day with a
// check-in and no entry is one row with an empty note; an entry on a day
// without a check-in has empty check-in cells (so a re-import makes none).
// UTF-8 with a BOM (Excel then reads Thai), RFC 4180 quoting, CRLF rows,
// and every cell made safe from formula injection (lib/csvSafety).
import { neutralizeCell } from "./csvSafety";
import type { ExportDoc, Translate } from "./exportText";

// The byte-order mark, written out so it's visible here.
export const BOM = String.fromCharCode(0xfeff);

export const CSV_COLUMNS = ["date", "mood", "mood_word", "sleep_hours", "sleep_quality", "movement_minutes", "stress", "moment", "note"] as const;

// RFC 4180: a cell with a quote, a comma or a line break is quoted, quotes
// doubled. Formula starts are neutralized first.
export function csvCell(value: string): string {
  const safe = neutralizeCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// ASCII digits, "." decimals, no trailing ".0" (as the .txt).
const num = (v: number | string | null) => (v === null || v === "" ? "" : String(Number(v)));

export function renderExportCsv(doc: ExportDoc, t: Translate): string {
  const checkIns = new Map((doc.check_ins ?? []).map((c) => [c.local_date, c]));
  const entriesByDay = new Map<string, NonNullable<ExportDoc["entries"]>>();
  for (const e of doc.entries ?? []) entriesByDay.set(e.entry_date, [...(entriesByDay.get(e.entry_date) ?? []), e]);
  const dates = [...new Set([...checkIns.keys(), ...entriesByDay.keys()])].sort();

  const lines = [CSV_COLUMNS.join(",")];
  for (const date of dates) {
    const c = checkIns.get(date);
    const day = c
      ? [String(c.mood), t(`today.mood${c.mood}`), num(c.sleep_hours), c.sleep_quality ?? "", num(c.exercise_minutes), num(c.stress)]
      : ["", "", "", "", "", ""];
    const entries = entriesByDay.get(date) ?? [];
    const rows = entries.length ? entries.map((e) => [e.is_moment ? "yes" : "", e.body]) : [["", ""]];
    for (const [moment, note] of rows) lines.push([date, ...day, moment, note].map(csvCell).join(","));
  }
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
