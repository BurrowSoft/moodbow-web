"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { PrintDay } from "@/lib/journal/printMonth";
import { takePrintRequest } from "@/lib/journal/printOnce";
import { PrintDayBlock } from "./PrintDayBlock";

// Print a month (1.1 N): a clean layout and the browser's print dialog
// ("Save as PDF" is built in). Nothing is uploaded or made on a server; the
// page prints locally. The mood word carries the mood (no colours needed on
// paper); entries print as written.
export function PrintMonth({ month, title, days, dateLocaleTag }: { month: string; title: string; days: PrintDay[]; dateLocaleTag: string }) {
  const t = useTranslations("timeline");

  // Only when arriving from "Print this month", once the page has drawn
  // (never on a refresh, Back or a link opened elsewhere: the button is here).
  // The request is taken into a ref, so StrictMode's second effect run in
  // development still prints (reviewer #96).
  const wanted = useRef<boolean | null>(null);
  useEffect(() => {
    wanted.current ??= takePrintRequest(month);
    if (!wanted.current) return;
    const frame = window.requestAnimationFrame(() => {
      wanted.current = false;
      window.print();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [month]);

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight">{title}</h1>
        <button
          type="button"
          data-testid="print-button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-text hover:bg-pill print:hidden"
        >
          {t("printMonth")}
        </button>
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-muted" data-testid="print-empty">
          {t("printEmpty")}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {days.map((d) => (
            <PrintDayBlock key={d.date} day={d} dateLocaleTag={dateLocaleTag} />
          ))}
        </div>
      )}
    </>
  );

  // A layout table only for its footer: browsers repeat a <tfoot> on every
  // printed page in space of its own, so "Moodbow · {month}" never covers a
  // page's last lines (a fixed footer would; reviewer #96). Not on screen.
  return (
    <table role="presentation" data-testid="print-month" className="w-full border-collapse print:text-[11pt]">
      <tfoot className="hidden print:table-footer-group">
        <tr>
          <td className="pt-6 text-center text-[9pt]" data-testid="print-footer">
            {t("printFooter", { month: title })}
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="p-0 align-top">{content}</td>
        </tr>
      </tbody>
    </table>
  );
}
