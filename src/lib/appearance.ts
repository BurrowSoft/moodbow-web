// Me → Appearance (decision 133): Same as device / Light / Dark, kept on
// this device only (localStorage; never the account, never a cookie).
// "system" is no key at all. Any storage error → the system theme.
export const THEME_KEY = "mb:theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// Saves and applies it at once (<html data-theme>; CSS does the rest).
export function writeTheme(theme: Theme): void {
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: it still applies for this page.
  }
  applyTheme(theme);
}

// Applies it to this page only (<html data-theme>; CSS does the rest).
export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

// Inline in <head>, before first paint, so a chosen theme never flashes
// the system one. Kept tiny and self-contained (it runs before any JS).
// If a Content-Security-Policy is ever added, it needs this script's hash
// (reviewer #41).
export const THEME_PRE_PAINT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
