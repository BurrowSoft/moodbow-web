// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fr from "./fr.json";

// French typography (1.4.3, UX 27 Nov): before ? ! : ; a no-break space (U+00A0, the one every fr string already
// uses), never an ordinary one. An ordinary space lets the line break before the mark, and a lone «?» on its own
// line reads as a typo. The app's ARB has the same guard. Only an ORDINARY space fails: "{label}: {value}"
// (export.exportField, pinned by the shared contract export-text.md, as in the app) has none and stays, and so
// does a time (7:30). Anything inside a URL is skipped.
const MARKS = "?!:;";

// Each ordinary space before a mark in `text`, as a short snippet; `skip` marks positions that aren't prose.
function ordinarySpacesBeforeMarks(text: string, skip: boolean[] = []): string[] {
  const out: string[] = [];
  const urls = [...text.matchAll(/https?:\/\/\S+/g)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  for (let i = 1; i < text.length; i++) {
    if (!MARKS.includes(text[i]) || text[i - 1] !== " " || skip[i] || skip[i - 1]) continue;
    if (urls.some(([a, b]) => i >= a && i < b)) continue;
    out.push(JSON.stringify(text.slice(Math.max(0, i - 30), i + 1)));
  }
  return out;
}

// What isn't prose in a help page: fenced and inline code, link targets, the front matter's own "key:", the
// {pending:…} markers, and table-alignment rows.
function helpSkips(text: string): boolean[] {
  const skip = new Array<boolean>(text.length).fill(false);
  const mask = (re: RegExp) => {
    for (const m of text.matchAll(re)) for (let i = m.index ?? 0; i < (m.index ?? 0) + m[0].length; i++) skip[i] = true;
  };
  mask(/```[\s\S]*?```/g);
  mask(/`[^`\n]*`/g);
  mask(/\]\([^)]*\)/g);
  mask(/^[A-Za-z_][\w-]*:/gm);
  mask(/\{\/?pending(:[^}]*)?\}/g);
  mask(/^\|?\s*:?-{3,}.*$/gm);
  return skip;
}

function leaves(obj: unknown, prefix = ""): [string, string][] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" ? leaves(v, key) : typeof v === "string" ? [[key, v] as [string, string]] : [];
  });
}

describe("fr typography: a no-break space before ? ! : ;", () => {
  it("the check itself: flags an ordinary space, not U+00A0, a time or a URL", () => {
    expect(ordinarySpacesBeforeMarks("Vraiment ?")).toHaveLength(1);
    expect(ordinarySpacesBeforeMarks("Note ; puis : fin !")).toHaveLength(3);
    expect(ordinarySpacesBeforeMarks("Vraiment ? Oui !")).toEqual([]);
    expect(ordinarySpacesBeforeMarks("à 7:30, voir https://moodbow.com/fr/help?x=1 :)")).toHaveLength(1);
    expect(ordinarySpacesBeforeMarks("{label}: {value}")).toEqual([]);
    expect(ordinarySpacesBeforeMarks("Quoi ?? Non !!")).toHaveLength(2);
  });

  it("every fr message", () => {
    const bad = leaves(fr).flatMap(([key, value]) => ordinarySpacesBeforeMarks(value).map((s) => `${key}: ${s}`));
    expect(bad).toEqual([]);
  });

  it("every fr help page's prose", () => {
    const dir = join(process.cwd(), "content", "help", "fr");
    const pages = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(pages.length).toBeGreaterThanOrEqual(40);
    const bad = pages.flatMap((f) => {
      const text = readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n");
      return ordinarySpacesBeforeMarks(text, helpSkips(text)).map((s) => `${f}: ${s}`);
    });
    expect(bad).toEqual([]);
  });
});
