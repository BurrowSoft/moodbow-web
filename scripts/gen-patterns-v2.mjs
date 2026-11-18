// patterns.json version 2 (1.4 F, PLAN-routine.md §4, UX 18 Nov): version 1 as it is, plus routine
// items as a factor. The routine cases' expectations are worked out here from the rules alone,
// sharing no code with the web or the app. It belongs in moodbow-app beside the contract
// (tool/gen_patterns_v2.mjs) once the Mobile Dev commits it on feat/routine-038.
//
// node scripts/gen-patterns-v2.mjs <patterns.json v1> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const v1 = JSON.parse(readFileSync(inPath, "utf8"));
if (v1.version !== 1) throw new Error("expects version 1");
const R = v1.rules;
const TODAY = v1.today;

// Days by calendar arithmetic on YYYY-MM-DD in UTC (no time zones: these are the profile's dates).
const addDays = (date, n) => {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};
const days = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const windowFirst = addDays(TODAY, -(R.windowDays - 1));
// One decimal, halves away from zero, -0 as 0.
const round1 = (x) => {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10;
  return r === 0 ? 0 : r;
};
const avg = (ms) => round1(ms.reduce((a, b) => a + b, 0) / ms.length);

function expected(rows, items) {
  const inWindow = rows.filter((r) => r.local_date >= windowFirst && r.local_date <= TODAY && r.mood != null);
  const ordered = [...items].sort((x, y) => x.position - y.position);
  const none = (id, state) => ({ id, state, a: null, b: null, diff: null });
  if (inWindow.length < R.minCheckIns) return ordered.map((i) => none(i.id, "not_enough"));
  return ordered.map((item) => {
    const a = [];
    const b = [];
    for (const r of inWindow) {
      if (r.local_date < item.started_on) continue;
      (item.ticks.includes(r.local_date) ? a : b).push(r.mood);
    }
    if (a.length < R.minPerSide || b.length < R.minPerSide) return none(item.id, "not_enough");
    const sa = { days: a.length, mood: avg(a) };
    const sb = { days: b.length, mood: avg(b) };
    const diff = round1(sa.mood - sb.mood);
    return diff >= R.sameBelow ? { id: item.id, state: "shown", a: sa, b: sb, diff } : none(item.id, "hidden");
  });
}

const row = (local_date, mood) => ({ local_date, mood, sleep_hours: null, exercise_minutes: null, stress: null });
const run = (from, to, mood) => days(from, to).map((d) => row(d, mood));
const C = (name, rows, routine) => ({ name, rows, routine, expect: expected(rows, routine) });

const tenTicked = days("2026-10-26", "2026-11-04");
const routineCases = [
  C("shown: ticked days higher (10 at 4, 10 others at 2)", [...run("2026-10-16", "2026-10-25", 2), ...run("2026-10-26", "2026-11-04", 4)], [
    { id: "r1", position: 0, started_on: "2026-09-01", ticks: tenTicked },
  ]),
  C("started mid-window: the 20 earlier days never count as not ticked", [...run("2026-10-06", "2026-10-25", 1), ...run("2026-10-26", "2026-10-30", 5), ...run("2026-10-31", "2026-11-04", 3)], [
    { id: "r1", position: 0, started_on: "2026-10-26", ticks: days("2026-10-26", "2026-10-30") },
  ]),
  C("lower on ticked days: hidden, no numbers (never a lower line)", [...run("2026-10-16", "2026-10-25", 4), ...run("2026-10-26", "2026-11-04", 2)], [
    { id: "r1", position: 0, started_on: "2026-09-01", ticks: tenTicked },
  ]),
  C("about the same: hidden, no numbers", [...run("2026-10-16", "2026-11-04", 3)], [{ id: "r1", position: 0, started_on: "2026-09-01", ticks: tenTicked }]),
  C("higher by exactly sameBelow (3.5 vs 3.0): shown", [...run("2026-10-16", "2026-10-25", 3), ...run("2026-10-26", "2026-10-30", 4), ...run("2026-10-31", "2026-11-04", 3)], [
    { id: "r1", position: 0, started_on: "2026-09-01", ticks: tenTicked },
  ]),
  C("higher but under sameBelow (3.4 vs 3.0): hidden", [...run("2026-10-16", "2026-10-25", 3), ...run("2026-10-26", "2026-10-29", 4), ...run("2026-10-30", "2026-11-04", 3)], [
    { id: "r1", position: 0, started_on: "2026-09-01", ticks: tenTicked },
  ]),
  C("started 4 days ago: not enough on one side", run("2026-10-16", "2026-11-04", 3), [{ id: "r1", position: 0, started_on: "2026-11-01", ticks: days("2026-11-01", "2026-11-04") }]),
  C("under 14 check-ins in the window: every item not_enough", run("2026-10-23", "2026-11-04", 4), [
    { id: "r1", position: 0, started_on: "2026-09-01", ticks: days("2026-10-23", "2026-10-28") },
  ]),
  C("two items given out of order: position order; one shown, one hidden", [...run("2026-10-16", "2026-10-25", 2), ...run("2026-10-26", "2026-11-04", 4)], [
    { id: "walk", position: 1, started_on: "2026-09-01", ticks: days("2026-10-16", "2026-10-25") },
    { id: "meds", position: 0, started_on: "2026-09-01", ticks: tenTicked },
  ]),
  C("ticks with no check-in, after today or before started_on count for nothing", [...run("2026-10-16", "2026-10-25", 2), ...run("2026-10-26", "2026-11-04", 4)], [
    { id: "r1", position: 0, started_on: "2026-10-16", ticks: ["2026-10-10", "2026-10-15", ...tenTicked, "2026-11-05", "2026-11-20"] },
  ]),
  C("rows outside the window (today - 90, tomorrow) are ignored", [row(addDays(TODAY, -90), 1), row(addDays(TODAY, 1), 1), ...run("2026-10-16", "2026-10-25", 2), ...run("2026-10-26", "2026-11-04", 4)], [
    { id: "r1", position: 0, started_on: "2026-08-01", ticks: [addDays(TODAY, -90), addDays(TODAY, 1), ...tenTicked] },
  ]),
];

const v2 = {
  ...v1,
  version: 2,
  about: `${v1.about} Version 2 (1.4 F, PLAN-routine.md §4; UX 18 Nov): routineCases add the person's routine items (routine: [{id, position, started_on, ticks: [dates]}]) as one factor each, in position order, with the same window, gate (minCheckIns over all check-ins in the window), minPerSide and rounding. Only check-in days on or after the item's started_on count: a = ticked, b = the other check-in days; days before started_on are never not ticked, and a tick without a check-in that day counts for nothing. SAFETY (UX): an item may be a medication, so a line shows only when diff >= sameBelow (ticked days higher): state shown with a, b and diff; lower or about the same is state hidden with a, b and diff null, never a line; not_enough as the others. Under any routine line, copy.routineFootnote. The appointment summary never compares moods for routine (appointment.json).`,
  copy: {
    ...v1.copy,
    routineShown: "On days you ticked {name}, your mood averaged {a} of 5. On other days, {b}.",
    routineFootnote: "This may show what tends to go together, not what causes what. Never change a medication without talking to your doctor or pharmacist.",
  },
  routineCases,
};
writeFileSync(outPath, JSON.stringify(v2, null, 2) + "\n");
console.log(`${routineCases.length} routine cases`);
