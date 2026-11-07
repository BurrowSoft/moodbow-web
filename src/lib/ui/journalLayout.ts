// Class strings for the web journal's narrow-width layout, in one place so
// the components and the browser layout test (e2e/narrow-layout.spec.ts)
// use exactly the same ones (decisions 105 and 119).
//
// The numbers, at a 320 px desktop window with a classic scrollbar (~15 px):
// 320 − 15 − 2×12 (main px-3) − 2×12 (card p-3) − 2 (border) = 255 px for
// the mood row; five 48 px faces + 4 gaps of 2 px = 248 px, so one row.
// Below 360 px wide the gutters tighten; the faces stay 48 px. The row
// still wraps, but only at zoom or large text.

// The /app layout's main region.
// In px, like the cards: rem would triple at 300 % text, leaving 176 px of a 320 px phone.
export const APP_MAIN_GUTTER = "px-[12px] min-[360px]:px-[16px] sm:px-[24px]";

// A journal page's heading: text-3xl's size and line height, capped on a narrow screen at
// large text so its words stay whole at 200 %, and never smaller than the body under it.
export const JOURNAL_HEADING = "font-medium leading-[1.2] tracking-tight [font-size:min(1.875rem,max(12vw,30px,1rem))] [overflow-wrap:anywhere]";

// A journal card (Today's check-in and its summary).
export const JOURNAL_CARD = "rounded-3xl border border-border bg-surface p-[12px] min-[360px]:p-[16px] sm:p-[24px]";

// The mood picker: a radio row inside an @container, and each face.
export const MOOD_ROW = "flex flex-wrap justify-between gap-0.5 @min-[22rem]:gap-2";
// min-w-min + the label's min-w-10: at least 48 px (40 + p-1), or the
// label's longest word, never less, so the label never breaks mid-word.
export const MOOD_FACE = "flex min-h-12 min-w-min flex-1 basis-12 flex-col items-center justify-center gap-1 rounded-2xl p-1 font-medium @min-[22rem]:p-2";
// The label under each face: always shown (UX, superseding decision 105);
// 12 px (0.75rem, UX) at the default text size: in rem, so it follows the
// reader's setting, up to a cap on a narrow screen, so a long word stays whole at 300 %.
// "Awful" and "Great" stay on one line under 48 px faces.
export const MOOD_LABEL = "min-w-10 text-center leading-tight [font-size:min(0.75rem,max(6vw,12px))]";

// The primary Save button (check-in, entry): full width on phones, so at
// 200% zoom (a 160 px-wide page) it never overflows; the label wraps. Below the wide layout its
// type stops growing at about 200 % (decision 231).
export const PRIMARY_SAVE =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-[24px] py-2 text-center font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50 max-sm:[font-size:min(1rem,max(10vw,32px))] sm:w-auto sm:min-w-[160px] sm:px-8";

// A bottom-bar tab: a grid cell that may shrink below its label's width
// (min-w-0), so the four stay inside the row.
export const TAB_ITEM = "min-w-0";
// Each column as wide as its label wants, the rest shared out, and narrower only
// when the row truly has no room: a long word ("Chronologie") stays whole next
// to a short one ("Moi"), and four equal columns would break it. No string or
// font changes for this (UX).
export const TAB_COLUMNS = "grid-cols-[repeat(4,minmax(0,auto))]";
// In px, not rem: padding that grew with the text took the labels' room, and a
// wider phone showed less than a narrower one (Web Tester, #193).
export const TAB_LINK_NARROW = "px-[4px] min-[360px]:px-[12px] text-center leading-tight";
// One line, never broken inside a word. When the four don't fit (a large browser
// text size at 320 px), AppNav scales them down together through this variable,
// as the app does (UX & PM 2026-11-06, replacing "never a smaller font" here).
// Never under TAB_LABEL_MIN_PX: below that the whole bar goes icons only, as it
// does under 240 CSS px (200%+ zoom on a phone), each label kept as screen-reader
// text (the link's name) and a title tooltip.
export const TAB_LABEL = "whitespace-nowrap [font-size:var(--tab-label-size,inherit)] max-[240px]:sr-only group-data-[tab-icons]/tabs:sr-only";
export const TAB_LABEL_MIN_PX = 11;

// The size that lets the four labels share the row: as they are if they fit, else
// all scaled by the same amount, just under the exact fit so rounding can't wrap
// or clip. minWidth: a tab's narrowest (its icon), so a label narrower than that
// takes that much of the row whatever its size. null: nothing to change. "icons":
// they'd have to go under the smallest size.
export function tabLabelSize(room: number, labelWidths: number[], fontSize: number, minWidth = 0): number | "icons" | null {
  if (room <= 0) return null;
  let scaling = labelWidths;
  let scale = 1;
  for (;;) {
    const held = (labelWidths.length - scaling.length) * minWidth;
    scale = (room * 0.98 - held) / scaling.reduce((sum, width) => sum + width, 0);
    const still = scaling.filter((width) => width * scale >= minWidth);
    if (still.length === scaling.length || still.length === 0) break;
    scaling = still;
  }
  const fits = labelWidths.reduce((sum, width) => sum + Math.max(width, minWidth), 0) <= room;
  if (fits) return null;
  const size = Math.floor(Math.min(scale, 1) * fontSize * 100) / 100;
  return size >= TAB_LABEL_MIN_PX ? size : "icons";
}

// A segmented choice (Timeline All days/Moments, Insights ranges, the share
// card's format and theme): the selected one in the rose accent with
// on-accent text (colour-roles §3, UX), the others muted.
export const segment = (active: boolean) =>
  `inline-flex min-h-[44px] max-w-full items-center rounded-full px-[16px] font-medium leading-[1.429] [font-size:min(0.875rem,max(7vw,14px))] [overflow-wrap:anywhere] ${active ? "bg-accent text-on-accent" : "text-muted hover:bg-pill"}`;
