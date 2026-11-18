import { track } from "@vercel/analytics";
import { ALL_LOCALES } from "@/i18n/routing";

// Button taps, counted in aggregate (specs/analytics.md, UX & PM's rulings
// of 17 Nov; Vitor's go). A tap is a fixed name from this closed list and
// nothing else: no text, no ids, no values. Where the app counts the same
// action (plans/PLAN-app-usage-counts.md) the name is the same. Two events
// carry one fixed choice (TAP_CHOICES), and only those values pass.
//
// Never here (UX, matching the app): a crisis match, the crisis card showing
// by itself, helpline or call taps, anything about the safety plan. Only the
// person's own tap on "Get help now" counts (cta_help_open).
export const TAP_EVENTS = [
  // The website and Start.
  "cta_home_start",
  "cta_home_sign_in",
  "cta_home_notify",
  "cta_home_security",
  "cta_store_play",
  "cta_store_appstore",
  "cta_try_app",
  "welcome_next",
  "welcome_skip",
  "welcome_start",
  "welcome_have_account",
  "signup_submitted",
  "signup_resend",
  "signin_to_signup",
  "consent_continue",
  "setup_done",
  "language_switch",
  // Help: the tap only.
  "cta_help_open",
  // The web journal (names shared with the app where both have it).
  "checkin_saved",
  "entry_saved",
  "moment_saved",
  "good_things_saved",
  "prompt_used",
  "share_month_opened",
  "export_done",
  "import_done",
  "journal_pdf_done",
  "bo_reply",
  "plus_opened",
  "plus_purchased",
  "reflect_done",
  "weekly_report_done",
  "print_month",
  "appointment_print",
  "timeline_search_used",
  "insights_range",
  // Your year in Moodbow (1.4 A): opening it, sharing the Year card, Plus's deeper page. Never
  // which screens were seen or how far someone swiped (UX 18 Nov).
  "year_review_open",
  "year_review_share",
  "year_review_more_plus",
] as const;
export type TapEvent = (typeof TAP_EVENTS)[number];

// The only properties any event may carry: one fixed choice each.
export const TAP_CHOICES = {
  language_switch: { locale: ALL_LOCALES },
  insights_range: { range: ["week", "month", "3months", "year", "all"] },
} as const satisfies Partial<Record<TapEvent, Record<string, readonly string[]>>>;
type Choices = typeof TAP_CHOICES;
type ChoiceOf<E extends TapEvent> = E extends keyof Choices ? { [K in keyof Choices[E]]: Choices[E][K] extends readonly (infer V)[] ? V : never } : never;

export const isTapEvent = (name: unknown): name is TapEvent => typeof name === "string" && (TAP_EVENTS as readonly string[]).includes(name);

// The event's data is exactly its allowed choice, or nothing at all.
export function validTapData(name: TapEvent, data: unknown): boolean {
  const allowed = (TAP_CHOICES as Record<string, Record<string, readonly string[]>>)[name];
  if (!allowed) return data === undefined || data === null;
  if (typeof data !== "object" || data === null) return false;
  const keys = Object.keys(data);
  const want = Object.keys(allowed);
  return keys.length === want.length && want.every((k) => typeof (data as Record<string, unknown>)[k] === "string" && allowed[k].includes((data as Record<string, string>)[k]));
}

// On only while the counter is on the page (VisitCounts: the "web-analytics"
// condition met, production, no Global Privacy Control or Do Not Track).
let tapsOn = false;
export function setTapsOn(on: boolean) {
  tapsOn = on;
}

// countTap("entry_saved"), countTap("insights_range", { range: "month" }).
export function countTap<E extends TapEvent>(...[name, choice]: E extends keyof Choices ? [E, ChoiceOf<E>] : [E]): void {
  if (!tapsOn || !isTapEvent(name)) return;
  if (choice === undefined) {
    if (name in TAP_CHOICES) return;
    track(name);
    return;
  }
  if (!validTapData(name, choice)) return;
  track(name, choice as Record<string, string>);
}

// Server-rendered buttons can't call countTap, so they carry
// data-count="<event>" (and data-count-<choice>="<value>" for the two
// choice events); VisitCounts listens for taps on them. A name or value
// outside the lists is ignored.
export const COUNT_ATTR = "data-count";
export function countFromElement(el: Element | null) {
  const target = el?.closest(`[${COUNT_ATTR}]`);
  const name = target?.getAttribute(COUNT_ATTR);
  if (!target || !isTapEvent(name)) return;
  const allowed = (TAP_CHOICES as Record<string, Record<string, readonly string[]>>)[name];
  if (!allowed) {
    (countTap as (n: TapEvent) => void)(name);
    return;
  }
  const choice: Record<string, string> = {};
  for (const key of Object.keys(allowed)) choice[key] = target.getAttribute(`${COUNT_ATTR}-${key}`) ?? "";
  (countTap as (n: TapEvent, c: Record<string, string>) => void)(name, choice);
}
