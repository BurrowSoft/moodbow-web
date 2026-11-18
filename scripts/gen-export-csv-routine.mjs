// export-csv.json with routineCases (1.4 F; UX 18 Nov): the existing cases stay byte for byte as
// the Routine-flag-off file; routineCases are the flag-on file, whose header gains a last column
// `routine` with that day's ticked item names in position order, " | " joined, a "|" in a name
// written as "/" (exactly as tags). The expected CSV of each case is written out here by hand, not
// rendered by either client. For moodbow-app's feat/routine-038.
//
// node scripts/gen-export-csv-routine.mjs <export-csv.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
const base = JSON.parse(readFileSync(inPath, "utf8"));
const BOM = String.fromCharCode(0xfeff);
const HEADER = "date,mood,mood_word,sleep_hours,sleep_quality,movement_minutes,stress,moment,tags,note,routine";
const file = (...rows) => `${BOM}${[HEADER, ...rows].join("\r\n")}\r\n`;
const doc = (extra) => ({ format: "moodbow-export", format_version: 1, exported_at: "2026-10-21T09:00:00Z", account: { email: "a@example.com" }, ...extra });
const ci = (local_date, mood) => ({ local_date, mood, sleep_hours: null, sleep_quality: null, exercise_minutes: null, stress: null });

const routineCases = [
  {
    name: "routine on: the day's ticked items in position order, ' | ' joined, a '|' written as '/', on each of the day's rows",
    locale: "en",
    input: doc({
      check_ins: [ci("2026-10-01", 4), ci("2026-10-02", 2), ci("2026-10-03", 3)],
      check_in_tags: [{ local_date: "2026-10-01", tag: "Walk" }],
      entries: [
        { id: "t1", entry_date: "2026-10-01", body: "Morning.", is_moment: false },
        { id: "t2", entry_date: "2026-10-01", body: "Evening.", is_moment: true },
      ],
      routine: [
        { name: "Walk outside", position: 1, in_appointment: false, started_on: "2026-09-20", created_at: "2026-09-20T08:00:00Z", ticks: ["2026-10-01", "2026-10-02"] },
        { name: "Meds|AM", position: 0, in_appointment: true, started_on: "2026-09-20", created_at: "2026-09-20T08:01:00Z", ticks: ["2026-10-01", "2026-10-03"] },
      ],
    }),
    csv: file(
      "2026-10-01,4,Good,,,,,,Walk,Morning.,Meds/AM | Walk outside",
      "2026-10-01,4,Good,,,,,yes,Walk,Evening.,Meds/AM | Walk outside",
      "2026-10-02,2,Bad,,,,,,,,Walk outside",
      "2026-10-03,3,Okay,,,,,,,,Meds/AM",
    ),
  },
  {
    name: "routine on, a name with a comma: the cell is quoted",
    locale: "en",
    input: doc({
      check_ins: [ci("2026-10-01", 5)],
      routine: [{ name: "Tea, no sugar", position: 0, in_appointment: false, started_on: "2026-10-01", created_at: "2026-10-01T08:00:00Z", ticks: ["2026-10-01"] }],
    }),
    csv: file('2026-10-01,5,Great,,,,,,,,"Tea, no sugar"'),
  },
  {
    name: "routine on, no routine items: the column is there and empty",
    locale: "en",
    input: doc({ check_ins: [ci("2026-10-01", 4)], entries: [{ id: "t1", entry_date: "2026-10-01", body: "Fine.", is_moment: false }] }),
    csv: file("2026-10-01,4,Good,,,,,,,Fine.,"),
  },
  {
    name: "routine on, an empty journal: the header only",
    locale: "en",
    input: doc({}),
    csv: file(),
  },
];

const out = {
  ...base,
  $comment: `${base.$comment} routineCases (1.4 F, UX 18 Nov): the file while the Routine flag is on (app ROUTINE, web routine-live): the header's last column is routine, that day's ticked item names in position order, " | " joined, a "|" in a name written as "/" (as tags); the cases above stay the flag-off file byte for byte. Their CSV is written by hand in moodbow-web's scripts/gen-export-csv-routine.mjs.`,
  routineCases,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${routineCases.length} routine cases`);
