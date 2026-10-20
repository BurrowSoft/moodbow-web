"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { dateLine } from "@/lib/journal/today";
import type { PrintDay } from "@/lib/journal/printMonth";
import { takePrintRequest } from "@/lib/journal/printOnce";
import { checkInChips } from "../../checkInChips";

// Print a month (1.1 N): a clean layout and the browser's print dialog
// ("Save as PDF" is built in). Nothing is uploaded or made on a server; the
// page prints locally. The mood word carries the mood (no colours needed on
// paper); entries print as written.
export function PrintMonth({ month, title, days, dateLocaleTag }: { month: string; title: string; days: PrintDay[]; dateLocaleTag: string }) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const te = useTranslations("entry");

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
          {days.map((d) => {
            const c = d.checkIn;
            const moment = d.entries.some((e) => e.isMoment);
            const values = c ? checkInChips(c, tt).map((chip) => chip.label) : [];
            return (
              <section key={d.date} data-testid={`print-day-${d.date}`} className="break-inside-avoid-page border-t border-border pt-4">
                <h2 className="flex flex-wrap items-center gap-x-2 font-medium">
                  <span>{dateLine(d.date, dateLocaleTag)}</span>
                  {c && (
                    <span>
                      <span aria-hidden="true">·</span> {tt(`mood${c.mood}` as "mood1")}
                    </span>
                  )}
                  {moment && <MomentStar label={te("momentBadge")} />}
                </h2>
                {values.length > 0 && (
                  <p className="mt-1 text-sm text-muted" data-testid="print-values">
                    {values.join(" · ")}
                  </p>
                )}
                {d.entries.map((e) => (
                  <p key={e.id} className="mt-3 whitespace-pre-line" data-testid="print-entry">
                    {e.body}
                  </p>
                ))}
              </section>
            );
          })}
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
