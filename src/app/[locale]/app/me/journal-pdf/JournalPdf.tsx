"use client";

import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { useRouter } from "@/i18n/navigation";
import type { PrintDay } from "@/lib/journal/printMonth";
import { byMonth, pdfCounts, type PdfPeriod } from "@/lib/plus/journalPdf";
import { formatMonth } from "@/lib/share/moodbow";
import { PrintDayBlock } from "../../print/[month]/PrintDayBlock";

// Moodbow Plus: the designed PDF journal (decision 246; UX's note, 11 Nov).
// On screen: pick a month or a year, then one button; the browser's print
// dialog makes the PDF on the device ("Save as PDF" is built in). On paper:
// a cover with the period and its counts, then each day (the same day block
// as "Print this month"), a new page per month in a year, and the help line
// last. Only the person's own words and check-ins: no AI, scores or streaks.
export function JournalPdf({
  period,
  title,
  days,
  months,
  years,
  dateLocaleTag,
}: {
  period: PdfPeriod | null;
  title: string | null;
  days: PrintDay[];
  months: string[];
  years: string[];
  dateLocaleTag: string;
}) {
  const t = useTranslations("plus");
  const tm = useTranslations("meta");
  const tl = useTranslations("timeline");
  const router = useRouter();
  const kind = period?.kind ?? "month";
  const go = (key: string) => router.push(`/app/me/journal-pdf?period=${key}`);
  const counts = pdfCounts(days);
  const field = "min-h-11 w-full max-w-full rounded-2xl border border-border bg-surface px-[12px] text-text";

  const picker = (
    <div className="space-y-4 print:hidden" data-testid="pdf-picker">
      <h1 className="text-2xl font-medium tracking-tight">{t("rowPdf")}</h1>
      <p className="text-text">{t("pdfIntro")}</p>
      <fieldset className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(["month", "year"] as const).map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="pdf-kind"
                data-testid={`pdf-kind-${k}`}
                checked={kind === k}
                onChange={() => {
                  const first = k === "month" ? months[0] : years[0];
                  if (first) go(first);
                }}
              />
              {k === "month" ? t("pdfMonth") : t("pdfYear")}
            </label>
          ))}
        </div>
        <select
          aria-label={kind === "month" ? t("pdfMonth") : t("pdfYear")}
          data-testid="pdf-period"
          value={period?.key ?? ""}
          onChange={(e) => e.target.value && go(e.target.value)}
          className={field}
        >
          {!period && <option value="" />}
          {(kind === "month" ? months : years).map((key) => (
            <option key={key} value={key}>
              {kind === "month" ? formatMonth(key, dateLocaleTag) : key}
            </option>
          ))}
        </select>
      </fieldset>
      {period && days.length > 0 && (
        <button type="button" data-testid="pdf-print" onClick={() => window.print()} className={dialogButton(true)}>
          {t("pdfButton")}
        </button>
      )}
      {period && days.length === 0 && (
        <p data-testid="pdf-empty" className="text-muted">
          {t("pdfEmpty", { period: title ?? "" })}
        </p>
      )}
    </div>
  );

  if (!period || !title || days.length === 0) return picker;

  const sections = period.kind === "year" ? byMonth(days) : [{ month: period.key, days }];
  return (
    <>
      {picker}
      {/* A layout table only for its footer: browsers repeat a <tfoot> on every
          printed page in space of its own (as "Print this month"). */}
      <table role="presentation" data-testid="pdf-journal" className="mt-8 w-full border-collapse print:mt-0 print:text-[11pt]">
        <tfoot className="hidden print:table-footer-group">
          <tr>
            <td className="pt-6 text-center text-[9pt]">{tl("printFooter", { month: title })}</td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="p-0 align-top">
              <section data-testid="pdf-cover" className="flex min-h-[40vh] flex-col justify-center gap-2 break-after-page py-12 text-center print:min-h-[230mm]">
                <p className="text-lg font-medium tracking-wide">{tm("siteName")}</p>
                <h2 className="text-4xl font-medium tracking-tight">{t("pdfCoverTitle")}</h2>
                <p className="text-2xl">{title}</p>
                <p className="mt-4 text-muted" data-testid="pdf-counts">
                  {t("pdfCoverCounts", counts)}
                </p>
              </section>
              {sections.map((s, i) => (
                <div key={s.month} data-testid={`pdf-month-${s.month}`} className={i > 0 ? "break-before-page" : undefined}>
                  {period.kind === "year" && <h2 className="mb-4 text-2xl font-medium tracking-tight">{formatMonth(s.month, dateLocaleTag)}</h2>}
                  <div className="space-y-6">
                    {s.days.map((d) => (
                      <PrintDayBlock key={d.date} day={d} dateLocaleTag={dateLocaleTag} />
                    ))}
                  </div>
                </div>
              ))}
              <p data-testid="pdf-help" className="mt-10 break-inside-avoid-page text-center text-[9pt] text-muted">
                {t("pdfHelp")}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
