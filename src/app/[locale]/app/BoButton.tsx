"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useKeyboardOpen } from "@/lib/ui/keyboardOpen";

// Only at the top level of the four tabs (UX & PM 2026-11-06): hidden in the
// editor, a day, an entry, and Bo itself.
const TOP_LEVEL = ["/app", "/app/timeline", "/app/insights", "/app/me"];

// The way to Bo, one tap away. Above the phone's tab bar, and out of the way while
// the on-screen keyboard is up. The layout decides whether it's shown at all, and
// the function still decides whether Bo opens: this never opens anything itself.
export function BoButton() {
  const t = useTranslations("bo");
  const path = usePathname();
  const keyboard = useKeyboardOpen();
  if (!TOP_LEVEL.includes(path) || keyboard) return null;
  return (
    <Link
      href="/app/bo"
      data-testid="bo-button"
      className="fixed bottom-24 right-4 z-20 inline-flex min-h-12 max-w-[calc(100vw-2rem)] items-center justify-center rounded-full bg-accent px-5 py-2 text-center font-medium text-on-accent shadow-lg [overflow-wrap:anywhere] hover:bg-accent-hover print:hidden md:bottom-6 md:right-6"
    >
      {t("boButton")}
    </Link>
  );
}
