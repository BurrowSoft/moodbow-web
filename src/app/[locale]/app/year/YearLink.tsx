import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";

// The ways into Your year in Moodbow (1.4 A): Today's card (1 December to 31 January) and the row at
// the top of Insights (always, on the Plus view and the Free example alike). `query` carries a
// Preview's ?today= to the page (lib/journal/previewToday); it's empty everywhere else.
// isNew: a small "New" label its first week, 1 to 7 December (UX, 19 Nov), read before the title.
export async function YearTodayCard({ year, query, isNew = false }: { year: number; query: string; isNew?: boolean }) {
  const t = await getTranslations("year");
  return (
    <section aria-labelledby="year-card-title" data-testid="year-today-card" className={JOURNAL_CARD}>
      <h2 id="year-card-title" className="flex flex-wrap items-center gap-x-[8px] gap-y-[4px] text-lg font-medium text-text">
        {isNew && (
          <span data-testid="year-today-new" className="rounded-full border border-accent px-[8px] text-sm font-medium text-accent">
            {t("new")}
          </span>
        )}
        <span className="min-w-0 [overflow-wrap:anywhere]">{t("title")}</span>
      </h2>
      <p className="mt-1 text-muted">{t("todayLine", { year })}</p>
      <Link
        href={`/app/year${query}`}
        data-count="year_review_open"
        data-testid="year-today-open"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-[24px] font-medium text-on-accent hover:bg-accent-hover"
      >
        {t("open")}
      </Link>
    </section>
  );
}

export async function YearInsightsRow({ year, query }: { year: number; query: string }) {
  const t = await getTranslations("year");
  return (
    <Link
      href={`/app/year${query}`}
      data-count="year_review_open"
      data-testid="year-insights-row"
      className="flex min-h-12 flex-wrap items-center justify-between gap-x-[12px] gap-y-[4px] rounded-2xl border border-border bg-surface px-[16px] py-[12px] text-text hover:border-accent"
    >
      <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{t("title")}</span>
      <span className="shrink-0 text-sm text-muted">{year}</span>
    </Link>
  );
}
