import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { BackLink } from "@/components/BackLink";
import { SessionEnded } from "@/components/SessionEnded";
import { conditionMet, pageGate } from "@/lib/conditions";
import { backLabel } from "@/lib/journal/backLabel";
import { dateLocale } from "@/lib/journal/today";
import { BO_HISTORY_SHOWN, type BoMessage } from "@/lib/journal/bo";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe, hasCurrentConsent } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { titledMetadata } from "../pageMeta";
import { BoConversation } from "./BoConversation";
import { BoUnavailable } from "./BoUnavailable";

export const maxDuration = 30;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bo">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bo" });
  return titledMetadata(t("screenLine"), locale);
}

// Bo's conversation. This page only shows what's kept; the function decides whether
// Bo opens, and whether a message goes anywhere (bo.md).
export default async function BoPage({ params }: PageProps<"/[locale]/app/bo">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("bo-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <BoUnavailable country={null} />;
  const { data, error } = await supabase.from("bo_messages").select("id, author, body").order("created_at", { ascending: false }).limit(BO_HISTORY_SHOWN);
  if (error) return <BoUnavailable country={me.profile?.country} />;
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  return (
    <BoConversation
      key={user.id}
      initial={((data ?? []) as BoMessage[]).toReversed()}
      country={me.profile?.country}
      healthData={conditionMet("consumer-health-data-approved")}
      consented={hasCurrentConsent(me, "ai") && hasCurrentConsent(me, "age_18")}
      back={<BackLink href="/app" label={await backLabel("/app", tag)} testId="nav-back" />}
    />
  );
}
