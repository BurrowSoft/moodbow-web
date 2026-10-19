"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { helplinesFor, telHref } from "@/lib/safety/helplines";

// The safety card (M8, r1 §M8, decision 124): the same card after a flagged
// save, behind Me → Get help now and under a reflection that names it. A
// dismissible dialog; focus moves to its title; Esc or Close closes it.
// Numbers from the country registry as tel: links; without a known
// country, the helpline directory and "your local emergency number".
export function SafetyCard({ country, onClose }: { country: string | null | undefined; onClose: () => void }) {
  const t = useTranslations("safety");
  const lines = helplinesFor(country);
  const link = "font-medium text-accent underline underline-offset-4";
  return (
    <Dialog title={t("safetyTitle")} body={t("safetyBody")} onCancel={onClose} testId="safety-card" initialFocus="title">
      <div className="w-full space-y-3 text-left">
        {lines.helpline && (
          <p>
            <a href={telHref(lines.helpline.dial)} data-testid="safety-call-helpline" className={link}>
              {t("safetyCall", { name: lines.helpline.name, number: lines.helpline.display })}
            </a>
          </p>
        )}
        <p className="text-text">
          {t("safetyEmergency")}
          {lines.emergency && (
            <>
              {" "}
              <a href={telHref(lines.emergency.dial)} data-testid="safety-call-emergency" className={link}>
                {lines.emergency.display}
              </a>
            </>
          )}
        </p>
        {!lines.helpline && (
          <p>
            <a href={lines.directoryUrl} target="_blank" rel="noopener noreferrer" data-testid="safety-find-helpline" className={link}>
              {t("safetyFindHelpline")}
            </a>
          </p>
        )}
        <p className="text-sm text-muted">{t("safetyNotTherapy")}</p>
      </div>
      <button type="button" data-testid="safety-close" className={dialogButton(true)} onClick={onClose}>
        {t("safetyClose")}
      </button>
    </Dialog>
  );
}

// "Get help now" (meGetHelpNow): the button that opens the card, at the top
// of Me on its own and under a reflection that names it. A calm secondary
// button, never red or alarming (decision 128).
export function GetHelpNow({ country, testId, className }: { country: string | null | undefined; testId: string; className?: string }) {
  const t = useTranslations("me");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" data-testid={testId} onClick={() => setOpen(true)} className={className ?? dialogButton()}>
        {t("meGetHelpNow")}
      </button>
      {open && <SafetyCard country={country} onClose={close} />}
    </>
  );
}
