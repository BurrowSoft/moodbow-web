"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { applyTheme, readTheme, THEME_KEY, THEMES, writeTheme, type Theme } from "@/lib/appearance";
import { readShortcutsOn, writeShortcutsOn } from "@/lib/shortcuts";

const LABELS = { system: "themeSystem", light: "themeLight", dark: "themeDark" } as const;

// Changes made here (and in other tabs: the storage event) re-render.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  // Another tab changed it (or cleared storage): this page follows too, not
  // just the radios (reviewer #41).
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) applyTheme(readTheme());
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
export function Appearance({ shortcuts = false }: { shortcuts?: boolean }) {
  const t = useTranslations("me");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const shortcutsOn = useSyncExternalStore(subscribe, readShortcutsOn, () => true);
  const choose = (next: Theme) => {
    writeTheme(next);
    listeners.forEach((cb) => cb());
  };
  const toggleShortcuts = () => {
    writeShortcutsOn(!shortcutsOn);
    listeners.forEach((cb) => cb());
  };
  return (
    <section aria-labelledby="me-appearance" className="rounded-3xl border border-border bg-surface p-6">
      <fieldset>
        <legend id="me-appearance" className="text-lg font-medium text-text">
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
              <span>{t(LABELS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {shortcuts && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <span id="me-shortcuts" className="text-text">
              {t("shortcutsEnabled")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={shortcutsOn}
              aria-labelledby="me-shortcuts"
              aria-describedby="me-shortcuts-hint"
              data-testid="me-shortcuts"
              onClick={toggleShortcuts}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors ${shortcutsOn ? "bg-accent" : "bg-pill"}`}
            >
              <span aria-hidden="true" className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform ${shortcutsOn ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <p id="me-shortcuts-hint" className="text-sm text-muted">
            {t("shortcutsHint")}
          </p>
        </div>
      )}
    </section>
  );
}
