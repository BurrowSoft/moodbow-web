import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { SessionEnded } from "@/components/SessionEnded";
import { currentUser } from "@/lib/journal/currentUser";
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
import { plusPriceLabel, readPlusView } from "@/lib/plus/view";

// A stuck request ends here at the latest (UX, the timeout audit); each
// data call gives up after 15 s on its own (lib/supabase/deadline).
export const maxDuration = 30;

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
  const { user, ended } = await currentUser(supabase);
  if (ended) return <SessionEnded />;
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
  // The prompt library (Plus wave 2) only where the day's prompt is: Plus opens its four groups;
  // without it, the lock; Plus unreadable, its free group only (Hard days, which is free).
  let library: { has: true } | { offer: { trial: boolean; price: string } } | null | undefined;
  if (promptDate && pageGate("plus") !== "hidden") {
    const view = await readPlusView(supabase, user.id);
    library = view === null ? null : view.kind === "plus" ? { has: true } : { offer: { trial: view.kind === "free" && view.trial, price: plusPriceLabel(locale) } };
  }
  return (
    <EntryEditor
      initial={null}
      newId={crypto.randomUUID()}
      uid={user.id}
      today={me.today}
      startDate={startDate}
      country={me.profile?.country}
      backTo={from}
      promptDate={promptDate}
      library={library}
      back={<BackLink href={from} label={await backLabel(from, tag)} testId="nav-back" />}
    />
  );
}
