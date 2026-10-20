"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { askToPrint } from "@/lib/journal/printOnce";

// "Print this month" (1.1 N): to /app/print/YYYY-MM, asking that page for
// the print dialog once. A new tab or window (Ctrl/Cmd/Shift/middle click)
// opens without the dialog and leaves no request behind here. In a Timeline
// month header and under the calendar; the same link look as Share.
export const PRINT_LINK = "inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4";

export function PrintMonthLink({ month, testId }: { month: string; testId: string }) {
  const t = useTranslations("timeline");
  return (
    <Link
      href={`/app/print/${month}`}
      onClick={(e) => {
        if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) askToPrint(month);
      }}
      data-testid={testId}
      className={PRINT_LINK}
    >
      {t("printMonth")}
    </Link>
  );
}
