"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { BREATHING, breathingAt } from "@/lib/journal/toolbox";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// A minute to breathe (1.2, content/toolbox.json): in for 4, out for 6, six times, then it
// ends on its own. A circle grows and shrinks; with reduced motion, the words count down
// instead. No sound, no claims about what it does (the Reviewer's read). Stop is always
// there, and Escape stops it too. Opened only by a tap, so nothing here is server-rendered.
export function Breathing({ onClose }: { onClose: () => void }) {
  const t = useTranslations("toolbox");
  const [second, setSecond] = useState(0);
  const [still] = useState(reducedMotion);
  // The circle starts small and grows into the first breath in.
  const [started, setStarted] = useState(false);
  const done = second >= BREATHING.totalSeconds;
  useEffect(() => {
    const frame = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => setSecond((s) => s + 1), 1000);
    return () => window.clearTimeout(timer);
  }, [second, done]);
  const { phase, left } = breathingAt(Math.min(second, BREATHING.totalSeconds - 1));
  const word = phase === "in" ? t("breatheIn") : t("breatheOut");
  const grown = started && phase === "in";

  const guide = done ? (
    <p data-testid="breathing-end" role="status" className="text-text">
      {t("breathEnd")}
    </p>
  ) : (
    <>
      {/* Said once per phase, never every second. */}
      <p role="status" className="sr-only" data-testid="breathing-phase">
        {word}
      </p>
      <div aria-hidden="true" className="flex min-h-[200px] flex-col items-center justify-center gap-4">
        {still ? (
          <p data-testid="breathing-count" className="text-lg font-medium text-text">
            {t(phase === "in" ? "breatheInCount" : "breatheOutCount", { n: left })}
          </p>
        ) : (
          <>
            <div
              data-testid="breathing-circle"
              data-phase={phase}
              className="h-[160px] w-[160px] rounded-full bg-pill transition-transform ease-in-out"
              style={{ transform: `scale(${grown ? 1 : 0.55})`, transitionDuration: `${(phase === "in" ? BREATHING.inSeconds : BREATHING.outSeconds) * 1000}ms` }}
            />
            <p className="text-lg font-medium text-text">{word}</p>
          </>
        )}
      </div>
    </>
  );

  return (
    <Dialog title={t("breathTitle")} details={guide} onCancel={onClose} testId="breathing">
      {done ? (
        <button type="button" data-testid="breathing-done" onClick={onClose} className={dialogButton(true)}>
          {t("done")}
        </button>
      ) : (
        <button type="button" data-testid="breathing-stop" onClick={onClose} className={dialogButton()}>
          {t("stop")}
        </button>
      )}
    </Dialog>
  );
}
