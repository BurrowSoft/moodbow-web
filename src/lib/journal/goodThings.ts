// Three good things (1.3; specs/1.3-grounding-and-good-things.md with its Rulings): three short
// lines, any of them empty, saved as ONE ordinary entry through the editor's own save (Ruling 3):
// the heading, then the filled lines as a list. Not a streak: nothing here counts anything.
export const GOOD_THINGS_FIELDS = 3;

export type GoodThingsLines = [string, string, string];
export const NO_GOOD_THINGS: GoodThingsLines = ["", "", ""];

// The entry's text: the heading (in the person's language), then "- " and each filled line,
// trimmed; nothing at all when every line is blank, so Save waits as it does for an empty entry.
export function goodThingsBody(heading: string, lines: readonly string[]): string {
  const filled = lines.map((l) => l.trim()).filter((l) => l !== "");
  return filled.length === 0 ? "" : [heading, ...filled.map((l) => `- ${l}`)].join("\n");
}

// Back from a kept draft's text (this screen's own, so the shape is known): its lines, in order,
// into the three fields. Anything else gives three empty fields.
export function goodThingsLines(heading: string, body: string): GoodThingsLines {
  const [first, ...rest] = body.replace(/\r\n?/g, "\n").split("\n");
  if (first !== heading) return [...NO_GOOD_THINGS];
  const items = rest.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  return [items[0] ?? "", items[1] ?? "", items.slice(2).join(" ")];
}
