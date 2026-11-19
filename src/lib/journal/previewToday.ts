import { draftsAllowed, type BuildEnv } from "@/lib/conditions";

// A test date for Your year in Moodbow (1.4 A; UX 18 Nov, the Web Tester's prep): on a Preview,
// dev or CI drafts build only, ?today=YYYY-MM-DD stands in for the profile's today on Today's year
// card and on the year page, so December and January can be tested in November. Production never
// reads it: draftsAllowed() is false there whatever the URL says. It changes which year is shown
// and whether the card is offered, nothing that is saved. The links between the two pages carry it
// (yearHref), so it lasts for the tab.
export const PREVIEW_TODAY_PARAM = "today";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const realDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export function previewToday(asked: unknown, today: string, build?: BuildEnv): string {
  if (!(build ? draftsAllowed(build) : draftsAllowed())) return today;
  const value = Array.isArray(asked) ? asked[0] : asked;
  return typeof value === "string" && DATE.test(value) && realDate(value) ? value : today;
}

// The query to carry: only when the override is in use.
export const previewTodayQuery = (shown: string, today: string) => (shown === today ? "" : `?${PREVIEW_TODAY_PARAM}=${shown}`);
