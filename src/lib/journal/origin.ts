// Where an entry page (/app/entries/…, /app/write) was opened from
// (decision 152): Today, the Timeline or a day of it. It's carried as
// ?from=… on the links that open them, so the nav highlights that tab and
// Back (and leaving the editor) returns there. Anything else, a direct load
// or a deep link, means Today. Only these paths, so ?from= can't send
// anyone elsewhere.
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

export function withOrigin(href: string, origin: Origin): string {
  if (origin === "/app") return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(origin)}`;
}
