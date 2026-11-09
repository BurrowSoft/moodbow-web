import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { JournalUnavailable } from "@/components/JournalUnavailable";
import { pageGate } from "@/lib/conditions";

// TEST ONLY (test-only-unavailable-page, never met; a 404 on Production in the proxy and
// here): the journal's couldn't-load state, alone, inside the journal layout, so a journey
// can measure where its help sits at large text. It reads no journal data.
export default async function UnavailableTestPage({ params }: PageProps<"/[locale]/app/test/unavailable">) {
  setRequestLocale((await params).locale as Locale);
  if (pageGate("test-only-unavailable-page") === "hidden") notFound();
  return <JournalUnavailable />;
}
