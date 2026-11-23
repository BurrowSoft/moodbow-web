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
// An uppercase label's letter-spacing: wide at the normal size, normal at large text (a 13em column), where wide
// capitals cost a line its room (UX, 23 Nov: modest). The Plus card's tag, Today's tag, Timeline's months.
export const LABEL_TRACKING = "tracking-wide max-[13em]:tracking-normal";
// The Plus card (Me, and Today's during the offer; UX 23 Nov, fixed before 1 Dec, when the Christmas offer shows to
// everyone: its "CHRISTMAS SPECIAL OFFER" tag ran 75 px off a 320 px phone at 300 %). A card under decision 231: capped,
// and sized in em inside, so at 300 % on a phone its title is 36 px, its text 32 px, its tag and small print 28 px (the
// normal size and wide screens as before). The tag's row wraps, so the tag can take its own line under its icons.
// Measured in Chromium and WebKit in en, fr, es, pt-BR, de and it: WebKit (Safari) didn't hyphenate the German compounds
// wider than a line, so de.json carries a soft hyphen in each ("Weihnachts·angebot", "Jahres·diagramme").
export const PLUS_CARD = `relative space-y-2 rounded-3xl p-[20px] ${LARGE_TEXT_CAP}`;
export const PLUS_CARD_TAG_ROW = "flex flex-wrap items-center gap-x-2 gap-y-1 pr-[48px]";
// The tag; with one of the two below, for where it sits.
export const PLUS_CARD_TAG = `text-[0.875em] leading-[calc(1.25/0.875)] font-medium uppercase ${LABEL_TRACKING}`;
// "Moodbow Plus" beside the arcs: flex-1 (a zero basis), so whether it fits there is judged by its longest word, not its
// whole line. Two words: two lines at most.
export const PLUS_CARD_PLUS_TAG = "flex-1";
// The offer's tag (UX, 23 Nov, after the Web Tester's de row: under the lights whenever it can't fit on two lines beside
// them). It stays beside the lights only with 10em of its own size there, else it takes its own line under them. 10em is
// the room its longest language needs for two lines plus a margin: it "OFFERTA SPECIALE / DI NATALE" 9.32em, then es and
// pt-BR 8.78em (Chromium and WebKit alike). In em, so it holds at every text size and width. e2e/large-text.spec.ts sweeps
// it in every language, 320–430 px × 100–300 %. At the normal size Me's card keeps it beside (11.1em there on a 320 px
// phone); Today's on a 320 px phone, with the tree too (9em), puts it under (UX: fine).
export const PLUS_CARD_OFFER_TAG = "flex-[1_1_10em]";
export const PLUS_CARD_TITLE = "pr-[48px] text-[1.125em] font-medium leading-snug";
export const PLUS_CARD_SMALL = "text-center text-[0.875em] leading-[calc(1.25/0.875)]";
// The Plus screen's Christmas strip: its lights (decoration) step aside at large text, so the offer's name has their
// room (de "Weihnachtsangebot" at the footer's 32 px).
export const OFFER_STRIP_LIGHTS = "flex shrink-0 max-[13em]:hidden";
// Bo's heading: its own row where the page is a 13em column, where "Moodbow" fits, so the name stays whole.
export const BO_HEADING = `min-w-0 flex-1 font-medium leading-[1.33] text-text outline-none [font-size:min(1.5rem,max(10vw,24px,1rem))] [overflow-wrap:anywhere] max-[13em]:basis-full ${NAMES_FIT}`;
