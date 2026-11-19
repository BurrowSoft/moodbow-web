// For my appointment's Routine section (1.4 F, PLAN-routine.md §5, UX 18 Nov): adds the rule and its
// cases to content/appointment.json, the expectations worked out here from the rules alone.
// - only items with in_appointment true; none of them: no section at all (null);
// - per item, in position order: of the check-in days in the range on or after its started_on, the
//   share that have its tick, as a whole number (halves up); fewer than routineMinDays such days:
//   not_enough ("not enough days yet");
// - never a mood comparison (UX's medication safety ruling): % ticked only.
//
// node scripts/gen-appointment-routine.mjs <appointment.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const base = JSON.parse(readFileSync(inPath, "utf8"));
const MIN_DAYS = 5;
const TODAY = "2026-11-04";

const addDays = (date, n) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const days = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

function expected(today, weeks, checkIns, items) {
  const first = addDays(today, -(weeks * 7 - 1));
  const inRange = new Set(checkIns.filter((d) => d >= first && d <= today));
  const opted = items.filter((i) => i.in_appointment).sort((a, b) => a.position - b.position);
  if (opted.length === 0) return null;
  return opted.map((item) => {
    const counted = [...inRange].filter((d) => d >= item.started_on);
    if (counted.length < MIN_DAYS) return { id: item.id, state: "not_enough" };
    const ticked = counted.filter((d) => item.ticks.includes(d)).length;
    // Whole number, halves up, by integer arithmetic (no floating point at .5).
    const percent = Math.floor((ticked * 200 + counted.length) / (counted.length * 2));
    return { id: item.id, state: "percent", percent };
  });
}

const C = (name, input) => ({ name, ...input, expect: expected(input.today, input.weeks, input.checkIns, input.routine) });
const twenty = days("2026-10-16", "2026-11-04");
const item = (id, position, over = {}) => ({ id, position, in_appointment: true, started_on: "2026-09-01", ticks: [], ...over });

const routineCases = [
  C("one opted-in item: 15 of 20 check-in days ticked is 75", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("meds", 0, { ticks: twenty.slice(0, 15) })] }),
  C("no item opted in: no section at all", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("meds", 0, { in_appointment: false, ticks: twenty })] }),
  C("no items at all: no section", { today: TODAY, weeks: 4, checkIns: twenty, routine: [] }),
  C("an item not opted in is left out; the opted one stays", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("walk", 0, { in_appointment: false, ticks: twenty }), item("meds", 1, { ticks: twenty.slice(0, 10) })] }),
  C("started in the range: only its days count (2 of 5 is 40)", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("meds", 0, { started_on: "2026-10-31", ticks: ["2026-10-31", "2026-11-02"] })] }),
  C("fewer than 5 check-in days since it started: not enough days yet", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("meds", 0, { started_on: "2026-11-01", ticks: ["2026-11-01"] })] }),
  C("rounding: 1 of 6 is 16.7, so 17; 2 of 6 is 33.3, so 33", { today: TODAY, weeks: 4, checkIns: days("2026-10-30", "2026-11-04"), routine: [item("one", 0, { started_on: "2026-10-30", ticks: ["2026-10-30"] }), item("two", 1, { started_on: "2026-10-30", ticks: ["2026-10-30", "2026-10-31"] })] }),
  C("rounding: 1 of 8 is 12.5, halves up to 13", { today: TODAY, weeks: 4, checkIns: days("2026-10-28", "2026-11-04"), routine: [item("meds", 0, { started_on: "2026-10-28", ticks: ["2026-10-30"] })] }),
  C("rounding: 5 of 6 is 83.3, so 83", { today: TODAY, weeks: 4, checkIns: days("2026-10-30", "2026-11-04"), routine: [item("six", 0, { started_on: "2026-10-30", ticks: days("2026-10-30", "2026-11-03") })] }),
  C("two opted items in position order; ticks with no check-in that day count for nothing", { today: TODAY, weeks: 4, checkIns: twenty, routine: [item("b", 1, { ticks: ["2026-10-01", "2026-10-10", ...twenty.slice(0, 5)] }), item("a", 0, { ticks: twenty })] }),
  C("the range: 2 weeks counts only its 14 days", { today: TODAY, weeks: 2, checkIns: twenty, routine: [item("meds", 0, { ticks: twenty.slice(0, 13) })] }),
  C("check-ins outside the range (before it, after today) are ignored", { today: TODAY, weeks: 2, checkIns: ["2026-10-01", ...twenty, "2026-11-05"], routine: [item("meds", 0, { ticks: ["2026-10-01", "2026-11-05", ...twenty.slice(10)] })] }),
];

const out = {
  ...base,
  about: `${base.about} Routine (1.4 F, PLAN-routine.md §5, UX 18 Nov): a Routine section with only the items the person opted in (in_appointment); with none, no section (expect null). Per item, in position order, of the range's check-in days on or after its started_on: the share with its tick, as a whole number, halves up (state percent); fewer than rules.routineMinDays such days: state not_enough ("not enough days yet"). Never a mood comparison for routine (UX's medication safety ruling). routineCases: {today, weeks, checkIns: [dates], routine: [{id, position, in_appointment, started_on, ticks}], expect}.`,
  rules: { ...base.rules, routineMinDays: MIN_DAYS },
  routineCases,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${routineCases.length} routine cases`);
