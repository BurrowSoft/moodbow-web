import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EntryEditor } from "../entries/EntryEditor";
import { tabMetadata } from "../TabPlaceholder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/write">): Promise<Metadata> {
  return tabMetadata("tabToday", (await params).locale);
}

// A new entry (M4). Its id is made here, when the draft starts, so a save
// retried after a dropped connection can't create it twice. The editor
// picks up an unsaved draft from an earlier visit instead, with its id.
export default async function WritePage({ params }: PageProps<"/[locale]/app/write">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const me = supabase ? await getMe(supabase) : null;
  if (!user || !me) return <JournalUnavailable />;
  return <EntryEditor initial={null} newId={crypto.randomUUID()} uid={user.id} today={me.today} />;
}
