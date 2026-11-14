import type { PrintDay } from "@/lib/journal/printMonth";
import { monthRange } from "@/lib/share/moodbow";

// Moodbow Plus: the designed PDF journal (decision 246; UX's note, 11 Nov). A
// month ("2026-10") or a year ("2026") of the person's own check-ins and
// entries, laid out for print; the browser's print dialog makes the PDF on
// the device. Nothing is stored. Pure.

export type PdfPeriod = { kind: "month" | "year"; key: string };

export function parsePdfPeriod(s: unknown, today: string): PdfPeriod | null {
  if (typeof s !== "string") return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s <= today.slice(0, 7) ? { kind: "month", key: s } : null;
  if (/^\d{4}$/.test(s)) return s <= today.slice(0, 4) ? { kind: "year", key: s } : null;
  return null;
}

export function pdfRange(p: PdfPeriod): { from: string; to: string } {
  return p.kind === "month" ? monthRange(p.key) : { from: `${p.key}-01-01`, to: `${p.key}-12-31` };
}

// The months and years with anything in them, newest first: the picker's lists.
export function periodsWithData(dates: Iterable<string>): { months: string[]; years: string[] } {
  const months = new Set<string>();
  for (const d of dates) if (/^\d{4}-\d{2}-\d{2}$/.test(d)) months.add(d.slice(0, 7));
  const sorted = [...months].sort().reverse();
  return { months: sorted, years: [...new Set(sorted.map((m) => m.slice(0, 4)))] };
}

// A year's days under one heading per month (each starts a new page).
export function byMonth(days: PrintDay[]): { month: string; days: PrintDay[] }[] {
  const out: { month: string; days: PrintDay[] }[] = [];
  for (const d of days) {
    const month = d.date.slice(0, 7);
    if (out.at(-1)?.month !== month) out.push({ month, days: [] });
    out.at(-1)!.days.push(d);
  }
  return out;
}

// The cover's counts: days with a check-in, and entries.
export const pdfCounts = (days: PrintDay[]) => ({ days: days.filter((d) => d.checkIn).length, entries: days.reduce((n, d) => n + d.entries.length, 0) });
