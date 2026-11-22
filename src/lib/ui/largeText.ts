// Decision 231's cap, for text in a narrow column at large text (UX, 20 Nov, option A after the Web Tester's fr/pt-BR
// sweep): a button, a row beside an icon, a card. On a narrow screen its size stops at 10vw, never under 32 px (2x),
// so its longest words fit a line instead of being cut without a hyphen: a word with no hyphen point under the 8 3 3
// rule ("Ajouter", "données", "novembre", "montrent") can only fit or be cut, and CSS can't hyphenate a cut. In em,
// so at the normal size it's exactly the size the element would have had (min(1em, …) is 1em there).
// NAMES_FIT marks a block where a brand name fits a line at any size (here, thanks to the cap), so the name is kept
// whole there instead of taking an emergency break ("Mood / bow"): globals.css, .names-fit .whole-name.
export const NAMES_FIT = "names-fit";
export const LARGE_TEXT_CAP = `${NAMES_FIT} [font-size:min(1em,max(10vw,32px))]`;

// The components the sweep fixed, their classes shared with e2e/large-text.spec.ts, which checks them in a real
// browser at fr 320 px / 300 % (their pages need a session, so it builds the same markup on a public page).
// The day page's Add a note: px padding (px-8 in rem grew to 96 px a side at 300 %: "Ajo / uter / une / not / e").
export const DAY_ADD_ENTRY = `inline-flex min-h-12 max-w-full items-center justify-center rounded-full bg-pill px-[32px] text-center font-medium text-accent max-[9em]:hyphens-auto max-[9em]:[hyphenate-limit-chars:7_3_3] [overflow-wrap:anywhere] hover:brightness-95 ${LARGE_TEXT_CAP}`;
// A Plus-locked row's words beside its lock (LockedItem), and Me → Appearance's row ("d'icône / s d'app").
export const LOCKED_ROW_LABEL = `min-w-0 ${LARGE_TEXT_CAP}`;
export const ME_LOCKED_ROW = "mt-6 flex min-h-11 w-full items-center justify-between gap-[12px] border-t border-border pt-4 text-left font-medium text-text";
// A shared week (Me → Share's preview and /s/): capped, and sized in em inside so the heading and the day labels
// follow the cap ("Semaine du 16 novembr / e"; the labels overlapped).
export const WEEK_SUMMARY = `space-y-4 ${LARGE_TEXT_CAP}`;
export const WEEK_HEADING = "font-semibold text-text";
export const WEEK_DAYS = "grid grid-cols-7 gap-[6px]";
export const WEEK_DAY = "flex flex-col items-center gap-[4px]";
export const WEEK_DAY_LABEL = "text-[0.75em] text-muted";

// Your year's colour strip (the Web Tester's D2, UX 20 Nov): 6 months across on a phone, 12 on a wide screen, and at
// large text (a 13em column or narrower) a 4×3 grid, Jan–Apr, May–Aug, Sep–Dec, so each 3-letter month (de "Sept."
// the longest) fits on one line. Never one-letter months (J, J, J). The gaps are in px, so large text doesn't shrink
// the cells; the label never splits (overflow-wrap normal against body's break-word).
export const YEAR_STRIP = "mt-4 grid grid-cols-6 gap-[8px] sm:grid-cols-12 max-[13em]:grid-cols-4";
export const YEAR_MONTH = "flex flex-col items-center gap-[4px]";
export const YEAR_MONTH_LABEL = "max-w-full text-center leading-tight text-muted [font-size:min(0.75rem,max(6vw,12px))] [overflow-wrap:normal]";
// Bo's heading: its own row where the page is a 13em column, where "Moodbow" fits, so the name stays whole.
export const BO_HEADING = `min-w-0 flex-1 font-medium leading-[1.33] text-text outline-none [font-size:min(1.5rem,max(10vw,24px,1rem))] [overflow-wrap:anywhere] max-[13em]:basis-full ${NAMES_FIT}`;
