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
export const FILES = ["bo.md", "colour-map.json", "countries.json", "crisis-keywords.json", "export-csv.json", "export-text.md", "export_fixture.json", "export_fixture.txt", "get-help-label.json", "mood-faces.json", "on-this-day.json", "patterns.json", "prompts-library.json", "prompts.json", "reflect.md", "report.md", "safety-plan.json", "search-fold.json", "share-cards.json", "toolbox.json", "what-lifts-me.json", "year-card.json", "your-week.json"];

// Files held at another app commit than the one synced, with why. Each is listed in SOURCE.json's
// "held". Drop an entry once the app's master carries that file's version.
// toolbox.json: v2 (Plus breathing patterns, migration 030) is on the app's contracts/toolbox branch only (d6b9cd5); its
// master (1.3.0) still has v1, which the web's Breathing has moved past.
export const HELD = { "toolbox.json": "d6b9cd52a8cb56fd12dd404763bfda9358e619cc" };

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
