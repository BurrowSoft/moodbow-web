"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { applyTheme, readTheme, THEME_KEY, THEMES, writeTheme, type Theme } from "@/lib/appearance";
import { readShortcutsOn, writeShortcutsOn } from "@/lib/shortcuts";
import { applyPalette, PALETTES, PALETTE_KEY, readPalette, refreshPaletteUntil, writePalette, type Palette } from "@/lib/plus/palettes";
import { LockedItem, type PlusOffer } from "../PlusSheet";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";

const LABELS = { system: "themeSystem", light: "themeLight", dark: "themeDark" } as const;
const PALETTE_LABELS = { dusk: "paletteDusk", sunrise: "paletteSunrise", sea: "paletteSea" } as const;

// Changes made here (and in other tabs: the storage event) re-render.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  // Another tab changed it (or cleared storage): this page follows too, not
  // just the radios (reviewer #41).
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) applyTheme(readTheme());
    if (e.key === PALETTE_KEY || e.key === null) applyPalette(readPalette());
    cb();
  };
  listeners.add(cb);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

// Me → Appearance (r1 §M7, decision 133): Same as device / Light / Dark,
// for this device only, applied at once. Nothing is sent to the server, so
// there's no save to fail (decision 111 doesn't apply).
// shortcuts: the keyboard shortcuts switch (1.1 O, WCAG 2.1.4), on by
// default, also for this device only.
// palette: Moodbow Plus's extra themes (decision 246): { until } with Plus (the date
// it runs to, kept with the choice), { pastDue } while a renewal fails (the
// payment line, and the choice kept), the offer without (a lock), null when
// Plus can't be read (nothing shown, nothing changed).
export function Appearance({ shortcuts = false, palette = null }: { shortcuts?: boolean; palette?: { until: string } | { pastDue: true } | PlusOffer | null }) {
  const untilLoaded = useUntilLoaded();
  const t = useTranslations("me");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const shortcutsOn = useSyncExternalStore(subscribe, readShortcutsOn, () => true);
  const tp = useTranslations("plus");
  const chosenPalette = useSyncExternalStore(subscribe, () => readPalette(), () => null);
  const until = palette && "until" in palette ? palette.until : null;
  // A renewal failed: not ended. The choice stays stored (UX, #277).
  const pastDue = palette !== null && "pastDue" in palette;
  // Plus has ended (or never was): the default comes back, nothing is lost.
  const ended = palette !== null && until === null && !pastDue;
  useEffect(() => {
    if (ended && readPalette()) {
      writePalette(null, null);
      listeners.forEach((cb) => cb());
    }
  }, [ended]);
  // Plus on: the stored choice follows the entitlement's end (a renewal moves it on).
  useEffect(() => {
    if (until && refreshPaletteUntil(until)) listeners.forEach((cb) => cb());
  }, [until]);
  const choosePalette = (next: Palette | null) => {
    writePalette(next, until);
    listeners.forEach((cb) => cb());
  };
  const choose = (next: Theme) => {
    writeTheme(next);
    listeners.forEach((cb) => cb());
  };
  // Flips what this device has stored, not what was rendered: a page that
  // loaded with shortcuts off renders the server's "on" first (Web Tester K6).
  const toggleShortcuts = () => {
    writeShortcutsOn(!readShortcutsOn());
    listeners.forEach((cb) => cb());
  };
  return (
    <section {...untilLoaded} aria-labelledby="me-appearance" className="rounded-3xl border border-border bg-surface p-[24px]">
      <fieldset className="min-w-0">
        <legend id="me-appearance" className="max-w-full text-lg font-medium text-text [overflow-wrap:anywhere]">
          {t("meAppearance")}
        </legend>
        <div className="mt-4 space-y-2">
          {THEMES.map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-3 text-text">
              <input
                type="radio"
                name="me-appearance"
                data-testid={`me-theme-${option}`}
                checked={theme === option}
                onChange={() => choose(option)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(LABELS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {until && (
        <fieldset className="mt-6 min-w-0 border-t border-border pt-4" data-testid="me-palettes">
          <legend className="max-w-full font-medium text-text [overflow-wrap:anywhere]">{tp("paletteLegend")}</legend>
          <div className="mt-3 space-y-2">
            {([null, ...PALETTES] as const).map((option) => (
              <label key={option ?? "default"} className="flex min-h-11 items-center gap-3 text-text">
                <input
                  type="radio"
                  name="me-palette"
                  data-testid={`me-palette-${option ?? "default"}`}
                  checked={chosenPalette === option}
                  onChange={() => choosePalette(option)}
                  className="h-5 w-5 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">{option ? tp(PALETTE_LABELS[option]) : tp("paletteDefault")}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {pastDue && (
        <p data-testid="me-palettes-past-due" className="mt-6 border-t border-border pt-4 text-text [overflow-wrap:anywhere]">
          {tp("pastDue")}
        </p>
      )}
      {palette && !until && !pastDue && (
        <LockedItem label={tp("rowThemes")} sheetTitle={tp("sheetThemes")} offer={palette as PlusOffer} testId="me-palettes" className="mt-6 flex min-h-11 w-full items-center justify-between gap-3 border-t border-border pt-4 text-left font-medium text-text" />
      )}
      {shortcuts && (
        <div className="mt-6 border-t border-border pt-4">
          {/* The whole row is the switch (a big target; reviewer #97). */}
          <button
            type="button"
            role="switch"
            aria-checked={shortcutsOn}
            aria-describedby="me-shortcuts-hint"
            data-testid="me-shortcuts"
            onClick={toggleShortcuts}
            className="flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left text-text"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{t("shortcutsEnabled")}</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors ${shortcutsOn ? "bg-accent" : "bg-pill"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${shortcutsOn ? "translate-x-6" : "translate-x-1"}`} />
            </span>
          </button>
          <p id="me-shortcuts-hint" className="text-sm text-muted">
            {t("shortcutsHint")}
          </p>
        </div>
      )}
    </section>
  );
}
