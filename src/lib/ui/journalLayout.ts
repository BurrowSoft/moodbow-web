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
export const APP_MAIN_GUTTER = "px-3 min-[360px]:px-4 sm:px-6";

// A journal card (Today's check-in and its summary).
export const JOURNAL_CARD = "rounded-3xl border border-border bg-surface p-3 min-[360px]:p-4 sm:p-6";

// The mood picker: a radio row inside an @container, and each face.
export const MOOD_ROW = "flex flex-wrap justify-between gap-0.5 @min-[22rem]:gap-2";
export const MOOD_FACE = "flex min-h-12 min-w-12 flex-1 basis-12 flex-col items-center justify-center gap-2 rounded-2xl p-1 text-xs font-medium @min-[22rem]:p-2";

// The primary Save button (check-in, entry): full width on phones, so at
// 200% zoom (a 160 px-wide page) it never overflows; the label wraps.
export const PRIMARY_SAVE =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 py-2 text-center font-medium text-on-accent hover:opacity-90 disabled:opacity-50 sm:w-auto sm:min-w-[160px] sm:px-8";

// A bottom-bar tab: a grid cell that may shrink below its label's width
// (min-w-0), so at 200% zoom the four labels wrap instead of overlapping.
export const TAB_ITEM = "min-w-0";
export const TAB_LINK_NARROW = "px-1 min-[360px]:px-3 text-center leading-tight [overflow-wrap:anywhere]";
// Under 240 CSS px (200%+ zoom on a phone) the labels can't fit without
// breaking mid-word: icons only, each label kept as screen-reader text (the
// link's name) and a title tooltip. Never a smaller font: that defeats zoom (UX).
export const TAB_LABEL = "max-[240px]:sr-only";
