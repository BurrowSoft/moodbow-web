"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { breathingAt, FREE_PATTERN, patternSeconds, type BreathingPattern } from "@/lib/journal/toolbox";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// A minute to breathe (1.2, content/contracts/toolbox.json): in for 4, out for 6, six times, then it
// ends on its own. A circle grows and shrinks; with reduced motion, the words count down
// instead. No sound, no claims about what it does (the Reviewer's read). Stop is always
// there, first under the title so it's in view at any text size, and Escape stops it too. Opened only by a tap, so nothing here is server-rendered.
// pattern: today's (free) unless Plus chose another (content/contracts/toolbox.json, v2). A
// hold keeps the circle where the breath left it, and with reduced motion counts "Hold".
export function Breathing({ onClose, pattern = FREE_PATTERN }: { onClose: () => void; pattern?: BreathingPattern }) {
  const total = patternSeconds(pattern);
  const t = useTranslations("toolbox");
  const [second, setSecond] = useState(0);
  const [still] = useState(reducedMotion);
  // The circle starts small and grows into the first breath in.
  const [started, setStarted] = useState(false);
  const done = second >= total;
  useEffect(() => {
    const frame = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  // Seconds since it opened, from the clock rather than counted ticks: a busy or
  // backgrounded tab delays timers, and a minute should still be a minute.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (done) return;
    startedAt.current ??= Date.now();
    const tick = window.setInterval(() => setSecond(Math.floor((Date.now() - startedAt.current!) / 1000)), 250);
    return () => window.clearInterval(tick);
  }, [done]);
  const { phase, left, held, of } = breathingAt(Math.min(second, total - 1), pattern);
  const word = phase === "in" ? t("breatheIn") : phase === "out" ? t("breatheOut") : t("breatheHold");
  // A hold keeps the size the breath left it at.
  const grown = started && (phase === "in" || (phase === "hold" && held === "in"));

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
      <div aria-hidden="true" className="flex flex-col items-center justify-center gap-4 py-[8px]">
        {still ? (
          <p data-testid="breathing-count" className="font-medium text-text leading-tight [font-size:min(1.125rem,max(10vw,32px))]">
            {t(phase === "in" ? "breatheInCount" : phase === "out" ? "breatheOutCount" : "breatheHoldCount", { n: left })}
          </p>
        ) : (
          <>
            <div
              data-testid="breathing-circle"
              data-phase={phase}
              className="h-[max(64px,calc(220px-4rem))] w-[max(64px,calc(220px-4rem))] rounded-full bg-pill transition-transform ease-in-out"
              style={{ transform: `scale(${grown ? 1 : 0.55})`, transitionDuration: `${of * 1000}ms` }}
            />
            <p className="font-medium text-text leading-tight [font-size:min(1.125rem,max(10vw,32px))]">{word}</p>
          </>
        )}
      </div>
    </>
  );

  const control = done ? (
    <button type="button" data-testid="breathing-done" onClick={onClose} className={dialogButton(true)}>
      {t("done")}
    </button>
  ) : (
    <button type="button" data-testid="breathing-stop" onClick={onClose} className={dialogButton()}>
      {t("stop")}
    </button>
  );
  return (
    <Dialog
      title={t("breathTitle")}
      details={
        <>
          <div className="flex flex-wrap gap-[12px]">{control}</div>
          <div className="mt-[16px]">{guide}</div>
          {/* A plain safety line while it runs (UX, 12 Nov): never a claim about what it does. */}
          {!done && (
            <p data-testid="breathing-safety" className="mt-[12px] text-sm text-muted">
              {t("breathSafety")}
            </p>
          )}
        </>
      }
      onCancel={onClose}
      testId="breathing"
    >
      {null}
    </Dialog>
  );
}
