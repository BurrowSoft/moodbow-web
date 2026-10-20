// Web keyboard shortcuts (1.1 O, decision 200): single keys for people who
// journal at a desk. Never while typing (a field, a select, an editable
// area), never inside a dialog, and never with Ctrl/Cmd/Alt held, so browser
// and screen-reader shortcuts are untouched. Me → Appearance turns them off
// (WCAG 2.1.4); the choice is kept on this device only, like the theme.

export const SHORTCUTS_KEY = "mb:shortcuts";

export type ShortcutAction = "new" | "checkIn" | "timeline" | "insights" | "search" | "help";

// The keys, in the order the ? dialog lists them ("/" only when search is
// live; "?" opens the dialog itself).
export const SHORTCUTS = [
  { key: "n", action: "new", label: "shortcutNew" },
  { key: "c", action: "checkIn", label: "shortcutCheckIn" },
  { key: "t", action: "timeline", label: "shortcutTimeline" },
  { key: "i", action: "insights", label: "shortcutInsights" },
  { key: "/", action: "search", label: "shortcutSearch" },
] as const;

// This page's choice when storage is blocked (private mode).
let fallback: boolean | null = null;

// On unless turned off on this device.
export function readShortcutsOn(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return fallback ?? true;
  }
}

export function writeShortcutsOn(on: boolean): void {
  fallback = on;
  try {
    if (on) window.localStorage.removeItem(SHORTCUTS_KEY);
    else window.localStorage.setItem(SHORTCUTS_KEY, "off");
  } catch {
    // Storage blocked: it still applies for this page.
  }
}

// Somewhere a key press is text or picks an option (native fields, editable
// areas, and their ARIA roles), or belongs to a dialog.
const TYPING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='searchbox'], [role='combobox'], [role='spinbutton'], [role='menu'], [role='menubar'], [role='listbox']";
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(TYPING)) return true;
  return !!target.closest("dialog, [role='dialog'], [role='alertdialog']");
}

type Press = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented" | "isComposing">;

// The shortcut for this key press, or null. Shift is allowed ("?" needs it).
export function shortcutFor(e: Press, opts: { search: boolean }): ShortcutAction | null {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  // A dialog open anywhere (e.g. the share sheet) owns the keyboard.
  if (typeof document !== "undefined" && document.querySelector("dialog[open], [role='dialog'][aria-modal='true']")) return null;
  if (e.key === "?") return "help";
  const s = SHORTCUTS.find((x) => x.key === e.key.toLowerCase());
  if (!s || (s.action === "search" && !opts.search)) return null;
  return s.action;
}
