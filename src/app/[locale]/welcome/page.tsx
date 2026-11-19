import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { helpCardMessages } from "@/i18n/clientMessages";
import type { Locale } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { pageGate } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { APP_STORE_URL, liveStores } from "@/lib/stores";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { StoreBadges } from "@/components/StoreBadges";
import { GetHelpNow } from "@/components/SafetyCard";
import { WelcomeSlides } from "./WelcomeSlides";

// The first onboarding screen on the web (no Language step while one locale
// ships). Behind web-journal-live.
// Rendered per request, so the server sends the slide in ?slide= (with a
// prerendered page, useSearchParams would leave only the Suspense fallback
// in the HTML, and nothing would show before JS loads: decision 73).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/welcome">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return pageMetadata({ locale: locale as Locale, path: "/welcome", title: t("welcome1Title"), noindex: true });
}

export default async function WelcomePage({ params }: PageProps<"/[locale]/welcome">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (pageGate("web-journal-live") === "hidden") notFound();
  const tc = await getTranslations("common");
  const th = await getTranslations("home");
  const stores = liveStores();
  const storeLink = "font-medium text-accent underline underline-offset-4";

  return (
    <main id="main" className="relative flex flex-1 flex-col items-center justify-center px-[24px] py-16 [overflow-wrap:anywhere]">
      {/* Round 3, batch E: help before any account, as the app's pre-account screens have it (its
          OnboardingPage's lifebuoy at the bar's end). The same quiet 48 px lifebuoy as Today's,
          named "Want to talk to someone?": a real link to /help/get-help-now, opening the neutral
          card once scripts run. No account yet, so the numbers follow this request's country. */}
      <div className="absolute end-[16px] top-[16px]">
        {/* The card's words ("me", "safety") aren't in the public pages' client messages: only here. */}
        <NextIntlClientProvider locale={locale} messages={helpCardMessages(await getMessages())}>
          <GetHelpNow country={null} neutral icon testId="welcome-help" counted />
        </NextIntlClientProvider>
      </div>
      <div className="flex w-full max-w-[560px] flex-col items-center" data-testid="welcome-column">
        <div className="mb-10 w-[120px]">
          <Logo variant="stacked" width={120} alt={tc("logoAlt")} />
        </div>
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense>
          <WelcomeSlides />
        </Suspense>
        {/* The app's stores, once each listing is public (decision 185, play-live / appstore-live):
            Home's words and links, on every device (the footer's button offers Play on Android
            phones only). Nothing before then: no "coming soon" on the way into the journal. */}
        {/* From the App Store launch, the official badges for both (UX & PM, 17 Nov). */}
        {stores.appStore ? (
          <div className="mt-10" data-testid="welcome-stores">
            <StoreBadges stores={stores} locale={locale as Locale} labels={{ play: th("storeBadgePlay"), appStore: th("storeBadgeAppStore") }} testId="welcome" />
          </div>
        ) : stores.play && (
          <p className="mt-10 text-center leading-[1.429] [font-size:min(0.875rem,max(8.75vw,28px))] text-muted" data-testid="welcome-stores">
            {th("storeGetApp")}{" "}
            {stores.play && (
              <PlayStoreLink testId="welcome-store-play" className={storeLink}>
                {th("storeGooglePlay")}
              </PlayStoreLink>
            )}
            {stores.play && stores.appStore && <span aria-hidden="true"> · </span>}
            {stores.appStore && (
              <a href={APP_STORE_URL!} data-testid="welcome-store-appstore" data-count="cta_store_appstore" className={storeLink}>
                {th("storeAppStore")}
              </a>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
