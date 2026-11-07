"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useKeyboardOpen } from "@/lib/ui/keyboardOpen";

// Only at the top level of the four tabs (UX & PM 2026-11-06): hidden in the
// editor, a day, an entry, and Bo itself.
const TOP_LEVEL = ["/app", "/app/timeline", "/app/insights", "/app/me"];
// Its sides and the window's margins, as in the classes below.
const SIDES_PX = 40 + 32;

// The way to Bo, one tap away. Above the phone's tab bar, and out of the way while
// the on-screen keyboard is up. The layout decides whether it's shown at all, and
// the function still decides whether Bo opens: this never opens anything itself.
// One line under the safety card's cap, so it stays a small part of the window: the
// tab bar's height is its only rem, as it has to clear the bar. Where the words still
// don't fit, the icon alone, with the words as its name (UX, #205). It never covers the
// page: has-bo-button (globals.css) gives the page's end room for it, with the same sums.
export function BoButton() {
  const t = useTranslations("bo");
  const path = usePathname();
  const keyboard = useKeyboardOpen();
  const onTab = TOP_LEVEL.includes(path);
  const shown = onTab && !keyboard;
  const label = useRef<HTMLSpanElement>(null);
  const [iconOnly, setIconOnly] = useState(false);
  useEffect(() => {
    if (!onTab) return;
    document.body.classList.add("has-bo-button");
    return () => document.body.classList.remove("has-bo-button");
  }, [onTab]);
  useEffect(() => {
    const words = label.current;
    if (!shown || !words || typeof ResizeObserver === "undefined") return;
    const fit = () => setIconOnly(words.offsetWidth + SIDES_PX > window.innerWidth);
    const observer = new ResizeObserver(fit);
    observer.observe(words);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [shown]);
  if (!shown) return null;
  return (
    <Link
      href="/app/bo"
      aria-label={t("boButton")}
      data-testid="bo-button"
      className={`bo-button fixed bottom-[calc(3.5rem+16px)] right-[16px] z-20 inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-accent py-[8px] text-center font-medium leading-[1.5] text-on-accent shadow-lg [font-size:min(1rem,max(8vw,16px))] hover:bg-accent-hover print:hidden md:bottom-[24px] md:right-[24px] ${iconOnly ? "" : "px-[20px]"}`}
    >
      {/* Still there when hidden: it's what says whether the words fit again. */}
      <span ref={label} className={`whitespace-nowrap ${iconOnly ? "invisible absolute" : ""}`}>
        {t("boButton")}
      </span>
      {iconOnly && (
        <svg data-testid="bo-button-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[24px] w-[24px]">
          <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3.2A8 8 0 1 1 21 12Z" />
        </svg>
      )}
    </Link>
  );
}
