import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { getMe } from "@/lib/journal/me";
import { isIsoDate } from "@/lib/journal/timeline";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EntryEditor } from "../entries/EntryEditor";
import { tabMetadata } from "../TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/write">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// A new entry (M4). Its id is made here, when the draft starts, so a save
// retried after a dropped connection can't create it twice. The editor
// picks up an unsaved draft from an earlier visit instead, with its id.
// ?date= (from a Timeline day, "Add an entry") starts it on that day;
// anything but today or earlier is ignored.
export default async function WritePage({ params, searchParams }: PageProps<"/[locale]/app/write">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return <JournalUnavailable />;
  const me = await getMe(supabase);
  if (!me) return <JournalUnavailable />;
  const asked = (await searchParams).date;
  const startDate = typeof asked === "string" && isIsoDate(asked) && asked <= me.today ? asked : me.today;
  return <EntryEditor initial={null} newId={crypto.randomUUID()} uid={user.id} today={me.today} startDate={startDate} country={me.profile?.country} />;
}
