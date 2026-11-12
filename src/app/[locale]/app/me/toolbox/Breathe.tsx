"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { FREE_PATTERN, PATTERNS, patternById } from "@/lib/journal/toolbox";
import { Breathing } from "./Breathing";

const LABELS: Record<string, { name: "patternEven46" | "patternBox" | "patternEven5"; steps: "patternEven46Steps" | "patternBoxSteps" | "patternEven5Steps" }> = {
  "even-4-6": { name: "patternEven46", steps: "patternEven46Steps" },
  box: { name: "patternBox", steps: "patternBoxSteps" },
  "even-5": { name: "patternEven5", steps: "patternEven5Steps" },
};

// The pattern last chosen, on this device only (Plus; specs/plus-breathing-draft.md).
export const PATTERN_KEY = "mb:breathing-pattern";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const readChosen = () => {
  try {
    return window.localStorage.getItem(PATTERN_KEY);
  } catch {
    return null;
  }
};

// "Breathe for a minute" in the toolbox. Without Plus: today's pattern, exactly as before: no
// lock, no sheet, no word about other patterns (the toolbox is a help surface, UX). With Plus: a
// choice of the patterns too, the last one kept, and the button starts it. If Plus ends, it's
// today's again, whatever was kept.
export function Breathe({ hasPlus = false }: { hasPlus?: boolean }) {
  const t = useTranslations("toolbox");
  const [breathing, setBreathing] = useState(false);
  const chosen = useSyncExternalStore(subscribe, readChosen, () => null);
  const pattern = hasPlus ? (patternById(chosen) ?? FREE_PATTERN) : FREE_PATTERN;
  const choose = (id: string) => {
    try {
      window.localStorage.setItem(PATTERN_KEY, id);
    } catch {
      // Storage blocked: it holds for this visit only.
    }
    listeners.forEach((cb) => cb());
  };
  return (
    <>
      <button type="button" data-testid="toolbox-breathe" data-pattern={pattern.id} onClick={() => setBreathing(true)} className={dialogButton()}>
        {t("breathe")}
      </button>
      {hasPlus && (
        <fieldset data-testid="toolbox-patterns" className="mt-4 min-w-0">
          <legend className="font-medium text-text">{t("breathePatterns")}</legend>
          <div className="mt-2 space-y-2">
            {PATTERNS.map((p) => (
              <label key={p.id} className="flex min-h-11 items-start gap-3 text-text">
                <input type="radio" name="toolbox-pattern" data-testid={`toolbox-pattern-${p.id}`} checked={pattern.id === p.id} onChange={() => choose(p.id)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="block">{t(LABELS[p.id].name)}</span>
                  <span className="block text-sm text-muted">{t(LABELS[p.id].steps)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {breathing && <Breathing pattern={pattern} onClose={() => setBreathing(false)} />}
    </>
  );
}
