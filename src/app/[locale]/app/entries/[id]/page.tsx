import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
import type { CheckIn } from "@/lib/journal/checkIn";
import { ENTRY_COLUMNS, isEntryId, type Entry } from "@/lib/journal/entry";
import { canReflect } from "@/lib/journal/ai";
import { getMe } from "@/lib/journal/me";
import { pageGate } from "@/lib/conditions";
import { parseRecall } from "@/lib/journal/momentRecall";
import type { Reflection } from "@/lib/journal/reflect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { backLabel } from "@/lib/journal/backLabel";
import { originOf } from "@/lib/journal/origin";
import { dateLocale } from "@/lib/journal/today";
import { titledMetadata } from "../../pageMeta";
import { EntryScreen } from "./EntryScreen";
import { readEntryPictures, type EntryPicture } from "@/lib/journal/pictures";
import { readPlusView } from "@/lib/plus/view";

// The Reflect server action runs in this page's function: room for the
// reflect call's 45 s deadline (REFLECT_SERVER_DEADLINE_MS).
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/entries/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "entry" });
  return titledMetadata(t("entryEditTitle"), locale);
}

// An entry (M4): the entry view, editing in place (decision 151). RLS
// returns only the signed-in user's own rows, so someone else's id is the
// same 404 as a missing one.
export default async function EntryPage({ params, searchParams }: PageProps<"/[locale]/app/entries/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  if (!isEntryId(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
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
  // Memories (034): this entry's "Bring this back" months, only where moment-recall-live is on (a
  // database without 034 has no such column). A read that fails: no chips (undefined), never "all
  // three", or one tap would overwrite what's really stored (the Reviewer, #320).
  let recall: ReturnType<typeof parseRecall> | undefined;
  if (pageGate("moment-recall-live") !== "hidden") {
    const read = await supabase.from("entries").select("recall_months").eq("id", entry.id).maybeSingle();
    recall = read.error || !read.data ? undefined : parseRecall((read.data as { recall_months?: unknown }).recall_months);
  }
  const { data: checkIn } = await supabase
    .from("check_ins")
    .select("local_date, mood, sleep_hours, sleep_quality, exercise_minutes, stress, updated_at")
    .eq("local_date", entry.entry_date)
    .maybeSingle();
  // Pictures (035), where pictures-live is on: this entry's (signed URLs, 5 minutes), and whether
  // adding is open (Plus; unreadable or Plus off: no add, never a lock to someone who may pay). Not
  // read: the entry without them (never a guess).
  let pictures: { list: EntryPicture[]; plus: boolean | null } | undefined;
  if (pageGate("pictures-live") !== "hidden") {
    const [read, plus] = await Promise.all([readEntryPictures(supabase, [entry.id]), pageGate("plus") !== "hidden" ? readPlusView(supabase, user.id) : null]);
    if (read) pictures = { list: read.get(entry.id) ?? [], plus: plus ? plus.kind === "plus" : null };
  }
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
      pictures={pictures}
      recall={recall}
    />
  );
}
