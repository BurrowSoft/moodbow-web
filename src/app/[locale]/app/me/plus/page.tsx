import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { aiShown } from "@/lib/journal/ai";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { plusPriceLabel, readPlusView } from "@/lib/plus/view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { titledMetadata } from "../../pageMeta";
import { PlusScreen } from "./PlusScreen";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/me/plus">): Promise<Metadata> {
  const { locale } = await params;
  return titledMetadata((await getTranslations({ locale, namespace: "plus" }))("label"), locale);
}

// Me → Moodbow Plus (decision 246, flag "plus"): what's free, what Plus adds,
// and the one button. Reached from the Me banner, a lock's sheet, or the Your
// week line; the trial starts only from here, by the person's own choice.
export default async function PlusPage({ params, searchParams }: PageProps<"/[locale]/app/me/plus">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("plus") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const [me, view] = await Promise.all([getMe(supabase), readPlusView(supabase, user.id)]);
  // A row that can't be read: never an offer to someone who may already pay.
  if (!me || !view) return <JournalUnavailable />;
  const ta = await getTranslations("app");
  const started = (await searchParams).started === "1";
  return (
    <section className="space-y-2">
      <BackLink href="/app/me" label={ta("navBackTo", { screen: ta("tabMe") })} testId="nav-back" />
      <PlusScreen view={view} price={plusPriceLabel(locale)} aiShown={aiShown(me)} started={started} />
    </section>
  );
}
