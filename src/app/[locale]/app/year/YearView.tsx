import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GetHelpNow } from "@/components/SafetyCard";
import { dateLine } from "@/lib/journal/today";
import { JOURNAL_CARD, JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { MOOD_HEX } from "@/lib/share/moodbow";
import { YEAR_MIN_MONTHS } from "@/lib/share/year";
import type { YearReview, YearScreen } from "@/lib/journal/yearReview";
import { ShareMonth } from "../insights/ShareMonth";
import { YearCarousel } from "./YearCarousel";

const PATTERN_TEXT = { patternSleep: "yourWeekPatternSleep", patternMovement: "yourWeekPatternMovement", patternStress: "yourWeekPatternStress" } as const;
const H2 = "text-[22px] leading-tight font-semibold text-text focus:outline-none [overflow-wrap:anywhere]";

// Your year in Moodbow (1.4 A): the screens from lib/journal/yearReview, server-rendered from the
// person's own rows. Help is under every screen (counted: it's always there). A hard year's own
// help sits in its line and is never counted, as it would tell which kind of year it was. The
// share is the 1.1 J Year card alone (the person may add their own line; UX 18 Nov); offered when the card
// would draw (3 coloured months) and share cards are on. Plus people get a quiet way to the Plus
// Year in review on the last screen; nobody gets an upsell here.
export async function YearView({ review, country, dateLocaleTag, share, morePlus }: { review: YearReview; country: string | null | undefined; dateLocaleTag: string; share: boolean; morePlus: boolean }) {
  const t = await getTranslations("year");
  const ti = await getTranslations("insights");
  const tt = await getTranslations("today");
  const help = <GetHelpNow country={country} testId="year-help" counted neutral icon />;

  if (review.state === "notEnough") {
    return (
      <section className="space-y-6">
        <header className="flex items-start gap-[12px]">
          <h1 className={`${JOURNAL_HEADING} min-w-0 flex-1`}>{t("title")}</h1>
          {help}
        </header>
        <p data-testid="year-not-enough" className={`${JOURNAL_CARD} text-text`}>
          {t("notEnough", { count: review.days })}
        </p>
      </section>
    );
  }

  const month = new Intl.DateTimeFormat(dateLocaleTag, { month: "short", timeZone: "UTC" });
  const monthName = (i: number) => month.format(new Date(Date.UTC(review.year, i, 1)));
  const moodName = (m: number) => tt(`mood${m}` as "mood1");

  const coloured = review.screens.find((s) => s.screen === "colours");
  const canShare = share && coloured?.screen === "colours" && coloured.months.filter((m) => m !== null).length >= YEAR_MIN_MONTHS;

  const body = (s: YearScreen) => {
    switch (s.screen) {
      case "colours":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("coloursTitle")}</h2>
            <p className="mt-1 text-muted">{t("coloursLine")}</p>
            <ol className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12" data-testid="year-strip">
              {s.months.map((m, i) => (
                <li key={i} className="flex flex-col items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={`block h-[40px] w-full rounded-xl ${m === null ? "border border-dashed border-border" : ""}`}
                    style={m === null ? undefined : { backgroundColor: MOOD_HEX[m - 1] }}
                  />
                  <span aria-hidden="true" className="max-w-full text-center leading-tight text-muted [font-size:min(0.75rem,max(6vw,12px))] [overflow-wrap:anywhere]">{monthName(i)}</span>
                  <span className="sr-only">{m === null ? t("monthFaint", { month: monthName(i) }) : t("monthMood", { month: monthName(i), mood: moodName(m) })}</span>
                </li>
              ))}
            </ol>
          </>
        );
      case "days":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("daysTitle")}</h2>
            {/* The big number (board 27) repeats the line's count, so screen readers hear the line only. */}
            <p aria-hidden="true" className="mt-4 text-[64px] leading-none font-bold text-text">{s.days}</p>
            <p className="mt-4 text-[15px] leading-normal text-text" data-testid="year-days">{t("daysLine", { count: s.days })}</p>
          </>
        );
      case "moments":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("momentsTitle")}</h2>
            <p className="mt-2 text-text">{t("momentsLine", { count: s.count })}</p>
            <ul className="mt-2 space-y-1 text-muted" data-testid="year-moment-dates">
              {s.dates.map((d, i) => (
                <li key={`${d}-${i}`}>{dateLine(d, dateLocaleTag)}</li>
              ))}
            </ul>
          </>
        );
      case "helped":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("helpedTitle")}</h2>
            {s.helps.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 ps-[20px] text-text [overflow-wrap:anywhere]" data-testid="year-helps">
                {s.helps.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            {s.tags.length > 0 && (
              <>
                <h3 className="mt-4 font-medium text-text">{t("tagsTitle")}</h3>
                <ul className="mt-2 flex flex-wrap gap-2" data-testid="year-tags">
                  {s.tags.map((tag) => (
                    <li key={tag} className="rounded-full bg-pill px-[12px] py-[4px] text-sm text-text [overflow-wrap:anywhere]">{tag}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        );
      case "pattern":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("title")}</h2>
            <p className="mt-2 text-text" data-testid={`year-${s.template}`}>{ti(PATTERN_TEXT[s.template])}</p>
            <p className="mt-2 text-sm text-muted">{ti("yourWeekCaption")}</p>
          </>
        );
      case "hard":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("hardTitle")}</h2>
            <p className="mt-2 text-text" data-testid="year-hard">{t("hardLine")}</p>
            <div className="mt-3">
              <GetHelpNow country={country} testId="year-hard-help" neutral />
            </div>
          </>
        );
      case "closing":
        return (
          <>
            <h2 tabIndex={-1} className={H2}>{t("title")}</h2>
            <p className="mt-2 text-text" data-testid="year-closing">{t("closing")}</p>
            {morePlus && (
              <Link href="/app/insights/review" data-count="year_review_more_plus" data-testid="year-more-plus" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4">
                {t("morePlus")}
              </Link>
            )}
          </>
        );
    }
  };

  const total = review.screens.length;
  const positions = review.screens.map((_, i) => t("position", { n: i + 1, total }));
  const screens = review.screens.map((s) => ({ id: s.screen, node: body(s) }));
  // Under every screen (boards 27 and 27b): the outline Share your year, the width of the page.
  const footer = canShare ? (
    <ShareMonth month={`${review.year}-12`} dateLocaleTag={dateLocaleTag} year={review.year} yearOnly yearNote={t("shareNote")} buttonText={t("share")} testId="year-share" buttonClassName="inline-flex min-h-11 w-full items-center justify-center rounded-full border-[1.5px] border-text px-[20px] text-center font-medium text-text hover:bg-pill [overflow-wrap:anywhere]" />
  ) : null;
  return (
    <section className="space-y-6">
      <header className="flex items-start gap-[12px]">
        <div className="min-w-0 flex-1">
          <h1 className={JOURNAL_HEADING}>{t("title")}</h1>
          <p className="mt-1 text-muted">{review.year}</p>
        </div>
        {help}
      </header>
      <YearCarousel screens={screens} labels={{ previous: t("previous"), next: t("next"), region: t("title"), positions }} footer={footer} />
    </section>
  );
}
