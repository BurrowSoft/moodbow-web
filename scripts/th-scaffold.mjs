// The Thai message scaffold (1.1 F prep): src/messages/th.json with the same
// keys as en.json, filled from the Thai column of the copy spec
// (r1-screens-and-copy.md) wherever r1's English for that key still equals
// ours; everything else keeps the English text for now and is listed in
// src/messages/th-draft.json for UX & PM to translate. Thai isn't offered
// anywhere until a native speaker has read every string (thai_reviewed).
//
//   node scripts/th-scaffold.mjs <path to r1-screens-and-copy.md>

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";

// A message's ICU arguments with their kind ({value} plain, {range, select …},
// {n, plural …}), from the parsed message: branch text isn't an argument,
// and a select used as a plain {range} would show the raw English value.
export function icuArgs(message) {
  const names = new Set();
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.type !== 0 && n.type !== 7 && n.value) names.add(`${n.value}:${n.type === 5 ? "select" : "value"}`);
      if (n.options) for (const o of Object.values(n.options)) walk(o.value);
      if (n.children) walk(n.children);
    }
  };
  try {
    walk(new IntlMessageFormat(message, "en", undefined, { ignoreTag: true }).getAst());
  } catch {
    names.add("(unparsable)");
  }
  return [...names].sort().join(",");
}

const r1Path = process.argv[2];
if (!r1Path) throw new Error("usage: node scripts/th-scaffold.mjs <r1-screens-and-copy.md>");

// r1's tables: | key | en | th |. A key may appear more than once (the
// same string on several screens); the first row wins.
const r1 = new Map();
for (const line of readFileSync(r1Path, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\|\s*([A-Za-z][A-Za-z0-9_]*)\s*\|(.*)\|(.*)\|\s*$/);
  if (!m || m[1] === "Key") continue;
  const [, key, en, th] = m.map((s) => s.trim());
  if (!r1.has(key)) r1.set(key, { en, th });
}

const root = join(import.meta.dirname, "..");
const en = JSON.parse(readFileSync(join(root, "src/messages/en.json"), "utf8"));
const drafts = [];

// Same structure; each leaf from r1 when the English matches and a Thai
// string exists, else the English plus a th-draft entry with the reason.
function walk(node, path) {
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === "object") {
      out[k] = walk(v, p);
      continue;
    }
    const row = r1.get(k);
    // r1's English cell may end with a note for the team in parentheses
    // ("… again. (When the session was revoked …)"): compare without it.
    const r1en = row && !String(v).endsWith(")") ? row.en.replace(/\s+\([^()]*\)$/, "") : row?.en;
    const sameArgs = row?.th ? icuArgs(row.th) === icuArgs(v) : false;
    if (row && row.th && r1en === v && sameArgs) out[k] = row.th;
    else {
      out[k] = v;
      const reason = !row ? "not in r1" : !row.th ? "no Thai in r1" : r1en !== v ? "English changed since r1" : "Thai's placeholders differ from English";
      drafts.push({ key: p, en: v, reason, r1en: row && r1en !== v ? row.en : undefined, r1th: reason === "Thai's placeholders differ from English" ? row.th : undefined });
    }
  }
  return out;
}

const th = walk(en, "");
writeFileSync(join(root, "src/messages/th.json"), `${JSON.stringify(th, null, 2)}\n`);
writeFileSync(join(root, "src/messages/th-draft.json"), `${JSON.stringify(drafts, null, 2)}\n`);
console.log(`th.json written; ${drafts.length} strings need Thai (th-draft.json)`);
