"use client";

import { useCallback, useState, useSyncExternalStore, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { HelpNumberText } from "@/components/HelpNumberText";
import { Link } from "@/i18n/navigation";
import { helpLineSize, helplinesFor, isIos, isShortCode, telHref } from "@/lib/safety/helplines";

const noSubscribe = () => () => {};

// The safety card (M8, r1 §M8, decision 124): the same card after a flagged
// save, behind Me → the help button (meGetHelpNow, "Want to talk to someone?")
// and under a reflection that names it. A
// dismissible dialog; focus moves to its title; Esc or Close closes it.
// Numbers from the country registry as tel: links; without a known
// country, the generic emergency line; the helpline directory always
// (decision 135). neutral: opened by the person from Me (safetyBodyNeutral,
// #9765 S-03); after a flagged entry or a crisis signal, safetyBody. Each
// number once, inside its link (the link text says it, so it can still be
// read out or copied on a computer that can't dial).
export function SafetyCard({ country, onClose, neutral = false }: { country: string | null | undefined; onClose: () => void; neutral?: boolean }) {
  const t = useTranslations("safety");
  const tc = useTranslations("common");
  const lines = helplinesFor(country, useLocale());
  const ios = useSyncExternalStore(noSubscribe, () => isIos(navigator.userAgent, navigator.maxTouchPoints), () => false);
  // The numbers and links stop growing at about 200 % on narrow screens (decision 231). What comes
  // before them stays under the card's own cap (capText in Dialog): at 32 px it pushed the first help
  // line to 939 px, off a 640 px screen (#246). text-sm here: the same 7:8 as at the normal size.
  const help = "[font-size:min(1rem,max(10vw,32px))]";
  const link = "font-medium text-accent underline underline-offset-4";
  const small = "text-muted [font-size:min(0.875rem,max(8.75vw,28px))]";
  return (
    <Dialog title={t("safetyTitle")} body={t(neutral ? "safetyBodyNeutral" : "safetyBody")} onCancel={onClose} testId="safety-card" initialFocus="title" capText>
      <div className="w-full space-y-[max(6px,calc(28px-1rem))] text-left">
        {lines.helpline &&
          (ios && isShortCode(lines.helpline.dial) ? (
            <div>
              {/* iOS can't dial this from a link: the number, and what to do with it. */}
              <p className={`font-medium text-text ${helpLineSize(lines.helpline.display)}`}><HelpNumberText text={t("safetyCall", { name: lines.helpline.name, number: lines.helpline.display })} number={lines.helpline.display} /></p>
              <p data-testid="safety-helpline-keypad" className={small}>
                <HelpNumberText text={t("safetyDialKeypad", { number: lines.helpline.display })} number={lines.helpline.display} />
              </p>
            </div>
          ) : (
            <p>
              <a href={telHref(lines.helpline.dial)} data-testid="safety-call-helpline" className={`${link} ${helpLineSize(lines.helpline.display)}`}>
                <HelpNumberText text={t("safetyCall", { name: lines.helpline.name, number: lines.helpline.display })} number={lines.helpline.display} />
              </a>
            </p>
          ))}
        {lines.helpline?.hours && (
          <p data-testid="safety-helpline-hours" className={small}>
            {lines.helpline.hours}
          </p>
        )}
        <p className="text-text">{t("safetyEmergency")}</p>
        {/* Its own line; the visible text is the spoken name (WCAG 2.5.3). */}
        {lines.emergency && (
          <p>
            <a href={telHref(lines.emergency.dial)} data-testid="safety-call-emergency" className={`${link} ${helpLineSize(lines.emergency.display)}`}>
              <HelpNumberText text={t("safetyCallEmergency", { number: lines.emergency.display })} number={lines.emergency.display} />
            </a>
          </p>
        )}
        {/* Always, as a quiet link under the numbers (decision 135). */}
        <p>
          <a href={lines.directoryUrl} target="_blank" rel="noopener noreferrer" data-testid="safety-find-helpline" className={`${small} underline underline-offset-4`}>
            {t("safetyFindHelpline")}
            {" "}
            <span className="sr-only">{tc("opensInNewTab")}</span>
          </a>
        </p>
        <p className={small}>{t("safetyNotTherapy")}</p>
      </div>
      {/* Close is secondary (outline): the help above is what stands out
          (decision 206, the same as the app). */}
      <button type="button" data-testid="safety-close" className={`${dialogButton()} ${help}`} onClick={onClose}>
        {t("safetyClose")}
      </button>
    </Dialog>
  );
}

// The help button (meGetHelpNow, "Want to talk to someone?", decision 153):
// opens the card, at the top
// of Me on its own and under a reflection that names it. A calm secondary
// button, never red or alarming (decision 128). neutral: on Me, where
// nothing flagged led to it. A real link to the public help page, so help never depends on the
// page's scripts (#248); once they're running it opens the card instead. The link carries the
// country, so that page can show its numbers without reading the account.
export function GetHelpNow({ country, testId, className, neutral }: { country: string | null | undefined; testId: string; className?: string; neutral?: boolean }) {
  const t = useTranslations("me");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const openCard = (e: MouseEvent) => {
    // A new tab or window is still theirs to ask for.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpen(true);
  };
  return (
    <>
      <Link href={country ? `/help/get-help-now?country=${encodeURIComponent(country)}` : "/help/get-help-now"} prefetch={false} data-testid={testId} onClick={openCard} className={className ?? dialogButton()}>
        {t("meGetHelpNow")}
      </Link>
      {open && <SafetyCard country={country} onClose={close} neutral={neutral} />}
    </>
  );
}
