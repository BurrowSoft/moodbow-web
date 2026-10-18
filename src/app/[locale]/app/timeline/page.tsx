import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { conditionMet } from "@/lib/conditions";
import { getMe } from "@/lib/journal/me";
import { dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tabMetadata } from "../TabPlaceholder";
import { loadTimeline } from "./actions";
import { TimelineList } from "./TimelineList";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/timeline">): Promise<Metadata> {
  return tabMetadata("tabTimeline", (await params).locale);
}

// Timeline (M5): All days, or Moments (?view=moments). The Moments filter
// needs get_timeline's p_moments_only (moodbow-app migration 005), so it
// only shows once that is live ("timeline-moments-rpc").
export default async function TimelinePage({ params, searchParams }: PageProps<"/[locale]/app/timeline">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;

  const momentsReady = conditionMet("timeline-moments-rpc");
  const momentsOnly = momentsReady && (await searchParams).view === "moments";
  const page = await loadTimeline(null, momentsOnly);
  if (page.status === "error") return <JournalUnavailable />;

  const t = await getTranslations("timeline");
  const dateLocaleTag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  const filter = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${active ? "bg-pill text-accent" : "text-muted hover:bg-pill"}`;

  return (
    <section>
      <h1 className="text-3xl font-medium tracking-tight">{t("timelineTitle")}</h1>
      {momentsReady && (
        <nav aria-label={t("timelineTitle")} className="mt-4 flex gap-2">
          <Link href="/app/timeline" data-testid="timeline-filter-all" aria-current={!momentsOnly ? "page" : undefined} className={filter(!momentsOnly)}>
            {t("timelineAll")}
          </Link>
          <Link
            href="/app/timeline?view=moments"
            data-testid="timeline-filter-moments"
            aria-current={momentsOnly ? "page" : undefined}
            className={filter(momentsOnly)}
          >
            {t("timelineMoments")}
          </Link>
        </nav>
      )}
      {/* Keyed by the view, so switching filters starts a fresh list. */}
      <TimelineList key={momentsOnly ? "moments" : "all"} initial={page.days} initialDone={page.done} momentsOnly={momentsOnly} dateLocaleTag={dateLocaleTag} />
    </section>
  );
}
