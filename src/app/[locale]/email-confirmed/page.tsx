import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { conditionMet } from "@/lib/conditions";
import { liveFeatures } from "@/lib/liveFeatures";
import { liveStores } from "@/lib/stores";
import { pageMetadata } from "@/lib/metadata";
import { appMissing, classifyAuthLink } from "@/lib/authLink";
import { getMe } from "@/lib/journal/me";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { offeredLocales } from "@/i18n/routing";
import { savedLanguageRoute } from "@/lib/savedLanguage";
import { SavedLanguageRedirect } from "../app/SavedLanguageRedirect";
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
    // A link without a language (mail already sent, or a language not offered
    // when it was): now there's a session, their saved one.
    if (supabase && user) {
      const me = await getMe(supabase);
      const language = savedLanguageRoute(me?.profile?.locale, locale, offeredLocales());
      if (language) return <SavedLanguageRedirect locale={language} />;
    }
  }
  // After an email is confirmed, back to the app (decision 216): an "Open
  // Moodbow" link into its backup screen, once the app build people have
  // handles it. Production opens the prod app, any other build the staging one;
  // the browser builds the link (its fallback is this page on its own origin).
  // The path comes from here, not window.location: arriving from the confirm
  // button is a client navigation, and the address bar can still show
  // /auth/confirm while this renders (Reviewer, #139 F1).
  const openApp = conditionMet("app-open-link")
    ? { production: process.env.VERCEL_ENV === "production", playLive: liveStores().play, path: getPathname({ href: "/email-confirmed", locale }) }
    : null;

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-[560px] flex-col items-center">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        <EmailConfirmedMessage fromQuery={classifyAuthLink(query.toString(), "")} continueTo={continueTo} openApp={openApp} appMissing={appMissing(query.toString())} />
      </div>
    </main>
  );
}
