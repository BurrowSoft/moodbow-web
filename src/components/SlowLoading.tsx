"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// "Taking longer than usual…" once something has been loading for 3 s (UX;
// the same rule on the app). Before that, nothing: most loads are faster,
// and a flash of text would be noise. After ~10 s the page itself stops
// waiting and shows the error with Try again (lib/supabase/deadline.ts).
export const SLOW_AFTER_MS = 3000;

export function SlowLoading({ active = true }: { active?: boolean }) {
  const t = useTranslations("app");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return (
    <p role="status" data-testid="slow-loading" className="text-muted">
      {active && slow ? t("slowLoading") : null}
    </p>
  );
}
