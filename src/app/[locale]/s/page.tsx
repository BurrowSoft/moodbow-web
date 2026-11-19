import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { SharedWeekView } from "./SharedWeekView";
import { headers } from "next/headers";
import { dateLocale } from "@/lib/journal/today";

export async function generateMetadata({ params }: PageProps<"/[locale]/s">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shareView" });
  return pageMetadata({ locale: locale as Locale, path: "/s", title: t("metaTitle"), description: t("introBefore"), noindex: true });
}

// A week someone shared with you (1.4 G, trusted-share-live; plans/PLAN-trusted-share.md §4).
// No account and no data in this HTML: the week is fetched only after "Show the week", from the
// token in the URL fragment (SharedWeekView). No sign-in link, no upsell, no visit counter; the
// headers (no-store, no-referrer, noindex) are set in next.config for /s.
export default async function SharedWeekPage({ params }: PageProps<"/[locale]/s">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("trusted-share-live") === "hidden") notFound();
  const t = await getTranslations("shareView");
  const tt = await getTranslations("today");
  const strings = {
    titleBefore: t("titleBefore"),
    introBefore: t("introBefore"),
    show: t("show"),
    titleNamed: t.raw("titleNamed") as string,
    titleAnon: t("titleAnon"),
    weekOf: t.raw("weekOf") as string,
    checkIns: Array.from({ length: 8 }, (_, n) => t("checkIns", { count: n })),
    routinePercent: t.raw("routinePercent") as string,
    routineNotEnough: t.raw("routineNotEnough") as string,
    earlier: t("earlier"),
    later: t("later"),
    none: t("none"),
    unavailable: t("unavailable"),
    noToken: t("noToken"),
    loading: t("loading"),
    dayNone: t.raw("dayNone") as string,
    moods: [1, 2, 3, 4, 5].map((m) => tt(`mood${m}` as "mood1")),
  };
  const help = t.rich("help", {
    link: (chunks) => (
      <Link href="/help/get-help-now" className="font-medium text-accent underline underline-offset-4">
        {chunks}
      </Link>
    ),
  });
  return (
    <div className="mx-auto max-w-xl space-y-6 px-[16px] py-[32px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-accent">{(await getTranslations("meta"))("siteName")}</span>
        <Link href="/" data-testid="shared-what-is" className="inline-flex min-h-[44px] min-w-0 max-w-full items-center text-sm font-medium text-accent underline underline-offset-4 [overflow-wrap:anywhere]">
          {t("whatIs")}
        </Link>
      </div>
      {/* The reader's own date style (their browser's languages), as the journal's dates; never a
          country, since we know nothing about them. */}
      <SharedWeekView strings={strings} locale={dateLocale(locale, (await headers()).get("accept-language"), null)} help={help} footer={t("footer")} />
    </div>
  );
}
