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
export const FILES = ["colour-map.json", "countries.json", "crisis-keywords.json", "export-text.md", "export_fixture.json", "export_fixture.txt", "get-help-label.json", "mood-faces.json", "reflect.md"];

const gh = (path, accept) => execFileSync("gh", ["api", ...(accept ? ["-H", `Accept: ${accept}`] : []), path], { stdio: ["ignore", "pipe", "inherit"] });

const ref = process.argv[2] ?? "master";
const commit = gh(`repos/${REPO}/commits/${ref}`).toString().match(/"sha":\s*"([0-9a-f]{40})"/)[1];
const out = join(import.meta.dirname, "..", "content", "contracts");
const pins = {};
for (const name of FILES) {
  const bytes = gh(`repos/${REPO}/contents/${DIR}/${name}?ref=${commit}`, "application/vnd.github.raw");
  writeFileSync(join(out, name), bytes);
  pins[name] = createHash("sha256").update(bytes).digest("hex");
  console.log(`${name}  ${bytes.length} bytes  ${pins[name].slice(0, 12)}`);
}
writeFileSync(join(out, "SOURCE.json"), `${JSON.stringify({ repo: REPO, path: DIR, commit, sha256: pins }, null, 2)}\n`);
console.log(`pinned to ${REPO}@${commit.slice(0, 7)}`);
