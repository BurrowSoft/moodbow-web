import { restoreCell } from "@/lib/csvSafety";
import { EXERCISE_MINUTES, SLEEP_HOURS, SLEEP_QUALITIES, type SleepQuality } from "@/lib/journal/checkIn";
import { MAX_ENTRY_CHARS } from "@/lib/journal/entry";
import { parseCsv } from "./csv";

// Import from another journal (1.1 K, decision 189; specs/1.1-features.md §K
// and both "Settled" blocks): a CSV read in the browser only, turned into a
// plan the person previews before anything is written. Daylio's export
// (full_date, date, weekday, time, mood, activities, note_title, note) or a
// generic CSV (date, mood 1–5, note; any column order). Nothing about the file
// is kept, and errors carry row numbers only (M1), never a row's text.
// Writing (never overwriting) is the caller's job.

export type ImportFormat = "daylio" | "generic";
export type Mood = 1 | 2 | 3 | 4 | 5;
export type DateOrder = "dmy" | "mdy";
// How the file's dates read: ISO, or day/month vs month/day, decided by the
// file (a part > 12) or, when nothing decides, by the person (DMY default).
export type DateFormat = "iso" | DateOrder | "ambiguous";
// A day's check-in. The other values come only from a generic file that
// has those columns (our own CSV export, 1.1 P); absent means none.
export type ImportDay = { date: string; mood: Mood; sleep_hours?: number; sleep_quality?: SleepQuality; exercise_minutes?: number; stress?: number };
// isMoment: our export's moment column. dup: the n-th copy of the same text
// on the same day and time (n ≥ 1), so each copy keeps its own id.
export type ImportEntry = { date: string; time: string | null; body: string; isMoment?: true; dup?: number };
export type ImportPlan = {
  format: ImportFormat;
  dateFormat: DateFormat;
  // One mood per day: the day's latest row by time (settled 1).
  days: ImportDay[];
  // Every row with a note is its own entry, in date and time order.
  entries: ImportEntry[];
  // Daylio mood names that aren't the five built-in ones: they need a level
  // from the person (options.customMoods, H2); until then those rows get no mood.
  customMoods: string[];
  // What the file had that Moodbow doesn't import (Daylio's activities).
  notImported: { activities: string[] };
  skipped: { future: number; tooLong: number; olderDays: number; olderEntries: number };
  range: { first: string; last: string } | null;
};
export type ImportError = "empty" | "format" | "dates" | "size" | "encoding";
export type ImportResult = { status: "ok"; plan: ImportPlan } | { status: "error"; reason: ImportError; row?: number };
export type ImportOptions = { dateOrder?: DateOrder; customMoods?: Record<string, Mood> };

export const MAX_IMPORT_DAYS = 2000;
export const MAX_IMPORT_ENTRIES = 5000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
// Rows per server action call (check-ins or entries).
export const IMPORT_BATCH = 100;

// The file's bytes as text (M2, H4): at most 10 MB, and valid UTF-8 (a BOM is
// fine); anything else (another encoding, a renamed image) is an error.
export function decodeImportFile(bytes: ArrayBuffer): { status: "ok"; text: string } | { status: "error"; reason: "size" | "encoding" } {
  if (bytes.byteLength > MAX_IMPORT_BYTES) return { status: "error", reason: "size" };
  try {
    return { status: "ok", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { status: "error", reason: "encoding" };
  }
}

// Daylio's five built-in moods, by name (rad → 5 … awful → 1).
const DAYLIO_MOODS: Record<string, Mood> = { rad: 5, good: 4, meh: 3, bad: 2, awful: 1 };

const pad = (n: number) => String(n).padStart(2, "0");
function realIso(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

// The file's date format (settled 4): all ISO; or all slashed, where any
// first part > 12 means DMY and any second part > 12 means MDY; both, or a
// mix of styles, or anything else → null (importError).
export function detectDateFormat(raw: string[]): DateFormat | null {
  if (raw.length === 0) return null;
  if (raw.every((d) => ISO.test(d))) return "iso";
  if (!raw.every((d) => SLASHED.test(d))) return null;
  const parts = raw.map((d) => d.match(SLASHED)!.slice(1, 3).map(Number));
  const dmy = parts.some(([a]) => a > 12);
  const mdy = parts.some(([, b]) => b > 12);
  if (dmy && mdy) return null;
  return dmy ? "dmy" : mdy ? "mdy" : "ambiguous";
}

export function toIso(raw: string, format: DateFormat, order: DateOrder): string | null {
  if (format === "iso") {
    const m = raw.match(ISO);
    return m ? realIso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  }
  const m = raw.match(SLASHED);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const reading = format === "ambiguous" ? order : format;
  return reading === "dmy" ? realIso(y, b, a) : realIso(y, a, b);
}

// "8:15 pm", "8:15 PM", "08:15", "20:15" → "HH:MM"; anything else → null.
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "p" ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

// Daylio's notes are HTML (settled 3, M3): <br> and block ends become line
// breaks, other tags go (their text stays), entities are decoded. Parsed
// with DOMParser as an inert document, read back as textContent: nothing is
// rendered or run, and innerHTML is never used.
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html.trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const br of [...doc.querySelectorAll("br")]) br.replaceWith("\n");
  for (const block of [...doc.querySelectorAll("p, div, li")]) block.append("\n");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

type Extras = Omit<ImportDay, "date" | "mood">;
type Row = { date: string; time: string | null; mood: Mood | null; extras: Extras; body: string; isMoment: boolean; order: number };

// A generic file's other check-in values (our CSV export's columns), each
// only when it's one the check-in allows (the same rules as the form and
// upsert_check_in); anything else is left out, not guessed.
function checkInExtras(get: (name: string) => string): Extras {
  const extras: Extras = {};
  const sleep = get("sleep_hours");
  if (/^\d+(\.\d+)?$/.test(sleep) && (SLEEP_HOURS as number[]).includes(Number(sleep))) extras.sleep_hours = Number(sleep);
  const quality = get("sleep_quality").toLowerCase();
  if ((SLEEP_QUALITIES as readonly string[]).includes(quality)) extras.sleep_quality = quality as SleepQuality;
  const minutes = get("movement_minutes");
  if (/^\d+$/.test(minutes) && (EXERCISE_MINUTES as readonly number[]).includes(Number(minutes))) extras.exercise_minutes = Number(minutes);
  const stress = get("stress");
  if (/^[1-5]$/.test(stress)) extras.stress = Number(stress);
  return extras;
}

export function planImport(text: string, today: string, options: ImportOptions = {}): ImportResult {
  const table = parseCsv(text);
  // An unterminated quote (reviewer #92 B3): refused, not guessed at.
  if (table === null) return { status: "error", reason: "format" };
  if (table.length < 2) return { status: "error", reason: "empty" };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const format: ImportFormat | null = col("full_date") >= 0 && col("mood") >= 0 ? "daylio" : col("date") >= 0 && col("mood") >= 0 ? "generic" : null;
  if (!format) return { status: "error", reason: "format" };
  // A cell as written; in a generic file our export's ' in front of a formula
  // start comes off first (lib/csvSafety, 1.1 P).
  const raws = table.slice(1).map((cells) => (name: string) => {
    const cell = col(name) >= 0 ? (cells[col(name)] ?? "") : "";
    return format === "generic" ? restoreCell(cell) : cell;
  });
  const records = raws.map((raw) => (name: string) => raw(name).trim());
  // A row's number as the person sees it in a spreadsheet (the header is 1).
  const rowNumber = (i: number) => i + 2;

  // Dates first: the whole file reads one way, or it's an error (settled 4).
  const rawDates = records.map((get) => get(format === "daylio" ? "full_date" : "date"));
  const dateFormat = detectDateFormat(rawDates);
  if (!dateFormat) {
    const first = rawDates.findIndex((d) => !ISO.test(d) && !SLASHED.test(d));
    return { status: "error", reason: "dates", ...(first >= 0 ? { row: rowNumber(first) } : {}) };
  }
  const isoDates = rawDates.map((d) => toIso(d, dateFormat, options.dateOrder ?? "dmy"));
  const bad = isoDates.findIndex((d) => d === null);
  if (bad >= 0) return { status: "error", reason: "dates", row: rowNumber(bad) };

  const skipped = { future: 0, tooLong: 0, olderDays: 0, olderEntries: 0 };
  const activities = new Set<string>();
  const custom = new Set<string>();
  const rows: Row[] = [];
  records.forEach((get, i) => {
    const date = isoDates[i]!;
    // After the profile's today (M4).
    if (date > today) return void skipped.future++;
    const moodRaw = get("mood");
    let mood: Mood | null = null;
    if (format === "daylio") {
      const name = moodRaw.toLowerCase();
      mood = DAYLIO_MOODS[name] ?? options.customMoods?.[moodRaw] ?? null;
      if (!(name in DAYLIO_MOODS) && moodRaw !== "") custom.add(moodRaw);
      for (const a of get("activities").split("|").map((s) => s.trim()).filter(Boolean)) activities.add(a);
    } else if (/^[1-5]$/.test(moodRaw)) mood = Number(moodRaw) as Mood;
    // Daylio: title + a blank line + the note; either alone if the other is
    // empty. Generic: the note as written (only line endings change), so our
    // own export comes back identical (1.1 P); all-blank is no note.
    const body =
      format === "daylio"
        ? [htmlToText(get("note_title")), htmlToText(get("note"))].filter(Boolean).join("\n\n")
        : raws[i]("note").replace(/\r\n?/g, "\n");
    const generic = format === "generic";
    rows.push({
      date,
      time: generic ? null : parseTime(get("time")),
      mood,
      extras: generic ? checkInExtras(get) : {},
      body: body.trim() ? body : "",
      isMoment: generic && get("moment").toLowerCase() === "yes",
      order: i,
    });
  });

  // The newest 2,000 days (the cap; the 3-year rule is dropped).
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const keep = new Set(dates.slice(0, MAX_IMPORT_DAYS));
  skipped.olderDays = dates.length - keep.size;
  const kept = rows.filter((r) => keep.has(r.date));
  // Within a day: by time where there is one, else in file order.
  kept.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.order - b.order);

  const dayOf = new Map<string, ImportDay>();
  const copies = new Map<string, number>();
  let entries: ImportEntry[] = [];
  for (const r of kept) {
    // The latest row of the day with a mood wins, with its other values.
    if (r.mood !== null) dayOf.set(r.date, { date: r.date, mood: r.mood, ...r.extras });
    if (!r.body) continue;
    // Over 20,000 characters: skipped and counted (H3).
    if (r.body.length > MAX_ENTRY_CHARS) {
      skipped.tooLong++;
      continue;
    }
    const key = `${r.date}|${r.time ?? ""}|${r.body}`;
    const dup = copies.get(key) ?? 0;
    copies.set(key, dup + 1);
    entries.push({ date: r.date, time: r.time, body: r.body, ...(r.isMoment ? { isMoment: true as const } : {}), ...(dup ? { dup } : {}) });
  }
  // At most 5,000 entries, the newest (H4).
  if (entries.length > MAX_IMPORT_ENTRIES) {
    skipped.olderEntries = entries.length - MAX_IMPORT_ENTRIES;
    entries = entries.slice(-MAX_IMPORT_ENTRIES);
  }
  const days = [...dayOf.values()].sort((a, b) => a.date.localeCompare(b.date));
  const all = [...days.map((d) => d.date), ...entries.map((e) => e.date)].sort();
  return {
    status: "ok",
    plan: {
      format,
      dateFormat,
      days,
      entries,
      // Plain code-unit order (sort()'s default), not localeCompare: the same
      // on every device and in the app's port (import-cases.json).
      customMoods: [...custom].sort(),
      notImported: { activities: [...activities].sort() },
      skipped,
      range: all.length ? { first: all[0], last: all[all.length - 1] } : null,
    },
  };
}
