"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { Link } from "@/i18n/navigation";
import { bodyScanAt, GROUNDING } from "@/lib/journal/grounding";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";

// Grounding (1.3, content/toolbox.json): pages of their own, not dialogs, so the help card opens
// over them as it does anywhere (a dialog inside a dialog would fight over Escape and Tab). The
// page puts Back and Get help now on top. Nothing typed, nothing saved, nothing sent: no analytics,
// log or breadcrumb carries a step or a word (Ruling 7). No animation, so reduced motion changes
// nothing; the body scan's clock still counts. Each is inert until its scripts run (useUntilLoaded),
// so a tap before then isn't lost.
const TOOLBOX = "/app/me/toolbox";
// The words in focus stop growing at about 200 % on a narrow screen, as breathing's do.
const BIG = "font-medium text-text leading-tight [font-size:min(1.125rem,max(10vw,32px))]";
// Their buttons stop growing there too, at 48 px high in px: at 300 % Pause wrapped under Stop and
// fell below the first view on a 320 px phone (#299's journey). The same 7:8 at the normal size.
const button = (primary = false) => `${dialogButton(primary).replace("min-h-11", "min-h-[48px]")} [font-size:min(1rem,max(10vw,32px))]`;

// The close, after any of them: the same line, and Done back to the list.
function Close({ testId }: { testId: string }) {
  const t = useTranslations("toolbox");
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus({ preventScroll: true }), []);
  return (
    <div className="space-y-[16px]">
      <p ref={line} tabIndex={-1} role="status" data-testid={testId} className={`${BIG} outline-none`}>
        {t("groundingEnd")}
      </p>
      <Link href={TOOLBOX} data-testid="grounding-done" className={button(true)}>
        {t("done")}
      </Link>
    </div>
  );
}

const SENSE_KEYS = { 5: "senses5", 4: "senses4", 3: "senses3", 2: "senses2", 1: "senses1" } as const;

// 5-4-3-2-1: one sense per screen, Next and Back; steps 4 and 5 say "(or skip)" (Ruling 6).
export function FiveSenses() {
  const t = useTranslations("toolbox");
  const untilLoaded = useUntilLoaded();
  const [step, setStep] = useState(0);
  const total = GROUNDING.senses.length;
  const text = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);
  // Each new step is read out: focus goes to its words (not on the first screen's arrival).
  useEffect(() => {
    if (moved.current) text.current?.focus();
  }, [step]);
  if (step >= total) return <Close testId="senses-end" />;
  const go = (to: number) => {
    moved.current = true;
    setStep(to);
  };
  const n = GROUNDING.senses[step] as keyof typeof SENSE_KEYS;
  return (
    <div {...untilLoaded} className="space-y-[16px]">
      <p ref={text} tabIndex={-1} data-testid="senses-step" data-step={step + 1} className={`${BIG} outline-none`}>
        {t(SENSE_KEYS[n])}
      </p>
      <div className="flex flex-wrap gap-[12px]">
        <button type="button" data-testid="senses-next" onClick={() => go(step + 1)} className={button(true)}>
          {t("groundingNext")}
        </button>
        {step > 0 && (
          <button type="button" data-testid="senses-back" onClick={() => go(step - 1)} className={button()}>
            {t("groundingBack")}
          </button>
        )}
      </div>
    </div>
  );
}

// Body scan: six steps of 20 s, from the clock (a busy tab's timers run late), Pause and Stop
// always there, first under the title. It opens with the way out (Ruling 5).
export function BodyScan() {
  const t = useTranslations("toolbox");
  const untilLoaded = useUntilLoaded();
  const [ran, setRan] = useState(0);
  const [paused, setPaused] = useState(false);
  // Time run before the latest resume, and when that run started.
  const before = useRef(0);
  const since = useRef<number | null>(null);
  const { step, done } = bodyScanAt(ran);
  useEffect(() => {
    if (paused || done) return;
    since.current = Date.now();
    const tick = window.setInterval(() => setRan(before.current + (Date.now() - since.current!) / 1000), 250);
    return () => {
      window.clearInterval(tick);
      if (since.current !== null) before.current += (Date.now() - since.current) / 1000;
      since.current = null;
    };
  }, [paused, done]);
  if (done) return <Close testId="body-scan-end" />;
  return (
    <div {...untilLoaded} className="space-y-[16px]">
      <div className="flex flex-wrap gap-[12px]">
        <Link href={TOOLBOX} data-testid="body-scan-stop" className={button()}>
          {t("stop")}
        </Link>
        <button type="button" data-testid="body-scan-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)} className={button()}>
          {paused ? t("resume") : t("pause")}
        </button>
      </div>
      <p data-testid="body-scan-intro" className="text-muted">
        {t("bodyScanIntro")}
      </p>
      {/* Said once per step, never every second. */}
      <p role="status" data-testid="body-scan-step" data-step={step + 1} className={BIG}>
        {t(`bodyScan${step + 1}` as "bodyScan1")}
      </p>
    </div>
  );
}

// Name it: the check-in's own mood words as chips, only those (Ruling 2); a tap thanks them.
// The choice stays on this screen: nothing is saved or sent.
export function NameIt({ moods }: { moods: number[] }) {
  const t = useTranslations("toolbox");
  const tt = useTranslations("today");
  const untilLoaded = useUntilLoaded();
  const [named, setNamed] = useState<number | null>(null);
  return (
    <div {...untilLoaded} className="space-y-[16px]">
      <p data-testid="name-it-prompt" className="text-text">
        {t("nameItPrompt")}
      </p>
      <div role="group" aria-label={t("groundingNameIt")} className="flex flex-wrap gap-[12px]">
        {moods.map((m) => (
          <button key={m} type="button" data-testid={`name-it-${m}`} aria-pressed={named === m} onClick={() => setNamed(m)} className={button(named === m)}>
            {tt(`mood${m}` as "mood1")}
          </button>
        ))}
      </div>
      <p role="status" data-testid="name-it-thanks" className="min-h-[1.5em] text-text">
        {named !== null ? t("nameItThanks") : ""}
      </p>
      {named !== null && (
        <Link href={TOOLBOX} data-testid="grounding-done" className={button()}>
          {t("done")}
        </Link>
      )}
    </div>
  );
}

// The three, under breathing on Me → Things that help me (grounding-live): links, so they work
// before the page's scripts do.
export function GroundingLinks() {
  const t = useTranslations("toolbox");
  return (
    <div className="flex flex-wrap gap-[12px]" data-testid="grounding-links">
      <Link href={`${TOOLBOX}/5-4-3-2-1`} data-testid="toolbox-senses" className={button()}>
        {t("groundingSenses")}
      </Link>
      <Link href={`${TOOLBOX}/body-scan`} data-testid="toolbox-body-scan" className={button()}>
        {t("groundingBodyScan")}
      </Link>
      <Link href={`${TOOLBOX}/name-it`} data-testid="toolbox-name-it" className={button()}>
        {t("groundingNameIt")}
      </Link>
    </div>
  );
}
