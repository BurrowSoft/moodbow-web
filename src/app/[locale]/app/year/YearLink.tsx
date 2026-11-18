import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";

// The ways into Your year in Moodbow (1.4 A): Today's card (1 December to 31 January) and the row at
// the top of Insights (always, on the Plus view and the Free example alike). `query` carries a
// Preview's ?today= to the page (lib/journal/previewToday); it's empty everywhere else.
export async function YearTodayCard({ year, query }: { year: number; query: string }) {
  const t = await getTranslations("year");
  return (
    <section aria-labelledby="year-card-title" data-testid="year-today-card" className={JOURNAL_CARD}>
      <h2 id="year-card-title" className="text-lg font-medium text-text">
        {t("title")}
      </h2>
      <p className="mt-1 text-muted">{t("todayLine", { year })}</p>
      <Link
        href={`/app/year${query}`}
        data-count="year_review_open"
        data-testid="year-today-open"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 font-medium text-on-accent hover:bg-accent-hover"
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
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-text hover:border-accent"
    >
      <span className="font-medium">{t("title")}</span>
      <span className="text-sm text-muted">{year}</span>
    </Link>
  );
}
