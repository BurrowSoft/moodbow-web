import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { ENTRY_COLUMNS, isEntryId, type Entry } from "@/lib/journal/entry";
import { canReflect } from "@/lib/journal/ai";
import { getMe } from "@/lib/journal/me";
import type { Reflection } from "@/lib/journal/reflect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { BackLink } from "@/components/BackLink";
import { backLabel } from "@/lib/journal/backLabel";
import { originOf } from "@/lib/journal/origin";
import { dateLocale } from "@/lib/journal/today";
import { EntryEditor } from "../EntryEditor";
import { ReflectPanel } from "../ReflectPanel";
import { tabMetadata } from "../../TabPlaceholder";

// The Reflect server action runs in this page's function: room for the
// reflect call's 45 s deadline (REFLECT_SERVER_DEADLINE_MS).
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/entries/[id]">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// Edit an entry (M4). RLS returns only the signed-in user's own rows, so
// someone else's id is the same 404 as a missing one.
export default async function EntryPage({ params, searchParams }: PageProps<"/[locale]/app/entries/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  if (!isEntryId(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const { data, error } = await supabase.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) return <JournalUnavailable />;
  if (!data) notFound();
  // Reflect (M9): only when AI is shown, consented to and on. The entry's
  // reflection, if any (RLS: own rows; at most one per entry).
  // If it can't be read, no Reflect for now: reflecting would replace a
  // reflection the person couldn't see (reviewer #34).
  let reflection: Reflection | null = null;
  let reflect = canReflect(me);
  if (reflect) {
    const { data: row, error: readError } = await supabase.from("ai_reflections").select("id, body, tier, created_at").eq("entry_id", id).maybeSingle();
    if (readError) reflect = false;
    else reflection = (row as Reflection | null) ?? null;
  }
  // Opened from Today, the Timeline or a day (decision 152): Back and
  // leaving the editor return there.
  const from = originOf((await searchParams).from);
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  return (
    <>
      <BackLink href={from} label={await backLabel(from, tag)} testId="nav-back" />
      <EntryEditor initial={data as Entry} newId={id} uid={user.id} today={me.today} country={me.profile?.country} backTo={from} />
      {reflect && <ReflectPanel entryId={id} initial={reflection} balance={me.credits?.balance ?? 0} country={me.profile?.country} />}
    </>
  );
}
