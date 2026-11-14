import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { headers } from "next/headers";
import { BackLink } from "@/components/BackLink";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { pageGate } from "@/lib/conditions";
import { backLabel } from "@/lib/journal/backLabel";
import { currentUser } from "@/lib/journal/currentUser";
import { getMe } from "@/lib/journal/me";
import { originOf } from "@/lib/journal/origin";
import { dateLocale } from "@/lib/journal/today";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EntryEditor } from "../../entries/EntryEditor";
import { titledMetadata } from "../../pageMeta";

export const maxDuration = 30;

const TOOLBOX = "/app/me/toolbox";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/write/good-things">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "entry" });
  return titledMetadata(t("goodThingsTitle"), locale);
}

// Three good things (1.3, good-things-live; specs/1.3-grounding-and-good-things.md with its
// Rulings): the entry editor with three short fields for its text, saving ONE ordinary entry for
// today through the same save, safety check and help as any entry (Ruling 3). No evening prompt
// on the web (Ruling 9), no streak, no counts. From Write and from Things that help me (?from=).
export default async function GoodThingsPage({ params, searchParams }: PageProps<"/[locale]/app/write/good-things">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("good-things-live") === "hidden") notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const asked = (await searchParams).from;
  // From Things that help me, Back and leaving go back there; anything else as Write does.
  const toolbox = asked === TOOLBOX;
  const from = originOf(asked);
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  return (
    <EntryEditor
      goodThings
      initial={null}
      newId={crypto.randomUUID()}
      uid={user.id}
      today={me.today}
      country={me.profile?.country}
      backTo={toolbox ? TOOLBOX : from}
      back={<BackLink href={toolbox ? TOOLBOX : from} label={toolbox ? (await getTranslations("app"))("navBackTo", { screen: (await getTranslations("toolbox"))("meRow") }) : await backLabel(from, tag)} testId="nav-back" />}
    />
  );
}
