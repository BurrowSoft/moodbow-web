import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// The row at the top of Insights into Your year in Moodbow (1.4 A; always, on the Plus view and the
// Free example alike; Today's card is YearTodayCard). `query` carries a Preview's ?today= to the
// page (lib/journal/previewToday); it's empty everywhere else.
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
