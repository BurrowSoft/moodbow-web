// Writes src/lib/helpGates.json: for each Help article, in each language, which
// {pending:…} blocks decide whether anything is left to publish. The proxy reads it
// to send a hidden or missing article to the real not-found page before anything
// renders (a notFound() in the page gets Next's bare error shell; see proxy.ts).
// Run after changing content/help: node scripts/help-gates.mjs
// (src/lib/helpGates.test.ts fails while the file is stale.)
//
// A gate is `true` (the article has text of its own) or a list of blocks, any of
// which publishes it: { ids, then } is published when any of ids is met and its
// own content (another gate) is.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN = /\{pending:([a-z_]+(?:\|[a-z_]+)*)\}|\{\/pending\}/g;

export function gateOf(source) {
  const text = source.replace(/<!--[\s\S]*?-->/g, "");
  const root = { own: false, blocks: [] };
  const stack = [root];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (text.slice(at, m.index).trim()) stack.at(-1).own = true;
    at = m.index + m[0].length;
    if (m[1]) {
      const node = { ids: m[1].split("|"), own: false, blocks: [] };
      stack.at(-1).blocks.push(node);
      stack.push(node);
    } else {
      if (stack.length === 1) throw new Error("unbalanced {/pending}");
      stack.pop();
    }
  }
  if (stack.length !== 1) throw new Error("unclosed {pending:…}");
  if (text.slice(at).trim()) root.own = true;
  const fold = (n) => (n.own ? true : n.blocks.map((b) => ({ ids: b.ids, then: fold(b) })));
  return fold(root);
}

export function buildGates(helpDir) {
  const out = {};
  for (const locale of readdirSync(helpDir).sort()) {
    out[locale] = {};
    for (const file of readdirSync(join(helpDir, locale)).filter((f) => f.endsWith(".md")).sort()) {
      const raw = readFileSync(join(helpDir, locale, file), "utf8").replace(/\r\n/g, "\n");
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
      out[locale][file.slice(0, -3)] = gateOf(body);
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  writeFileSync(join(root, "src/lib/helpGates.json"), `${JSON.stringify(buildGates(join(root, "content/help")), null, 1)}\n`);
  console.log("wrote src/lib/helpGates.json");
}
