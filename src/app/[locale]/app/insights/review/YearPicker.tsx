"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

// Year in review's year: only years with something in them, newest first.
export function YearPicker({ year, years }: { year: string; years: string[] }) {
  const t = useTranslations("plus");
  const router = useRouter();
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="font-medium">{t("reviewYear")}</span>
      <select
        data-testid="review-year"
        value={year}
        onChange={(e) => router.push(`/app/insights/review?year=${e.target.value}`)}
        className="min-h-11 max-w-full rounded-2xl border border-border bg-surface px-[12px] text-text"
      >
        {(years.includes(year) ? years : [year, ...years]).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
