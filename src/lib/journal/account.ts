import { foldForSearch } from "./searchFold";

// What the user types to confirm deleting their account (M7): the UI
// language's word, in any case and with or without accents; English DELETE
// always works too (app #141, UX 2026-11-05). The same words as the app; pt
// shows APAGAR (me.deleteWord) and also takes EXCLUIR.
export const DELETE_WORD = "DELETE";
const DELETE_WORDS: Record<string, string[]> = {
  fr: ["SUPPRIMER"],
  es: ["ELIMINAR"],
  "pt-br": ["APAGAR", "EXCLUIR"],
  de: ["LÖSCHEN"],
  it: ["ELIMINA"],
};
const fold = (s: string) => foldForSearch(s.trim()).text;
// ö → oe etc. before the fold: the German way to type without umlauts, so
// LÖSCHEN, LOESCHEN and LOSCHEN all work.
const digraphs = (s: string) => fold(s.toLowerCase().replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue"));
export function deleteWordTyped(typed: string, locale: string): boolean {
  const t = fold(typed);
  if (!t) return false;
  return [DELETE_WORD, ...(DELETE_WORDS[locale.toLowerCase()] ?? [])].some((w) => t === fold(w) || t === digraphs(w));
}

// The export file's name: moodbow-export-2026-10-02.json (the day the
// server made it; just "moodbow-export.json" if that's missing).
export const exportFileName = (date: string) => (date ? `moodbow-export-${date}.json` : "moodbow-export.json");

// The spreadsheet's name: moodbow-2026-10-02.csv (1.1 P).
export const csvFileName = (date: string) => (date ? `moodbow-${date}.csv` : "moodbow.csv");

// The readable copy's name: moodbow-journal-2026-10-02.txt (UX).
export const journalFileName = (date: string) => (date ? `moodbow-journal-${date}.txt` : "moodbow-journal.txt");

// The calendar day (YYYY-MM-DD) of an instant in an IANA time zone; UTC for
// a zone this runtime doesn't know; "" for a bad instant.
export function localDay(iso: string, timeZone: string): string {
  if (Number.isNaN(Date.parse(iso))) return "";
  const at = new Date(iso);
  const format = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}
