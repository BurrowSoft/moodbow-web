import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import type { CheckIn } from "@/lib/journal/checkIn";
import { ENTRY_COLUMNS, isEntryId, type Entry } from "@/lib/journal/entry";
import { canReflect } from "@/lib/journal/ai";
import { getMe } from "@/lib/journal/me";
import type { Reflection } from "@/lib/journal/reflect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { backLabel } from "@/lib/journal/backLabel";
import { originOf } from "@/lib/journal/origin";
import { dateLocale } from "@/lib/journal/today";
import { tabMetadata } from "../../TabPlaceholder";
import { EntryScreen } from "./EntryScreen";

// The Reflect server action runs in this page's function: room for the
// reflect call's 45 s deadline (REFLECT_SERVER_DEADLINE_MS).
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/entries/[id]">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// An entry (M4): the entry view, editing in place (decision 151). RLS returns only the signed-in user's own rows, so
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
  // Opened from Today, the Timeline or a day (decision 152): Back
  // returns there.
  const from = originOf((await searchParams).from);
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  // That day's check-in, for the strip under the date. Not read (an error):
  // no strip, the same as a day without one; the entry is still all here.
  const entry = data as Entry;
  const { data: checkIn } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at")
    .eq("local_date", entry.entry_date)
    .maybeSingle();
  return (
    <EntryScreen
      entry={entry}
      checkIn={(checkIn as CheckIn | null) ?? null}
      from={from}
      backLabel={await backLabel(from, tag)}
      dateLocaleTag={tag}
      uid={user.id}
      today={me.today}
      country={me.profile?.country}
      reflect={reflect ? { initial: reflection, balance: me.credits?.balance ?? 0 } : null}
    />
  );
}
