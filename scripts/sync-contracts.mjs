// Copies the shared contracts from the app repo (supabase/contracts) into
// content/contracts, byte for byte, and pins what was copied in
// content/contracts/SOURCE.json (the app commit and each file's SHA-256).
// The app repo is the source of truth (decision 99); the web never edits
// these files, it re-syncs them. src/lib/contracts.test.ts fails if a file
// no longer matches its pin (an editor stripping trailing spaces, say).
//
//   node scripts/sync-contracts.mjs [ref]     (default: the app's master)
//
// Needs the GitHub CLI (gh), signed in with read access to the app repo.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "BurrowSoft/moodbow-app";
const DIR = "supabase/contracts";
export const FILES = ["appointment.json", "bo.md", "colour-map.json", "countries.json", "crisis-keywords.json", "errors.md", "export-csv.json", "export-text.md", "export_fixture.json", "export_fixture.txt", "get-help-label.json", "letters.json", "mood-faces.json", "mood-prompts.json", "on-this-day.json", "patterns.json", "plus-entitlement.json", "prompts-library.json", "prompts.json", "reflect.md", "reminders.json", "report.md", "safety-plan.json", "search-fold.json", "share-cards.json", "showed-up.json", "toolbox.json", "what-lifts-me.json", "year-card.json", "year-review.json", "your-week.json"];

// Files held at another app commit than the one synced, with why. Each is listed in SOURCE.json's
// "held". Drop an entry once the app's master carries that file's version.
// export-csv.json, export-text.md, export_fixture.json: app #241's changes (pictures, letter
// reminders) need the web's export code first (UX, 19 Nov: a feature PR right after the 1.3.2
// re-sync); before that they waited for the full re-sync after the pilot (UX, round 3: the Reviewer's #3-#5), so the
// crisis-keywords v4 sync (app #248) moves only the crisis list; these stay at the previous pin.
const PREVIOUS_PIN = "457f4396add9b06e1b10e67b22d9f5308fbdacfa";
export const HELD = {
  "export-csv.json": PREVIOUS_PIN,
  "export-text.md": PREVIOUS_PIN,
  "export_fixture.json": PREVIOUS_PIN,
  // plus-entitlement.json: 041's past_due grace (moodbow-app #262), not on app master until it merges.
  "plus-entitlement.json": "a1fdedea7c957b8f4178a9bde4bb0f8433e0c3c0",
};

const gh = (path, accept) => execFileSync("gh", ["api", ...(accept ? ["-H", `Accept: ${accept}`] : []), path], { stdio: ["ignore", "pipe", "inherit"] });

const ref = process.argv[2] ?? "master";
const commit = gh(`repos/${REPO}/commits/${ref}`).toString().match(/"sha":\s*"([0-9a-f]{40})"/)[1];
const out = join(import.meta.dirname, "..", "content", "contracts");
const pins = {};
for (const name of FILES) {
  const bytes = gh(`repos/${REPO}/contents/${DIR}/${name}?ref=${HELD[name] ?? commit}`, "application/vnd.github.raw");
  writeFileSync(join(out, name), bytes);
  pins[name] = createHash("sha256").update(bytes).digest("hex");
  console.log(`${name}  ${bytes.length} bytes  ${pins[name].slice(0, 12)}${HELD[name] ? `  (held at ${HELD[name].slice(0, 7)})` : ""}`);
}
writeFileSync(join(out, "SOURCE.json"), `${JSON.stringify({ repo: REPO, path: DIR, commit, held: HELD, sha256: pins }, null, 2)}\n`);
console.log(`pinned to ${REPO}@${commit.slice(0, 7)}`);
