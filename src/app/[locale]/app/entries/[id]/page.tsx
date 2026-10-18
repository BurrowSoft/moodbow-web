import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { ENTRY_COLUMNS, isEntryId, type Entry } from "@/lib/journal/entry";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EntryEditor } from "../EntryEditor";
import { tabMetadata } from "../../TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/entries/[id]">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// Edit an entry (M4). RLS returns only the signed-in user's own rows, so
// someone else's id is the same 404 as a missing one.
export default async function EntryPage({ params }: PageProps<"/[locale]/app/entries/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  if (!isEntryId(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const me = supabase ? await getMe(supabase) : null;
  if (!supabase || !user || !me) return <JournalUnavailable />;
  const { data, error } = await supabase.from("entries").select(ENTRY_COLUMNS).eq("id", id).maybeSingle();
  if (error) return <JournalUnavailable />;
  if (!data) notFound();
  return <EntryEditor initial={data as Entry} newId={id} uid={user.id} today={me.today} />;
}
