import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/PageShell";
import { draftsAllowed, pageGate } from "@/lib/conditions";
import { legalDate, legalLocale, legalSource, renderLegal, comingPolicyMet } from "@/lib/legalContent";
import { pageMetadata } from "@/lib/metadata";
import { knownNotice, POLICY_NOTICE_CONDITION, policyNoticeDate } from "@/lib/journal/policyNotice";
import { dateInSentence, dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

// Who's reading doesn't matter, but which notice is out does, on each request.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy/next">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return pageMetadata({ locale: locale as Locale, path: "/privacy/next", title: t("title"), description: t("description"), noindex: true });
}

// The policy as it will read once a change applies, which the notice's "Read the policy"
// opens: the live /privacy is today's until then. Only while a notice is out, from the same
// server value the notice uses, so a 404 otherwise, and if that can't be read. Never indexed
// or in the sitemap. A draft build shows it with no notice out, so it can be reviewed.
export default async function ComingPrivacyPage({ params }: PageProps<"/[locale]/privacy/next">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  // The v2 notice (migration 043; the web's only one), and only one this build has words for.
  const answer = supabase ? await supabase.rpc("policy_notice_v2_current") : { data: null };
  const id = knownNotice(answer.data);
  const draft = draftsAllowed();
  if (pageGate(POLICY_NOTICE_CONDITION) === "hidden" || (!id && !draft)) notFound();

  const date = id && policyNoticeDate(id);
  const t = await getTranslations("legal");
  const textLocale = legalLocale(locale, "privacy");
  // The What changed block names the same day as the line above it (none for an undated notice).
  const { title, html } = renderLegal(legalSource("privacy", textLocale), comingPolicyMet, date ? legalDate(date, textLocale) : null);
  const tag = dateLocale(locale, (await headers()).get("accept-language"), null);
  return (
    <PageShell title={title} draft={!id} article notice={textLocale !== locale ? t("legalEnglishOnly") : undefined}>
      <p data-testid="privacy-next-line" className="rounded-2xl bg-pill px-[20px] py-3 text-text">
        {date ? t("nextApplies", { date: dateInSentence(date, tag) }) : t("nextAppliesNoDate")}{" "}
        <Link href="/privacy" data-testid="privacy-next-current" className="font-medium text-accent underline underline-offset-4">
          {t("nextCurrent")}
        </Link>
      </p>
      <div className="legal-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </PageShell>
  );
}
