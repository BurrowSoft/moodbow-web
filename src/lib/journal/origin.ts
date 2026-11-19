// Where an entry page (/app/entries/…, /app/write) was opened from
// (decision 152): Today, the Timeline or a day of it. It's carried as
// ?from=… on the links that open them, so the nav highlights that tab and
// Back (and leaving the editor) returns there. Anything unknown means Today;
// an entry page with no ?from= at all means the Timeline (entryOriginOf).
// Only these paths, so ?from= can't send anyone elsewhere.
const DAY = /^\/app\/timeline\/\d{4}-\d{2}-\d{2}$/;

export type Origin = "/app" | "/app/timeline" | `/app/timeline/${string}`;

export function originOf(from: unknown): Origin {
  if (from === "/app" || from === "/app/timeline") return from;
  if (typeof from === "string" && DAY.test(from)) return from as Origin;
  return "/app";
}

export const originTab = (origin: Origin): "/app" | "/app/timeline" => (origin === "/app" ? "/app" : "/app/timeline");

// The day of a day-view origin, else null.
export const originDay = (origin: Origin): string | null => (DAY.test(origin) ? origin.slice("/app/timeline/".length) : null);

// An entry page with no origin at all (a direct load or a deep link): the Timeline, where entries
// live (UX, audit B, 14 Nov: parity with the app). So every link says where it came from, Today
// included; New entry (/app/write) keeps Today without one.
export function entryOriginOf(from: unknown): Origin {
  return from === undefined || from === null || from === "" ? "/app/timeline" : originOf(from);
}

export function withOrigin(href: string, origin: Origin): string {
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(origin)}`;
}
