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

  // The slide's heading takes focus after Next / Skip / Back: the link
  // that had it may be gone, and the new slide is read from its title.
  const go = (next: number) => {
    setSlide(next);
    window.setTimeout(() => document.getElementById("welcome-title")?.focus(), 0);
    // No server round trip: Next keeps its router in sync with replaceState.
    window.history.replaceState(window.history.state, "", `?slide=${next + 1}`);
  };
  // Next / Skip / Back are real links to ?slide=N, so they work before JS
  // loads too (decision 73: the server renders that slide). Once running,
  // the click stays on the page instead.
  const slideLink = (next: number) => ({
    href: `?slide=${next + 1}`,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(next);
    },
  });

  return (
    <div className="flex flex-col items-center text-center">
      <div className="min-h-48" data-testid={`welcome-slide-${slide + 1}`}>
        <h1 id="welcome-title" tabIndex={-1} className="outline-none text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{t(SLIDES[slide].title)}</h1>
        {/* The dots below are decoration; this says where you are. */}
        <p className="sr-only">{t("welcomeStep", { n: slide + 1, total: SLIDES.length })}</p>
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
            <a data-testid="welcome-next" {...slideLink(slide + 1)} className={primaryButtonClass}>
              {t("welcomeNext")}
            </a>
            <a data-testid="welcome-skip" {...slideLink(SLIDES.length - 1)} className={textLinkClass}>
              {t("welcomeSkip")}
            </a>
          </>
        )}
        {slide > 0 && (
          <a
            data-testid="welcome-back"
            {...slideLink(slide - 1)}
            className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-muted hover:text-text"
          >
            <ArrowLeft />
            {t("back")}
          </a>
        )}
        <Link href="/sign-in" data-testid="welcome-have-account" className={`${textLinkClass} mt-4 text-sm`}>
          {t("welcomeHaveAccount")}
        </Link>
      </div>
    </div>
  );
}
