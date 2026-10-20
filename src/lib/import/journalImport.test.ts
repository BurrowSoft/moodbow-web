import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeImportFile, detectDateFormat, htmlToText, MAX_IMPORT_BYTES, parseTime, planImport, toIso, type ImportPlan } from "./journalImport";

// jsdom (the default environment) provides DOMParser, as the browser does.
const TODAY = "2026-10-20";
const sample = readFileSync(join(__dirname, "fixtures", "daylio-sample.csv"), "utf8");
const ok = (text: string, options = {}): ImportPlan => {
  const r = planImport(text, TODAY, options);
  if (r.status !== "ok") throw new Error(`expected a plan, got ${JSON.stringify(r)}`);
  return r.plan;
};
const daylio = (rows: string[]) => ["full_date,date,weekday,time,mood,activities,note_title,note", ...rows].join("\n");

describe("planImport: the Daylio sample", () => {
  const plan = ok(sample);

  it("Daylio, ISO dates; the five moods mapped (rad 5 … awful 1); the latest time sets the day's mood", () => {
    expect(plan.format).toBe("daylio");
    expect(plan.dateFormat).toBe("iso");
    expect(plan.days).toEqual([
      { date: "2026-10-14", mood: 4 },
      { date: "2026-10-16", mood: 1 },
      { date: "2026-10-17", mood: 2 },
      { date: "2026-10-18", mood: 4 },
      // 7:30 am meh, 8:15 pm rad: the evening wins.
      { date: "2026-10-19", mood: 5 },
    ]);
  });

  it("every note is an entry, by date then time; title + a blank line + note; quotes and line breaks kept", () => {
    expect(plan.entries).toEqual([
      { date: "2026-10-15", time: "18:00", body: "Custom mood name." },
      { date: "2026-10-16", time: "23:45", body: "Long week\n\nToo much at once.\nCouldn't switch off.\n\nTomorrow will be better." },
      { date: "2026-10-18", time: "21:05", body: 'Made soup. Mum said it was "the best yet".' },
      { date: "2026-10-19", time: "07:30", body: "Slow start." },
      { date: "2026-10-19", time: "20:15", body: "A great day\n\nDinner with Maya, then a long walk by the river." },
    ]);
  });

  it("a custom mood is listed for mapping; activities are listed as not imported; the future row skipped", () => {
    expect(plan.customMoods).toEqual(["sleepy"]);
    expect(plan.notImported.activities).toEqual(["cooking", "deadline", "family", "friends", "good meal", "reading", "walk", "work"]);
    expect(plan.skipped).toEqual({ future: 1, tooLong: 0, olderDays: 0, olderEntries: 0 });
    expect(plan.range).toEqual({ first: "2026-10-14", last: "2026-10-19" });
  });

  it("a level given for the custom mood (H2) gives that day its mood", () => {
    expect(ok(sample, { customMoods: { sleepy: 3 } }).days).toContainEqual({ date: "2026-10-15", mood: 3 });
  });
});

describe("planImport: generic CSV and dates (settled 4)", () => {
  it("any column order; moods 1–5; ISO dates", () => {
    const plan = ok("note,date,mood\nA walk,2026-10-01,4\n,2026-10-02,2\n");
    expect(plan.format).toBe("generic");
    expect(plan.days).toEqual([
      { date: "2026-10-01", mood: 4 },
      { date: "2026-10-02", mood: 2 },
    ]);
    expect(plan.entries).toEqual([{ date: "2026-10-01", time: null, body: "A walk" }]);
  });

  it("DD/MM and MM/DD decided by the file; all ambiguous → the person's choice, DMY by default", () => {
    expect(ok("date,mood\n25/09/2026,3\n03/10/2026,4").days.map((d) => d.date)).toEqual(["2026-09-25", "2026-10-03"]);
    expect(ok("date,mood\n09/25/2026,3\n10/03/2026,4").days.map((d) => d.date)).toEqual(["2026-09-25", "2026-10-03"]);
    const ambiguous = "date,mood\n03/10/2026,3\n05/09/2026,4";
    expect(ok(ambiguous).dateFormat).toBe("ambiguous");
    expect(ok(ambiguous).days.map((d) => d.date)).toEqual(["2026-09-05", "2026-10-03"]);
    expect(ok(ambiguous, { dateOrder: "mdy" }).days.map((d) => d.date)).toEqual(["2026-03-10", "2026-05-09"]);
  });

  it("mixed or invalid dates → importError, with the row number only (M1)", () => {
    expect(planImport("date,mood\n25/09/2026,3\n09/26/2026,4", TODAY)).toEqual({ status: "error", reason: "dates" });
    expect(planImport("date,mood\n2026-10-01,3\nyesterday,4", TODAY)).toEqual({ status: "error", reason: "dates", row: 3 });
    expect(planImport("date,mood\n31/31/2026,3", TODAY)).toMatchObject({ status: "error", reason: "dates" });
    expect(planImport(daylio(["2026-13-01,x,x,9:00 pm,good,,,"]), TODAY)).toEqual({ status: "error", reason: "dates", row: 2 });
  });

  it("no header or no rows → the matching error", () => {
    expect(planImport("2026-10-01,3,No header\n2026-10-02,4,\n", TODAY)).toEqual({ status: "error", reason: "format" });
    expect(planImport("date,mood\n", TODAY)).toEqual({ status: "error", reason: "empty" });
    expect(planImport("", TODAY)).toEqual({ status: "error", reason: "empty" });
  });
});

describe("planImport: limits (settled 2, H3, H4)", () => {
  it("the newest 2,000 days; older ones counted (the 3-year rule is gone)", () => {
    const rows = Array.from({ length: 2100 }, (_, i) => `${new Date(Date.UTC(2026, 9, 20) - i * 864e5).toISOString().slice(0, 10)},3`);
    const plan = ok(["date,mood", ...rows].join("\n"));
    expect(plan.days).toHaveLength(2000);
    expect(plan.days.at(-1)!.date).toBe(TODAY);
    expect(plan.skipped.olderDays).toBe(100);
  });

  it("a note over 20,000 characters is skipped and counted; its day's mood still comes in", () => {
    const plan = ok(`date,mood,note\n2026-10-01,3,${"x".repeat(20001)}`);
    expect(plan.entries).toEqual([]);
    expect(plan.skipped.tooLong).toBe(1);
    expect(plan.days).toEqual([{ date: "2026-10-01", mood: 3 }]);
  });

  it("future means after the profile's today (M4)", () => {
    const plan = ok(`date,mood\n${TODAY},3\n2026-10-21,4`);
    expect(plan.days.map((d) => d.date)).toEqual([TODAY]);
    expect(plan.skipped.future).toBe(1);
  });
});

describe("Daylio notes as plain text (settled 3, M3)", () => {
  it("<br> → a line break, other tags stripped, entities decoded; nothing left that looks like a tag", () => {
    expect(htmlToText("First line<br>Second line<br/>Third line")).toBe("First line\nSecond line\nThird line");
    expect(htmlToText("<div><b>Bold</b> and <i>italic</i></div> Tom &amp; Jerry said &quot;hi&quot; &#39;twice&#39; &lt;3")).toBe(
      "Bold and italic\n Tom & Jerry said \"hi\" 'twice' <3",
    );
    expect(htmlToText('<img src=x onerror="alert(1)">safe')).toBe("safe");
  });

  it("title only or note only: that one alone", () => {
    const plan = ok(daylio(["2026-10-10,x,x,9:00 am,good,,Just a title,", "2026-10-11,x,x,9:00 am,good,,,Just a note"]));
    expect(plan.entries.map((e) => e.body)).toEqual(["Just a title", "Just a note"]);
  });
});

describe("the file itself (M2, H4)", () => {
  it("UTF-8 text (with a BOM) reads; another encoding or a renamed image → encoding; over 10 MB → size", () => {
    expect(decodeImportFile(new TextEncoder().encode("﻿date,mood\n").buffer as ArrayBuffer)).toMatchObject({ status: "ok" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);
    expect(decodeImportFile(png.buffer)).toEqual({ status: "error", reason: "encoding" });
    expect(decodeImportFile(new ArrayBuffer(MAX_IMPORT_BYTES + 1))).toEqual({ status: "error", reason: "size" });
  });
});

describe("helpers", () => {
  it.each([
    ["8:15 pm", "20:15"],
    ["8:15 PM", "20:15"],
    ["12:05 am", "00:05"],
    ["12:30 pm", "12:30"],
    ["08:15", "08:15"],
    ["23:59", "23:59"],
    ["24:00", null],
    ["noon", null],
  ])("parseTime(%s) = %s", (raw, want) => {
    expect(parseTime(raw)).toBe(want);
  });

  it("detectDateFormat and toIso", () => {
    expect(detectDateFormat(["2026-10-01"])).toBe("iso");
    expect(detectDateFormat(["13/01/2026"])).toBe("dmy");
    expect(detectDateFormat(["01/13/2026"])).toBe("mdy");
    expect(detectDateFormat(["01/02/2026"])).toBe("ambiguous");
    expect(detectDateFormat(["2026-10-01", "01/02/2026"])).toBeNull();
    expect(toIso("29/02/2026", "dmy", "dmy")).toBeNull();
    expect(toIso("29/02/2028", "dmy", "dmy")).toBe("2028-02-29");
  });
});
