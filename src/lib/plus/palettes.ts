// Moodbow Plus: the extra themes (decision 246; UX ruled 11 Nov): Dusk
// (lavender), Sunrise (peach and gold) and Sea (blue-grey), beside Same as
// device / Light / Dark, each with a light and a dark variant (globals.css,
// <html data-palette>). Kept on this device only, as Appearance is, with the
// date Plus runs to: past it the default comes back by itself, before any
// page asks the server (and Me clears it when Plus has ended). The help card
// keeps its own colours in every theme.

export const PALETTES = ["dusk", "sunrise", "sea"] as const;
export type Palette = (typeof PALETTES)[number];
export const PALETTE_KEY = "mb:palette";
const isPalette = (v: unknown): v is Palette => (PALETTES as readonly unknown[]).includes(v);

// "dusk@2027-11-11T12:00:00.000Z": the palette, and when Plus runs out.
export function parsePalette(stored: string | null, now = Date.now()): Palette | null {
  if (!stored) return null;
  const [name, until] = stored.split("@");
  const end = Date.parse(until ?? "");
  return isPalette(name) && Number.isFinite(end) && end > now ? name : null;
}

export function readPalette(now = Date.now()): Palette | null {
  try {
    return parsePalette(window.localStorage.getItem(PALETTE_KEY), now);
  } catch {
    return null;
  }
}

// null: back to the default. Applied at once (<html data-palette>; CSS does the rest).
export function writePalette(palette: Palette | null, until: string | null): void {
  try {
    if (!palette || !until) window.localStorage.removeItem(PALETTE_KEY);
    else window.localStorage.setItem(PALETTE_KEY, `${palette}@${until}`);
  } catch {
    // Storage blocked: it still applies for this page.
  }
  applyPalette(palette && until ? palette : null);
}

// The stored choice's name, whatever its date: kept through a renewal or a
// failed payment, so it comes back once Plus runs again.
export function storedPaletteName(): Palette | null {
  try {
    const name = (window.localStorage.getItem(PALETTE_KEY) ?? "").split("@")[0];
    return isPalette(name) ? name : null;
  } catch {
    return null;
  }
}

// With Plus on, the stored choice runs to the entitlement's current end, so a
// yearly renewal never resets the theme (UX, #277). true: it changed.
export function refreshPaletteUntil(until: string): boolean {
  const name = storedPaletteName();
  if (!name) return false;
  try {
    if (window.localStorage.getItem(PALETTE_KEY) === `${name}@${until}`) return false;
  } catch {
    return false;
  }
  writePalette(name, until);
  return true;
}

export function applyPalette(palette: Palette | null): void {
  if (palette) document.documentElement.dataset.palette = palette;
  else delete document.documentElement.dataset.palette;
}

// Inline in <head> beside the theme's, before first paint: only a known
// palette whose date hasn't passed. Tiny and self-contained (it runs before any JS).
export const PALETTE_PRE_PAINT = `try{var p=(localStorage.getItem("${PALETTE_KEY}")||"").split("@");if(${JSON.stringify(PALETTES)}.indexOf(p[0])>-1&&Date.parse(p[1])>Date.now())document.documentElement.dataset.palette=p[0]}catch(e){}`;
