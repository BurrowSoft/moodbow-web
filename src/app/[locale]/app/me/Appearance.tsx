"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { applyTheme, readTheme, THEME_KEY, THEMES, writeTheme, type Theme } from "@/lib/appearance";

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
export function Appearance() {
  const t = useTranslations("me");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const choose = (next: Theme) => {
    writeTheme(next);
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
    </section>
  );
}
