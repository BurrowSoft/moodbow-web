"use client";

import { useLocale, useTranslations } from "next-intl";
import { MomentStar } from "@/components/MomentStar";
import { dateLine } from "@/lib/journal/today";
import type { PrintDay } from "@/lib/journal/printMonth";
import { checkInChips } from "../../checkInChips";

// One printed day (1.1 N "Print this month", and Plus's PDF journal): its
// date, mood word, moment star and values, then its entries as written. The
// mood word carries the mood (no colours needed on paper). A long day may run
// over a page break (a whole day moved to the next page left page 1 almost
// blank: Web Tester P2); its date, mood and values stay together and with
// the start of its text.
export function PrintDayBlock({ day, dateLocaleTag }: { day: PrintDay; dateLocaleTag: string }) {
  const tt = useTranslations("today");
  const te = useTranslations("entry");
  const locale = useLocale();
  const c = day.checkIn;
  const moment = day.entries.some((e) => e.isMoment);
  const values = c ? checkInChips(c, tt, locale).map((chip) => chip.label) : [];
  return (
    <section data-testid={`print-day-${day.date}`} className="border-t border-border pt-4">
      <div className="break-inside-avoid-page break-after-avoid-page" data-testid="print-day-head">
        <h2 className="flex flex-wrap items-center gap-x-2 font-medium">
          <span>{dateLine(day.date, dateLocaleTag)}</span>
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
      </div>
      {day.entries.map((e) => (
        <p key={e.id} className="mt-3 whitespace-pre-line" data-testid="print-entry">
          {e.body}
        </p>
      ))}
    </section>
  );
}
