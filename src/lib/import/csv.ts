// A small RFC 4180 CSV reader for journal imports (1.1 K, M2): commas or
// semicolons, quoted fields with the delimiter, quotes ("") and line breaks
// inside, CRLF or LF, a leading byte-order mark. Runs in the browser on the
// person's own file; no package.
export type Delimiter = "," | ";";

// The delimiter from the header line: whichever of , and ; appears outside
// quotes more often (a tie, or neither, is a comma).
export function detectDelimiter(text: string): Delimiter {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && c === ",") commas++;
    else if (!quoted && c === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

// The rows, or null when the file ends inside a quoted field (an
// unterminated quote: not a CSV we can trust, so the import refuses it).
export function parseCsv(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] | null {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) return null;
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}
