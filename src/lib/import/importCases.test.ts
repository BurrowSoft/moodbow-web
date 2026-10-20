import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "../../../content/contracts/export_fixture.json";
import en from "@/messages/en.json";
import { renderExportCsv } from "@/lib/exportCsv";
import type { ExportDoc, Translate } from "@/lib/exportText";
import { decodeImportFile, MAX_IMPORT_BYTES, MAX_IMPORT_DAYS, MAX_IMPORT_ENTRIES, planImport, type ImportOptions, type ImportResult } from "./journalImport";
import { IMPORT_NAMESPACE, importEntryId } from "./uuidv5";

// content/contracts/import-cases.json (1.1 K, decision 208): the web's
// import as a shared contract, so the app's port is checked against it
// byte for byte. Each case's result is exactly what planImport returns,
// and ids are importEntryId for each planned entry, in order. This test
// fails when the file and the code disagree; regenerate with
//   WRITE_IMPORT_CASES=1 npx vitest run src/lib/import/importCases.test.ts
// (jsdom: Daylio notes go through DOMParser, as in the browser.)
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

const FILE = join(process.cwd(), "content", "contracts", "import-cases.json");
const TODAY = "2026-10-21";
const USER = "00000000-0000-4000-8000-000000000001";

type Input = { csv: string } | { base64: string } | { generate: { kind: "days" | "entries"; count: number } };
type Case = { name: string; options?: ImportOptions } & Input;

const daylio = (rows: string[]) => ["full_date,date,weekday,time,mood,activities,note_title,note", ...rows].join("\n");
// LF whatever the checkout does (git stores it LF; Windows may check it out
// CRLF): the contract's text must be the same everywhere. CRLF has its own case.
const sample = readFileSync(join(process.cwd(), "src", "lib", "import", "fixtures", "daylio-sample.csv"), "utf8").replace(/\r\n/g, "\n");
const OURS = "date,mood,mood_word,sleep_hours,sleep_quality,movement_minutes,stress,moment,note";
const t: Translate = (key) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

// The day i days before today, newest first.
const daysBack = (i: number) => new Date(Date.UTC(2026, 9, 21) - i * 864e5).toISOString().slice(0, 10);
function generated(kind: "days" | "entries", count: number): string {
  // days: one check-in a day, going back from today. entries: three notes a
  // day (different words), so the 5,000 cap is hit before the 2,000-day one.
  return kind === "days"
    ? ["date,mood", ...Array.from({ length: count }, (_, i) => `${daysBack(i)},3`)].join("\n")
    : ["date,mood,note", ...Array.from({ length: count }, (_, i) => `${daysBack(Math.floor(i / 3))},3,Note ${i}`)].join("\n");
}

const CASES: Case[] = [
  // Daylio
  { name: "daylio sample (BOM, CRLF, a custom mood, activities, a future row, two rows on one day)", csv: sample },
  { name: "daylio sample, the custom mood mapped (sleepy → 3)", csv: sample, options: { customMoods: { sleepy: 3 } } },
  { name: "daylio: several rows on one day, the latest time sets the mood", csv: daylio(["2026-10-10,x,x,9:00 pm,rad,,,", "2026-10-10,x,x,7:15 am,awful,,,", "2026-10-10,x,x,12:30 pm,meh,,,"]) },
  { name: "daylio: custom moods unmapped (the UI blocks until each has a level or Skip; Skip = no key, no mood)", csv: daylio(["2026-10-10,x,x,9:00 am,sleepy,,,", "2026-10-11,x,x,9:00 am,wired,,,Note"]) },
  { name: "daylio: one custom mood mapped, one skipped", csv: daylio(["2026-10-10,x,x,9:00 am,sleepy,,,", "2026-10-11,x,x,9:00 am,wired,,,Note"]), options: { customMoods: { sleepy: 2 } } },
  { name: "daylio: title only, note only", csv: daylio(["2026-10-10,x,x,9:00 am,good,,Just a title,", "2026-10-11,x,x,9:00 am,good,,,Just a note"]) },
  {
    name: "daylio: HTML notes (<br>, block tags, entities, nested tags, an img)",
    csv: daylio([
      '2026-10-12,x,x,9:00 am,good,,,"First line<br>Second line<br/>Third line"',
      '2026-10-13,x,x,9:00 am,good,,,"<div><b>Bold</b> and <i>italic</i></div> Tom &amp; Jerry said &quot;hi&quot; &#39;twice&#39; &lt;3"',
      '2026-10-14,x,x,9:00 am,good,,,"<p>One</p><p>Two <span><b>nested</b></span></p><ul><li>a</li><li>b</li></ul>"',
      '2026-10-15,x,x,9:00 am,good,,,"<img src=x onerror=""alert(1)"">safe"',
    ]),
  },
  { name: "daylio: a ' that isn't our export's stays", csv: daylio(["2026-10-01,x,x,9:00 am,good,,,'- not ours"]) },
  { name: "daylio: an impossible date (row 2)", csv: daylio(["2026-13-01,x,x,9:00 pm,good,,,"]) },
  // Generic CSV and dates
  { name: "generic: any column order, moods 1–5, ISO dates", csv: "note,date,mood\nA walk,2026-10-01,4\n,2026-10-02,2\n" },
  { name: "dates: DD/MM decided by the file", csv: "date,mood\n25/09/2026,3\n03/10/2026,4" },
  { name: "dates: MM/DD decided by the file", csv: "date,mood\n09/25/2026,3\n10/03/2026,4" },
  { name: "dates: all ambiguous, no choice (DMY)", csv: "date,mood\n03/10/2026,3\n05/09/2026,4" },
  { name: "dates: all ambiguous, MDY chosen", csv: "date,mood\n03/10/2026,3\n05/09/2026,4", options: { dateOrder: "mdy" } },
  { name: "dates: mixed DMY and MDY (no row)", csv: "date,mood\n25/09/2026,3\n09/26/2026,4" },
  { name: "dates: not a date (row 3)", csv: "date,mood\n2026-10-01,3\nyesterday,4" },
  { name: "dates: 31/31", csv: "date,mood\n31/31/2026,3" },
  { name: "dates: 29/02 in a leap year", csv: "date,mood\n29/02/2028,3\n13/01/2028,4", options: {} },
  // The file
  { name: "an unterminated quote", csv: 'date,mood,note\n2026-10-01,3,"never closed\n' },
  { name: "no header", csv: "2026-10-01,3,No header\n2026-10-02,4,\n" },
  { name: "header only", csv: "date,mood\n" },
  { name: "empty", csv: "" },
  { name: "semicolons, a quoted comma and semicolon", csv: 'date;mood;note\n2026-10-01;3;"a, b; c"\n2026-10-02;4;plain' },
  { name: "BOM, CRLF, a blank line, no final newline", csv: "﻿date,mood\r\n2026-10-01,3\r\n\r\n2026-10-02,4" },
  { name: "quotes: doubled quotes and a line break inside", csv: 'date,mood,note\n2026-10-01,3,"say ""hi""\nline two"' },
  { name: "bytes: UTF-8 with a BOM", base64: b64(new TextEncoder().encode("﻿date,mood,note\n2026-10-01,4,café ✨\n")) },
  { name: "bytes: not UTF-8 (a renamed image)", base64: b64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00])) },
  { name: "bytes: Latin-1 (é as 0xE9)", base64: b64(new Uint8Array([...new TextEncoder().encode("date,mood,note\n2026-10-01,4,caf"), 0xe9])) },
  // Limits
  { name: "a note over 20,000 characters (UTF-16 units): skipped, its day's mood kept", csv: `date,mood,note\n2026-10-01,3,${"x".repeat(20001)}\n2026-10-02,3,${"y".repeat(20000)}` },
  { name: "future: after today (the profile zone's, passed in)", csv: `date,mood\n${TODAY},3\n2026-10-22,4` },
  { name: `caps: ${MAX_IMPORT_DAYS + 100} days → the newest ${MAX_IMPORT_DAYS}`, generate: { kind: "days", count: MAX_IMPORT_DAYS + 100 } },
  { name: `caps: ${MAX_IMPORT_ENTRIES + 100} notes → the newest ${MAX_IMPORT_ENTRIES}`, generate: { kind: "entries", count: MAX_IMPORT_ENTRIES + 100 } },
  // Our own CSV export (1.1 P)
  { name: "ours: check-in values, only allowed ones", csv: [OURS, "2026-10-01,4,Good,7.5,good,30,2,,", "2026-10-02,3,Okay,7.3,meh,20,9,,", "2026-10-03,,,8,good,30,2,,Just words."].join("\n") },
  { name: "ours: moment yes / no / YES", csv: [OURS, "2026-10-01,4,Good,,,,,yes,A", "2026-10-01,4,Good,,,,,no,B", "2026-10-01,4,Good,,,,,YES,C"].join("\n") },
  { name: "ours: spaces and blank lines kept, CRLF → LF, all-blank is no note", csv: `date,mood,note\n2026-10-01,4,"  two\r\nlines  \r\n"\n2026-10-02,3,"   "\n` },
  { name: "ours: the ' before a formula start comes off; one that isn't ours stays", csv: "date,mood,note\n2026-10-01,4,'- milk\n2026-10-02,4,''=x\n2026-10-03,4,'hello\n" },
  { name: "duplicates: the same words twice on a day, once the next day (dup index)", csv: "date,mood,note\n2026-10-01,4,Same\n2026-10-01,4,Same\n2026-10-02,4,Same\n2026-10-01,4,Same\n" },
  { name: "round trip: our own export of content/contracts/export_fixture.json (en)", csv: renderExportCsv(fixture as unknown as ExportDoc, t) },
];

type Outcome = { decoded?: { status: "error"; reason: string }; result?: ImportResult | Summary; ids?: string[] };
type Summary = { status: string; days: number; entries: number; skipped: unknown; range: unknown; firstDay?: unknown; lastEntry?: unknown };

async function run(c: Case): Promise<Outcome> {
  let text: string;
  if ("base64" in c) {
    const bytes = Uint8Array.from(Buffer.from(c.base64, "base64"));
    const decoded = decodeImportFile(bytes.buffer as ArrayBuffer);
    if (decoded.status === "error") return { decoded };
    text = decoded.text;
  } else text = "generate" in c ? generated(c.generate.kind, c.generate.count) : c.csv;
  const result = planImport(text, TODAY, c.options ?? {});
  if (result.status !== "ok") return { result };
  const ids = await Promise.all(result.plan.entries.map((e) => importEntryId(USER, e)));
  if (!("generate" in c)) return { result, ids };
  // Generated cases: the counts and ends, not thousands of rows.
  const { plan } = result;
  return {
    result: { status: "ok", days: plan.days.length, entries: plan.entries.length, skipped: plan.skipped, range: plan.range, firstDay: plan.days[0], lastEntry: plan.entries.at(-1) },
    ids: [ids[0], ids.at(-1)!].filter(Boolean),
  };
}

async function build() {
  return {
    $comment:
      "Generated from moodbow-web src/lib/import (planImport, decodeImportFile, importEntryId) by src/lib/import/importCases.test.ts; the web checks it on every CI run. " +
      "Inputs: csv (text), base64 (file bytes, through decodeImportFile first), or generate (days: one 'date,mood' row a day going back from today; entries: 'date,mood,note' rows, three a day, 'Note <i>'; results summarized, ids = first and last). " +
      "Entry id: UUIDv5(namespace, UTF-8 of `${userId}|${date}|${time ?? ''}|${body}` + (dup ? `|#${dup}` : '')). " +
      "Daylio notes: DOMParser text/html, <br> → \\n, p/div/li get \\n appended, textContent, 3+ newlines → 2, trim. " +
      `Caps: ${MAX_IMPORT_DAYS} days, ${MAX_IMPORT_ENTRIES} entries (the newest), ${MAX_IMPORT_BYTES} bytes, a note over 20000 UTF-16 units skipped.`,
    namespace: IMPORT_NAMESPACE,
    today: TODAY,
    userId: USER,
    caps: { days: MAX_IMPORT_DAYS, entries: MAX_IMPORT_ENTRIES, bytes: MAX_IMPORT_BYTES, noteChars: 20000 },
    cases: await Promise.all(CASES.map(async (c) => ({ ...c, ...(await run(c)) }))),
  };
}

describe("content/contracts/import-cases.json (1.1 K, shared with the app)", () => {
  it("matches what the web's import does today", async () => {
    const data = await build();
    const text = `${JSON.stringify(data, null, 2)}\n`;
    if (process.env.WRITE_IMPORT_CASES === "1") writeFileSync(FILE, text);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(text));
  });
});
