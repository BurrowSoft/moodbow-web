import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { readPlusPage } from "@/lib/plus/page";
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
  const me = await getMe(supabase);
  const plus = me ? await readPlusPage(supabase, user.id, me.profile?.country, locale) : null;
  // A row that can't be read: never an offer to someone who may already pay.
  if (!me || !plus) return <JournalUnavailable />;
  const started = (await searchParams).started === "1";
  return (
    <section className="space-y-2">
      <PlusScreen view={plus.view} price={plus.price} offer={plus.offer} started={started} />
    </section>
  );
}
