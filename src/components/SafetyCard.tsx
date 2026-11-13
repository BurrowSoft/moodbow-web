"use client";

import { useCallback, useState, useSyncExternalStore, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { HelpNumberText } from "@/components/HelpNumberText";
import { Link } from "@/i18n/navigation";
import { helpLineSize, helplinesFor, isIos, isShortCode, telHref } from "@/lib/safety/helplines";
import { useRequestCountry } from "@/components/RequestCountry";
import { countryName } from "@/lib/region/countries";

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
  // No profile country (a page that couldn't read it, or none set): the country this request
  // came from (the root layout's), so a number to tap is there whenever one can be. With none,
  // the card as before: the sentence and Find a helpline.
  const requestCountry = useRequestCountry();
  const requested = country ? null : requestCountry;
  const locale = useLocale();
  const lines = helplinesFor(country || requested, locale);
  // Numbers from where the request came from, not the person's own country: say whose they
  // are, so someone travelling or on a VPN can tell (UX). The browser's own country name.
  const fromRequest = !country && requested && (lines.helpline || lines.emergency) ? countryName(requested, locale) : null;
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
        {fromRequest && (
          <p data-testid="safety-request-country" className="font-medium text-text">
            {fromRequest}
          </p>
        )}
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
// page's scripts (#248); once they're running it opens the card instead. Its words stay whole: browser
// hyphens split "par-ler" with room to spare (Web Tester). It stops growing at about 200 % on a narrow
// screen, in em, so at the normal size it's the size of the text around it.
// icon: Today's standing help button (UX & PM, 13 Nov; specs/1.2-features.md): a lifebuoy, named
// and titled with the same words, opening the same card. Quiet (no colour of its own, no banner) and
// 48 px in px, so large text never makes it push Write out of Today's header.
export function GetHelpNow({ country, testId, className, neutral, icon }: { country: string | null | undefined; testId: string; className?: string; neutral?: boolean; icon?: boolean }) {
  const t = useTranslations("me");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const openCard = (e: MouseEvent) => {
    // A new tab or window is still theirs to ask for.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpen(true);
  };
  const name = t("meGetHelpNow");
  return (
    <>
      {icon ? (
        <Link
          href="/help/get-help-now"
          prefetch={false}
          data-testid={testId}
          onClick={openCard}
          aria-label={name}
          title={name}
          className={className ?? "inline-flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-pill hover:text-text"}
        >
          <LifebuoyIcon />
        </Link>
      ) : (
        <Link href="/help/get-help-now" prefetch={false} data-testid={testId} onClick={openCard} className={className ?? `${dialogButton(false, false)} [font-size:min(1em,max(10vw,32px))]`}>
          {name}
        </Link>
      )}
      {open && <SafetyCard country={country} onClose={close} neutral={neutral} />}
    </>
  );
}

// A lifebuoy, in the tab bar's line style; its name is the link's (aria-label), so it's hidden here.
function LifebuoyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-testid="lifebuoy-icon">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" />
    </svg>
  );
}
