import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { liveFeatures } from "@/lib/liveFeatures";
import { pageMetadata } from "@/lib/metadata";
import { classifyAuthLink } from "@/lib/authLink";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmailConfirmedMessage } from "./EmailConfirmedMessage";

// Where Supabase's confirm-email links land. Never indexed: the URL can
// carry tokens.
export async function generateMetadata({ params }: PageProps<"/[locale]/email-confirmed">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "emailConfirmed" });
  return pageMetadata({ locale: locale as Locale, path: "/email-confirmed", title: t("metaTitle"), noindex: true });
}

export default async function EmailConfirmedPage({ params, searchParams }: PageProps<"/[locale]/email-confirmed">) {
  const { locale } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  setRequestLocale(locale as Locale);
  const tc = await getTranslations("common");
  // Decision 134: once the web journal is live, a confirmed email moves on:
  // to the journal if the confirm left a web session here, else to sign
  // in. Before that, no Continue at all (the page stays as it is).
  let continueTo: string | null = null;
  if (liveFeatures.webJournal) {
    const supabase = await createSupabaseServerClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    continueTo = user ? "/app" : "/sign-in";
  }

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        <EmailConfirmedMessage fromQuery={classifyAuthLink(query.toString(), "")} continueTo={continueTo} />
      </div>
    </main>
  );
}
