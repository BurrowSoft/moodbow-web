"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { helplinesFor, telHref } from "@/lib/safety/helplines";

// The safety card (M8, r1 §M8, decision 124): the same card after a flagged
// save, behind Me → the help button (meGetHelpNow, "Want to talk to someone?")
// and under a reflection that names it. A
// dismissible dialog; focus moves to its title; Esc or Close closes it.
// Numbers from the country registry as tel: links; without a known
// country, the generic emergency line; the helpline directory always
// (decision 135).
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
        <p className="text-text">{t("safetyEmergency")}</p>
        {/* Its own line; the visible text is the spoken name (WCAG 2.5.3). */}
        {lines.emergency && (
          <p>
            <a href={telHref(lines.emergency.dial)} data-testid="safety-call-emergency" className={link}>
              {t("safetyCallEmergency", { number: lines.emergency.display })}
            </a>
          </p>
        )}
        {/* Always, as a quiet link under the numbers (decision 135). */}
        <p>
          <a href={lines.directoryUrl} target="_blank" rel="noopener noreferrer" data-testid="safety-find-helpline" className="text-sm text-muted underline underline-offset-4">
            {t("safetyFindHelpline")}
          </a>
        </p>
        <p className="text-sm text-muted">{t("safetyNotTherapy")}</p>
      </div>
      <button type="button" data-testid="safety-close" className={dialogButton(true)} onClick={onClose}>
        {t("safetyClose")}
      </button>
    </Dialog>
  );
}

// The help button (meGetHelpNow, "Want to talk to someone?", decision 153):
// opens the card, at the top
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
