import { useLocale, useTranslations } from "next-intl";
import { BackLink } from "@/components/BackLink";
import { GetHelpNow } from "@/components/SafetyCard";
import { Link } from "@/i18n/navigation";
import { dateLine } from "@/lib/journal/today";
import type { YearReview } from "@/lib/plus/yearReview";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { Chart } from "../Chart";
import { YearPicker } from "./YearPicker";

const CARD = "rounded-3xl border border-border bg-surface p-[20px]";

// Year in review (Plus, decision 246; UX's copy, 11 Nov): help first, then the
// year's data as it is. No scores, best or worst, no special tone for a hard
// year, and no AI text.
export function YearReviewView({
  year,
  years,
  soFar,
  review,
  country,
  backLabel,
  dateLocaleTag,
}: {
  year: string;
  years: string[];
  soFar: boolean;
  review: YearReview | null;
  country: string | null | undefined;
  backLabel: string;
  dateLocaleTag: string;
}) {
  const t = useTranslations("plus");
  const ti = useTranslations("insights");
  const locale = useLocale();
  const one = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const monthName = new Intl.DateTimeFormat(dateLocaleTag, { month: "short", timeZone: "UTC" });
  const months = Array.from({ length: 12 }, (_, i) => monthName.format(new Date(Date.UTC(Number(year), i, 15))));
  const empty = !review || (review.days === 0 && review.entries === 0);
  const maxDays = review ? Math.max(1, ...review.daysByMonth) : 1;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px]">
        <BackLink href="/app/insights" label={backLabel} testId="nav-back" />
        <GetHelpNow country={country} testId="review-get-help" neutral />
      </div>
      <h1 className={JOURNAL_HEADING} data-testid="review-title">
        {soFar ? t("reviewTitleSoFar", { year }) : t("reviewTitle", { year })}
      </h1>
      <YearPicker year={year} years={years} />

      {empty ? (
        <p className="text-muted" data-testid="review-empty">
          {t("reviewEmpty", { year })}
        </p>
      ) : (
        <>
          <section aria-labelledby="review-days" className={CARD} data-testid="review-days">
            <h2 id="review-days" className="text-lg font-medium">
              {t("reviewDaysTitle")}
            </h2>
            <p className="mt-1 font-medium">{t("reviewDays", { days: review.days })}</p>
            <figure className="mt-3">
              <div aria-hidden="true" className="flex h-24 items-end gap-1">
                {review.daysByMonth.map((n, i) => (
                  <div key={i} className="flex-1 rounded-t bg-accent" style={{ height: `${(n / maxDays) * 100}%`, minHeight: n > 0 ? 2 : 0 }} />
                ))}
              </div>
              <figcaption className="mt-2 text-sm text-muted">{t("reviewDaysCaption")}</figcaption>
              {/* The bars' numbers, for a screen reader. */}
              <ul className="sr-only">
                {review.daysByMonth.map((n, i) => (
                  <li key={i}>
                    <span>{months[i]}</span> <span>{t("reviewDays", { days: n })}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </section>

          <section aria-labelledby="review-mood" className={CARD} data-testid="review-mood">
            <h2 id="review-mood" className="text-lg font-medium">
              {t("reviewMoodTitle")}
            </h2>
            {review.moodEnough ? (
              <figure className="mt-3">
                <Chart kind="line" points={review.moodByMonth} min={1} max={5} labelledBy="review-mood review-mood-caption" colourKey="mood" gradientId="review-mood-gradient" />
                <figcaption id="review-mood-caption" className="mt-2 text-sm text-muted">
                  {t("reviewMoodCaption")}
                </figcaption>
                <p className="mt-1 text-xs text-muted">{t("longFootnoteMonth")}</p>
              </figure>
            ) : (
              <p className="mt-3 text-sm text-muted" data-testid="review-mood-not-enough">
                {t("longNotEnough")}
              </p>
            )}
          </section>

          <section aria-labelledby="review-factors" className={CARD} data-testid="review-factors">
            <h2 id="review-factors" className="text-lg font-medium">
              {t("reviewFactorsTitle")}
            </h2>
            <ul className="mt-3 space-y-2">
              {(
                [
                  ["sleep", ti("chartSleep"), review.factors.sleep, (v: number) => t("reviewSleep", { hours: one.format(v) })],
                  ["movement", ti("chartExercise"), review.factors.movement, (v: number) => t("reviewMovement", { minutes: Math.round(v) })],
                  ["stress", ti("chartStress"), review.factors.stress, (v: number) => t("reviewStress", { stress: one.format(v) })],
                ] as const
              ).map(([id, label, v, line]) => (
                <li key={id} data-testid={`review-factor-${id}`}>
                  {v === null ? (
                    <>
                      <span className="font-medium">{label}</span> <span className="text-muted">{t("reviewNotEnough", { year })}</span>
                    </>
                  ) : (
                    line(v)
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="review-writing" className={CARD} data-testid="review-writing">
            <h2 id="review-writing" className="text-lg font-medium">
              {t("reviewWritingTitle")}
            </h2>
            <p className="mt-1">{t("reviewWriting", { entries: review.entries, moments: review.moments.length })}</p>
          </section>

          <section aria-labelledby="review-moments" className={CARD} data-testid="review-moments">
            <h2 id="review-moments" className="text-lg font-medium">
              {t("reviewMomentsTitle")}
            </h2>
            {review.moments.length === 0 ? (
              <p className="mt-1 text-muted">{t("reviewNoMoments", { year })}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {review.moments.map((mo) => (
                  <li key={mo.id}>
                    <Link href={`/app/entries/${mo.id}`} data-testid="review-moment" className="block rounded-2xl py-1 text-text">
                      <span className="block text-sm font-medium text-accent">{dateLine(mo.date, dateLocaleTag)}</span>
                      <span className="block [overflow-wrap:anywhere]">{mo.opening}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
