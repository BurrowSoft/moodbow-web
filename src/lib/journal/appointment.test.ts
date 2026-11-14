import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import contract from "../../../content/appointment.json";
import yourWeek from "../../../content/your-week.json";
import { APPOINTMENT_RULES, checkInCount, firstLine, isWeeks, rangeAverage, starredIn, weeksDays } from "./appointment";
import type { InsightRow } from "./insights";

const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
const messages = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as Record<string, Record<string, string>>;
const row = (local_date: string, mood: number, more: Partial<InsightRow> = {}): InsightRow => ({ local_date, mood, sleep_hours: null, stress: null, exercise_minutes: null, ...more });

describe("appointment rules (content/appointment.json)", () => {
  it("are the contract's: 2, 4 or 12 weeks, 4 by default, first lines of 120", () => {
    expect(APPOINTMENT_RULES).toEqual({ rangeWeeks: [2, 4, 12], defaultWeeks: 4, firstLineChars: 120 });
    expect([1, 2, 4, 12, "4"].map(isWeeks)).toEqual([false, true, true, true, false]);
  });

  it("the range ends today, oldest first", () => {
    const days = weeksDays("2026-11-09", 2);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-27");
    expect(days.at(-1)).toBe("2026-11-09");
  });

  it("a count of check-ins in the range only, never a share of the days", () => {
    const days = weeksDays("2026-11-09", 2);
    expect(checkInCount([row("2026-11-09", 3), row("2026-11-01", 4), row("2026-10-01", 2)], days)).toBe(2);
  });

  it("an average only with at least 3 values, as Insights; days without one don't count", () => {
    const days = weeksDays("2026-11-09", 2);
    expect(rangeAverage([row("2026-11-09", 3), row("2026-11-08", 4)], days, "mood").average).toBeNull();
    expect(rangeAverage([row("2026-11-09", 3), row("2026-11-08", 4), row("2026-11-07", 4)], days, "mood").average).toBe(3.7);
    expect(rangeAverage([row("2026-11-09", 3), row("2026-11-08", 4), row("2026-11-07", 4)], days, "stress").average).toBeNull();
  });

  it("a first line: the first that isn't blank, cut at 120 on a word boundary with …", () => {
    expect(firstLine("\n  \nA short day.\nMore here.")).toBe("A short day.");
    const long = "word ".repeat(40).trim();
    const cut = firstLine(long);
    expect(cut.endsWith("…")).toBe(true);
    expect([...cut].length).toBeLessThanOrEqual(121);
    expect(cut.slice(0, -1).endsWith("word")).toBe(true);
  });

  it("starred entries in the range, oldest first", () => {
    const days = weeksDays("2026-11-09", 2);
    const got = starredIn(
      [
        { id: "b", entry_date: "2026-11-09", body: "Later" },
        { id: "a", entry_date: "2026-11-01", body: "Earlier" },
        { id: "z", entry_date: "2026-09-01", body: "Out of range" },
      ],
      days,
    );
    expect(got.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("what the summary reads: check-ins and starred entries, nothing else (the Reviewer's read)", () => {
  it("the page queries only those two tables", () => {
    const page = readFileSync("src/app/[locale]/app/me/appointment/page.tsx", "utf8");
    const tables = [...page.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(["check_ins", "entries"]);
    for (const never of contract.neverIncluded) expect(page.includes(`"${never}"`), never).toBe(false);
    expect(page).toContain('.eq("is_moment", true)');
  });
});

describe("appointment words, in every language", () => {
  // Scoring and clinical words, beyond the diagnosis lists (the Reviewer's read; fr, es, pt-BR
  // too, UX). de, it and th are drafts: their lists come with their native read.
  const SCORING: Partial<Record<(typeof LANGUAGES)[number], string[]>> = {
    en: ["symptom", "severity", "score", "episode", "disorder", "diagnos"],
    fr: ["symptôme", "sévérité", "gravité", "score", "épisode", "trouble", "diagnost"],
    es: ["síntoma", "severidad", "gravedad", "puntuación", "episodio", "trastorno", "diagnóst"],
    "pt-br": ["sintoma", "severidade", "gravidade", "pontuação", "episódio", "transtorno", "diagnóst"],
  };
  it("every language has en's keys, none empty", () => {
    const en = messages("en").appointment;
    for (const l of LANGUAGES) {
      const a = messages(l).appointment;
      expect(Object.keys(a).sort(), l).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(a)) expect(v.trim(), `${l} ${k}`).not.toBe("");
    }
  });

  it("no diagnosis or scoring word: the footer, headings and the charts' own labels included", () => {
    for (const l of LANGUAGES) {
      const m = messages(l);
      const shown = { ...m.appointment, chartMood: m.insights.chartMood, chartSleep: m.insights.chartSleep, chartStress: m.insights.chartStress, chartExercise: m.insights.chartExercise, chartAverage: m.insights.chartAverage, chartAverageOfFive: m.insights.chartAverageOfFive };
      const words = [...(yourWeek.diagnosisWords as Record<string, string[]>)[l], ...(SCORING[l] ?? [])];
      for (const [k, v] of Object.entries(shown)) {
        const text = v.toLocaleLowerCase(l);
        for (const w of words) expect(text.includes(w), `${l} ${k}: "${w}"`).toBe(false);
      }
    }
  });

  it("the count has no denominator: never 'of N'", () => {
    for (const l of LANGUAGES) expect(messages(l).appointment.count, l).not.toMatch(/\{(days|total|of)\b|\/\s*\{/);
    expect(messages("en").appointment.count).not.toMatch(/\bof\b/);
  });

  it("the footer says both things, in every language", () => {
    expect(messages("en").appointment.footer).toBe("Made by you from your own Moodbow entries. Not a medical assessment.");
    for (const l of LANGUAGES) expect(messages(l).appointment.footer.split(/[.。]\s*/).filter(Boolean).length, l).toBeGreaterThanOrEqual(l === "th" ? 1 : 2);
  });
});
