// Generates the mood-prompts contract (1.4 E; specs/1.4-features.md §E, UX 18 Nov) from the rules
// alone: it reads only the two prompt lists (ids and their order) and works out each case's
// expected prompt here, sharing no code with the web or the app, so the file can't just echo one
// implementation (the Mobile Dev's ask). It belongs in moodbow-app beside the contract
// (tool/gen_mood_prompts_contract.mjs) once the Mobile Dev moves it into supabase/contracts.
//
// node scripts/gen-mood-prompts-contract.mjs <prompts.json> <prompts-library.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , dailyPath, libraryPath, outPath] = process.argv;
const daily = JSON.parse(readFileSync(dailyPath, "utf8")).prompts.map((p) => p.id);
const groups = Object.fromEntries(JSON.parse(readFileSync(libraryPath, "utf8")).groups.map((g) => [g.id, { help: g.help, ids: g.prompts.map((p) => p.id) }]));

const RULES = {
  moodGroup: { 1: "hard-days", 2: "hard-days", 3: "noticing", 4: "gratitude", 5: "gratitude" },
};

// Days since 1970-01-01 of a YYYY-MM-DD date (the profile's date), by calendar arithmetic.
function dayNumber(date) {
  const [y, m, d] = date.split("-").map(Number);
  const days = (yy) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0 ? 366 : 365;
  const monthDays = [31, days(y) === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = 0;
  for (let yy = 1970; yy < y; yy++) n += days(yy);
  for (let mm = 1; mm < m; mm++) n += monthDays[mm - 1];
  return n + d - 1;
}
const mod = (a, n) => ((a % n) + n) % n;

// One case's expected suggestion. another: how many times "Another" was pressed. place: Plus's saved
// place in the matched group (the library's per-group place on the device).
function expected({ today, mood, flagged, plus, place = 0, another = 0 }) {
  if (flagged) return { source: "none" };
  const dn = dayNumber(today);
  if (mood === null) return { source: "daily", prompt: daily[mod(dn + another, daily.length)], help: false };
  const group = RULES.moodGroup[mood];
  const g = groups[group];
  if (plus) return { source: "group", group, prompt: g.ids[mod(place + another, g.ids.length)], help: g.help, savedPlace: place + another };
  if (another === 0) return { source: "group", group, prompt: g.ids[mod(dn, g.ids.length)], help: g.help };
  // Free's "Another": the ordinary daily list, from the day's own prompt on.
  return { source: "daily", prompt: daily[mod(dn + another - 1, daily.length)], help: false };
}

const C = (name, input) => ({ name, ...input, expect: expected(input) });
const base = { flagged: false, plus: false };
const cases = [
  C("mood 2 is hard-days, with its help", { ...base, today: "2026-11-18", mood: 2 }),
  C("mood 1 is hard-days too", { ...base, today: "2026-11-18", mood: 1 }),
  C("mood 3 is noticing", { ...base, today: "2026-11-18", mood: 3 }),
  C("mood 4 is gratitude", { ...base, today: "2026-11-18", mood: 4 }),
  C("mood 5 is gratitude too", { ...base, today: "2026-11-18", mood: 5 }),
  C("the same day, the check-in edited to 2 later: the group follows (morning, 4)", { ...base, today: "2026-11-19", mood: 4 }),
  C("the same day, the check-in edited to 2 later: the group follows (evening, 2)", { ...base, today: "2026-11-19", mood: 2 }),
  C("no check-in today: today's daily prompt, unchanged", { ...base, today: "2026-11-18", mood: null }),
  C("no check-in today, Another: the daily list's next", { ...base, today: "2026-11-18", mood: null, another: 1 }),
  C("Free, Another once: back to the daily list, the day's own prompt", { ...base, today: "2026-11-18", mood: 3, another: 1 }),
  C("Free, Another twice: the daily list's next", { ...base, today: "2026-11-18", mood: 3, another: 2 }),
  C("Free, month boundary: 30 November", { ...base, today: "2026-11-30", mood: 4 }),
  C("Free, month boundary: 1 December", { ...base, today: "2026-12-01", mood: 4 }),
  C("Free, year boundary: 31 December", { ...base, today: "2026-12-31", mood: 3 }),
  C("Free, year boundary: 1 January", { ...base, today: "2027-01-01", mood: 3 }),
  C("Free, a leap day", { ...base, today: "2028-02-29", mood: 1 }),
  C("the profile's date, not UTC: late evening in Auckland is already the 19th", { ...base, today: "2026-11-19", mood: 3 }),
  C("Plus resumes at its saved place", { ...base, plus: true, today: "2026-11-18", mood: 3, place: 2 }),
  C("Plus, Another steps within the group and saves the place", { ...base, plus: true, today: "2026-11-18", mood: 3, place: 2, another: 1 }),
  C("Plus wraps round the group", { ...base, plus: true, today: "2026-11-18", mood: 4, place: 5, another: 1 }),
  C("Plus, hard-days keeps its help", { ...base, plus: true, today: "2026-11-18", mood: 1, place: 0 }),
  C("Plus, no check-in today: the daily prompt", { ...base, plus: true, today: "2026-11-18", mood: null }),
  C("a flagged day: no prompt at all, whatever the mood", { ...base, flagged: true, today: "2026-11-18", mood: 2 }),
  C("a flagged day with Plus: no prompt at all", { ...base, flagged: true, plus: true, today: "2026-11-18", mood: 4, place: 1 }),
  C("a flagged day, no check-in: no prompt at all", { ...base, flagged: true, today: "2026-11-18", mood: null }),
];

const contract = {
  version: 1,
  about:
    "Prompts that follow your mood (1.4 E; specs/1.4-features.md §E, UX 18 Nov). On Write, above an empty entry. flagged (an entry or tag today that the crisis matcher flags): no prompt at all. No check-in today (mood null): prompts.json's daily prompt, daily[dayNumber(today) mod N], Another stepping through the daily list. With today's check-in mood (its current value; an edit later that day moves the group): mood 1-2 hard-days, 3 noticing, 4-5 gratitude. Free: one prompt a day, group[dayNumber(today) mod group length]; Another falls back to the daily list from the day's own prompt (another=1) on, never a second group prompt. Plus: group[(place + another) mod length], savedPlace = place + another (the library's per-group place on the device). help: the group's help (hard-days true): Get help now under the prompt, never counted. dayNumber: days since 1970-01-01 of the profile's date (YYYY-MM-DD), not UTC. No new analytics: prompt_used stays a name only. Generated by scripts/gen-mood-prompts-contract.mjs from the two prompt lists alone.",
  rules: RULES,
  cases,
};
writeFileSync(outPath, JSON.stringify(contract, null, 2) + "\n");
console.log(`${cases.length} cases`);
