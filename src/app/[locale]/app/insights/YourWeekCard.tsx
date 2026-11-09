import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GetHelpNow } from "@/components/SafetyCard";
import { dateLine, dateRangeLine } from "@/lib/journal/today";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import type { YourWeek, YourWeekLine } from "@/lib/journal/yourWeek";

const TEXT = {
  patternSleep: "yourWeekPatternSleep",
  patternMovement: "yourWeekPatternMovement",
  patternStress: "yourWeekPatternStress",
  lookMoreGood: "yourWeekLookMoreGood",
  lookGoodNoLow: "yourWeekLookGoodNoLow",
  lookSteady: "yourWeekLookSteady",
  lookMixed: "yourWeekLookMixed",
} as const;

// Your week (specs/your-week.md): the rules are lib/journal/yourWeek. Server-rendered
// from the check-ins this page already read: nothing new is stored or sent, and
// nothing here logs which kind of week it was (Reviewer). A hard week is only that
// line and the way to the safety card, opened neutrally: this isn't a crisis check.
export async function YourWeekCard({ week, country, dateLocaleTag }: { week: YourWeek; country: string | null | undefined; dateLocaleTag: string }) {
  const t = await getTranslations("insights");
  const range = dateRangeLine(week.start, week.end, dateLocaleTag);
  const line = (l: YourWeekLine) =>
    l.template === "moment" ? (
      <p key="moment">
        <Link href={`/app/entries/${l.id}?from=/app/timeline/${l.date}`} data-testid="your-week-moment" className="font-medium text-accent underline underline-offset-4">
          {t("yourWeekMoment", { date: dateLine(l.date, dateLocaleTag) })}
        </Link>
      </p>
    ) : (
      <p key={l.template} data-testid={`your-week-${l.template}`}>
        {t(TEXT[l.template])}
      </p>
    );
  return (
    <section aria-labelledby="your-week-title" data-testid="your-week" className={`mt-6 ${JOURNAL_CARD}`}>
      <h2 id="your-week-title" className="text-lg font-medium text-text">
        {t("yourWeekTitle")}
      </h2>
      <p className="text-sm text-muted">{range}</p>
      {week.kind === "hard" ? (
        <div className="mt-3 space-y-3">
          <p data-testid="your-week-hard" className="text-text">
            {t("yourWeekHard")}
          </p>
          <GetHelpNow country={country} testId="your-week-help" neutral />
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-text">
          {/* The caption qualifies the pattern, so it comes before the moment's link (UX). */}
          {week.lines.filter((l) => l.template !== "moment").map(line)}
          {week.caption && (
            <p data-testid="your-week-caption" className="text-sm text-muted">
              {t("yourWeekCaption")}
            </p>
          )}
          {week.lines.filter((l) => l.template === "moment").map(line)}
        </div>
      )}
    </section>
  );
}
