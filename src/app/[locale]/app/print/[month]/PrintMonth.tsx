"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { dateLine } from "@/lib/journal/today";
import type { PrintDay } from "@/lib/journal/printMonth";
import { checkInChips } from "../../checkInChips";

// Print a month (1.1 N): a clean layout that opens the browser's print
// dialog ("Save as PDF" is built in). Nothing is uploaded or made on a
// server; the page prints locally. The mood word carries the mood (no
// colours needed on paper); entries print as written.
export function PrintMonth({ title, days, dateLocaleTag }: { title: string; days: PrintDay[]; dateLocaleTag: string }) {
  const t = useTranslations("timeline");
  const tt = useTranslations("today");
  const te = useTranslations("entry");

  // Once, when the page has drawn.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.print());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <article data-testid="print-month" className="print:text-[11pt]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight">{title}</h1>
        <button
          type="button"
          data-testid="print-again"
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

      {/* On every printed page (fixed in print). */}
      <p className="hidden print:fixed print:inset-x-0 print:bottom-0 print:block print:text-center print:text-[9pt]" data-testid="print-footer">
        {t("printFooter", { month: title })}
      </p>
    </article>
  );
}
