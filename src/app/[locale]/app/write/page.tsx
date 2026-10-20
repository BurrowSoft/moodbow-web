import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { getMe } from "@/lib/journal/me";
import { isIsoDate } from "@/lib/journal/timeline";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { BackLink } from "@/components/BackLink";
import { backLabel } from "@/lib/journal/backLabel";
import { originOf } from "@/lib/journal/origin";
import { dateLocale } from "@/lib/journal/today";
import { EntryEditor } from "../entries/EntryEditor";
import { pageGate } from "@/lib/conditions";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { titledMetadata } from "../pageMeta";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/write">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "entry" });
  return titledMetadata(t("entryNewTitle"), locale);
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
  const from = originOf((await searchParams).from);
  const tag = dateLocale(locale, (await headers()).get("accept-language"), me.profile?.country ?? null);
  // Writing prompts (1.1 I, decision 183): the prompt of the day the entry
  // starts on (today, or a Timeline day's ?date=); none on a day where an
  // earlier entry is crisis-flagged (every list, rule 5), and none if that
  // can't be checked (fails closed). The editor hides it if the date changes.
  let promptDate: string | null = null;
  if (pageGate("writing-prompts") !== "hidden") {
    const { data: sameDay, error } = await supabase.from("entries").select("body").eq("entry_date", startDate);
    if (!error && !(sameDay ?? []).some((e) => flagsCrisis((e as { body: string }).body, CRISIS_KEYWORDS))) promptDate = startDate;
  }
  return (
    <>
      <BackLink href={from} label={await backLabel(from, tag)} testId="nav-back" />
      <EntryEditor initial={null} newId={crypto.randomUUID()} uid={user.id} today={me.today} startDate={startDate} country={me.profile?.country} backTo={from} promptDate={promptDate} />
    </>
  );
}
