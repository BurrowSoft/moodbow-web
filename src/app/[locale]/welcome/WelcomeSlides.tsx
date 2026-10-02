"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { primaryButtonClass, textLinkClass } from "@/components/AuthField";
import { ArrowLeft } from "@/components/BackLink";

// The three welcome slides on one URL (M3). Skip on slides 1–2 jumps to
// slide 3 (the privacy promise), whose only button is Get started →
// Consent. The slide is mirrored into ?slide= with replace (no history
// entry per slide, no refetch), so Back from Consent returns to slide 3.
// welcome3BodyNoAi while AI is off (text = enforcement).
const SLIDES = [
  { title: "welcome1Title", body: "welcome1Body" },
  { title: "welcome2Title", body: "welcome2Body" },
  { title: "welcome3Title", body: "welcome3BodyNoAi" },
] as const;

// ?slide=1..3; anything else is slide 1.
export function slideFromQuery(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n - 1 : 0;
}

export function WelcomeSlides() {
  const t = useTranslations("onboarding");
  // Read on mount from the live URL: after browser Back from Consent, Next
  // restores this page from its cache, where only the URL still says 3.
  const params = useSearchParams();
  const [slide, setSlide] = useState(() => slideFromQuery(params.get("slide")));
  const last = slide === SLIDES.length - 1;

  const go = (next: number) => {
    setSlide(next);
    // No server round trip: Next keeps its router in sync with replaceState.
    window.history.replaceState(window.history.state, "", `?slide=${next + 1}`);
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="min-h-48" data-testid={`welcome-slide-${slide + 1}`}>
        <h1 className="text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{t(SLIDES[slide].title)}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">{t(SLIDES[slide].body)}</p>
      </div>
      <div className="mt-6 flex gap-2" aria-hidden="true">
        {SLIDES.map((s, i) => (
          <span key={s.title} className={`h-2 w-2 rounded-full ${i === slide ? "bg-accent" : "bg-border"}`} />
        ))}
      </div>
      <div className="mt-10 flex w-full flex-col items-center gap-4">
        {last ? (
          <Link href="/consent" data-testid="welcome-start" className={primaryButtonClass}>
            {t("welcomeStart")}
          </Link>
        ) : (
          <>
            <button type="button" data-testid="welcome-next" onClick={() => go(slide + 1)} className={primaryButtonClass}>
              {t("welcomeNext")}
            </button>
            <button type="button" data-testid="welcome-skip" onClick={() => go(SLIDES.length - 1)} className={textLinkClass}>
              {t("welcomeSkip")}
            </button>
          </>
        )}
        {slide > 0 && (
          <button
            type="button"
            data-testid="welcome-back"
            onClick={() => go(slide - 1)}
            className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-muted hover:text-text"
          >
            <ArrowLeft />
            {t("back")}
          </button>
        )}
        <Link href="/sign-in" data-testid="welcome-have-account" className={`${textLinkClass} mt-4 text-sm`}>
          {t("welcomeHaveAccount")}
        </Link>
      </div>
    </div>
  );
}
