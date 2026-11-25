import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { INSIGHTS_AI, withOrigin, type Origin } from "@/lib/journal/origin";
import type { ReflectionRow } from "@/lib/journal/reflections";
import { dateLine } from "@/lib/journal/today";
import { JOURNAL_CARD } from "@/lib/ui/journalLayout";
import { wholeNames } from "@/lib/wholeNames";
import { AiInvite } from "./AiInvite";

const TEXT_LINK = "inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4";

// Insights → AI (decision 258; specs/insights-ai-split.md, boards 30b, 30d and 30e), shown only where AI
// is available. AI off for this person: the invitation only. AI on, in this order (UX, 25 Nov):
// 1. Your reflections, newest first: the 3 newest, then See all if there are more;
// 2. Your week, the weekly report: as on Insights before (Plus), or for someone without Plus, the
//    labelled example line and See Plus; then Your past reports, with Plus, once there's one;
// 3. a small AI settings link, to Me → AI.
export async function AiPane(
  props:
    | { state: "off" }
    | {
        state: "on";
        // null: the read failed (said so, never an empty list passed off as none).
        reflections: { rows: ReflectionRow[]; more: boolean } | null;
        dateLocaleTag: string;
        // The weekly report (or, without Plus, its example), where weekly-report-live is on; else nothing.
        week: React.ReactNode;
        pastReports: boolean;
      },
) {
  if (props.state === "off") return <AiInvite />;
  const t = await getTranslations("ai");
  const tt = await getTranslations("today");
  const tm = await getTranslations("me");
  const { reflections, dateLocaleTag, week, pastReports } = props;
  return (
    <div data-testid="insights-ai">
      <section aria-labelledby="reflections-title" data-testid="insights-reflections" className={`mt-6 ${JOURNAL_CARD}`}>
        <h2 id="reflections-title" className="text-lg font-medium text-text">
          {t("reflectionsTitle")}
        </h2>
        {reflections === null ? (
          <p role="alert" data-testid="insights-reflections-error" className="mt-2 text-muted">
            {tt("errGeneric")}
          </p>
        ) : reflections.rows.length === 0 ? (
          <p data-testid="insights-reflections-empty" className="mt-2 text-muted">
            {t("reflectionsEmpty")}
          </p>
        ) : (
          <ReflectionList rows={reflections.rows} dateLocaleTag={dateLocaleTag} origin={INSIGHTS_AI} crisisWord={t("reflectionsRowCrisis")} />
        )}
        {reflections?.more && (
          <Link href="/app/insights/reflections" data-testid="insights-reflections-see-all" className={`mt-2 ${TEXT_LINK}`}>
            {t("reflectionsSeeAll")}
          </Link>
        )}
      </section>
      {week}
      {pastReports && (
        <p className="mt-3">
          <Link href="/app/me/reports" data-testid="insights-past-reports" className={TEXT_LINK}>
            {tm("pastReports")}
          </Link>
        </p>
      )}
      <p className="mt-6 flex justify-center">
        <Link href="/app/me#me-ai" data-testid="insights-ai-settings" className="inline-flex min-h-11 items-center gap-[6px] font-medium text-accent">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          <span>{t("aiSettingsLink")}</span>
        </Link>
      </p>
    </div>
  );
}

// The reflection rows (the AI segment's 3, and See all's): each one link to its entry, the entry's
// date read first, then the reflection's first line, at most two lines. A crisis reply's row has only
// the date and the neutral word (crisisWord, ai.reflectionsRowCrisis): its line was never read into the
// row (lib/journal/reflections).
// first: the index of the first row here, for See all's anchors (#reflection-20 after Show more).
// topRule: a rule above the first row too, under a heading in the same card (the AI segment); See all's card has none
// inside, so there the first row has no rule above it (the Web Tester, B1a).
export function ReflectionList({ rows, dateLocaleTag, origin, crisisWord, first = 0, topRule = true }: { rows: ReflectionRow[]; dateLocaleTag: string; origin: Origin; crisisWord: string; first?: number; topRule?: boolean }) {
  return (
    <ul data-testid="insights-reflections-list" className={topRule ? "mt-2" : "[&>li:first-child>a]:border-t-0"}>
      {rows.map((row, i) => (
        <li key={row.id}>
          <Link
            id={`reflection-${first + i}`}
            href={withOrigin(`/app/entries/${row.entryId}`, origin)}
            data-testid="insights-reflection"
            className="flex min-h-16 flex-col justify-center gap-[3px] border-t border-border py-[10px] text-text no-underline"
          >
            <span data-testid="insights-reflection-date" className="text-sm text-muted">
              {dateLine(row.entryDate, dateLocaleTag)}
            </span>
            <span data-testid="insights-reflection-line" className={`line-clamp-2 [overflow-wrap:anywhere] ${row.line === null ? "text-muted" : ""}`}>
              {row.line ?? crisisWord}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Your week for someone without Plus (UX, 25 Nov): the report's name, "Example", one line and See Plus.
export async function WeekPlusPrompt() {
  const t = await getTranslations("ai");
  const tp = await getTranslations("plus");
  return (
    <section aria-labelledby="week-plus-title" data-testid="weekly-report-plus" className={`mt-6 ${JOURNAL_CARD}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="week-plus-title" className="min-w-0 text-lg font-medium text-text">
          {t("reportWeekly")}
        </h2>
        <span className="text-xs text-muted">{tp("exampleLabel")}</span>
      </div>
      <p className="mt-2 text-muted [overflow-wrap:anywhere]">{wholeNames(t("reportPlusLine"))}</p>
      <Link href="/app/me/plus" data-testid="weekly-report-see-plus" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#2B2438] px-[18px] font-medium text-white">
        {tp("seePlus")}
      </Link>
    </section>
  );
}
