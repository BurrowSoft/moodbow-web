import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { MoodbowArc } from "@/components/MoodbowArc";
import { conditionMet } from "@/lib/conditions";
import { pageMetadata } from "@/lib/metadata";
import { notifyMailto } from "@/lib/site";
import { APP_STORE_URL, liveStores } from "@/lib/stores";
import { PlayStoreLink } from "@/components/PlayStoreLink";
import { jsonLdText, softwareApplication } from "@/lib/jsonLd";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: locale as Locale, path: "/" });
}

// The home page in the store frames' look (UX, launch readiness): the
// moodbow arc, "Your month, as a rainbow", three feature blocks (the frames'
// titles and lines), then Private by design. Before the web journal is live:
// "Coming soon" and Get notified (a mailto: nothing is stored); after it:
// Start your journal and I already have an account. Store badges are text
// only until the real listings exist. Block 2 claims AI replies only once AI
// is live. Icons in the accent: colour means mood (decision 150); the arc is
// the brand motif, as on the store frames.
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const to = await getTranslations("onboarding");
  const live = conditionMet("web-journal-live");
  const stores = liveStores();
  const storeLink = "font-medium text-accent underline underline-offset-4";
  const ai = conditionMet("ai-live");
  // schema.org SoftwareApplication, once a platform is live (launch SEO).
  // A JSON data block isn't executed, so the CSP doesn't apply to it.
  const tm = await getTranslations("meta");
  const ld = softwareApplication({ web: live, play: stores.play, appStore: stores.appStore }, { name: tm("siteName"), description: tm("descriptionLaunch") });

  const features = [
    { key: "checkIn", title: t("featureCheckInTitle"), body: t("featureCheckInBody"), icon: <FaceIcon /> },
    ai
      ? { key: "write", title: t("featureWriteTitle"), body: t("featureWriteBody"), icon: <PenIcon /> }
      : { key: "write", title: t("featureWriteNoAiTitle"), body: t("featureWriteNoAiBody"), icon: <PenIcon /> },
    { key: "insights", title: t("featureInsightsTitle"), body: t("featureInsightsBody"), icon: <ChartIcon /> },
  ];

  return (
    <main id="main" className="flex flex-1 flex-col items-center px-4 min-[360px]:px-6 sm:px-8">
      {ld && <script type="application/ld+json" data-testid="home-jsonld" dangerouslySetInnerHTML={{ __html: jsonLdText(ld) }} />}
      <section className="flex w-full max-w-[600px] flex-col items-center pb-12 pt-8 text-center sm:pb-16 sm:pt-12">
        <div className="w-[104px] sm:w-[128px]">
          <Logo variant="stacked" width={128} alt={tc("logoAlt")} priority />
        </div>
        <MoodbowArc className="mt-8 w-full max-w-[360px]" />
        {!live && (
          <p className="mt-6 rounded-full bg-pill px-3.5 py-1.5 text-[13px] font-medium tracking-wide text-accent" data-testid="home-coming-soon">
            {t("comingSoon")}
          </p>
        )}
        <h1 className="mt-5 text-balance break-words text-[30px] font-medium leading-tight tracking-tight sm:text-[44px]">{t("heroTitle")}</h1>
        <p className="mt-4 max-w-[480px] text-base leading-relaxed text-muted sm:text-[18px]">{t("heroSub")}</p>
        {live ? (
          <div className="mt-9 flex w-full flex-col items-center gap-4 sm:w-auto">
            <Link
              href="/welcome"
              data-testid="home-start"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full text-center sm:w-auto sm:min-w-[220px] bg-accent px-5 py-3.5 sm:px-8 text-base font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {t("start")}
            </Link>
            <Link href="/sign-in" data-testid="home-sign-in" className="min-h-11 content-center text-sm font-medium text-accent underline underline-offset-4">
              {to("welcomeHaveAccount")}
            </Link>
          </div>
        ) : (
          <>
            <a
              href={notifyMailto(t("notifySubject"))}
              aria-label={t("notifyAria")}
              data-testid="home-notify"
              className="mt-9 inline-flex min-h-[52px] w-full items-center justify-center rounded-full text-center sm:w-auto sm:min-w-[200px] bg-accent px-5 py-3.5 sm:px-8 text-base font-medium text-on-accent transition-opacity hover:opacity-90"
            >
              {t("notify")}
            </a>
            <p className="mt-3 text-[13px] text-muted">{t("notifyNote")}</p>
          </>
        )}
        {/* Per store, once its listing is live (decision 185): neutral text
            links (the badge art waits for the listings), the other store's
            "coming soon"; neither live, the joint line. */}
        <div className="mt-6 text-sm text-muted" data-testid="home-stores">
          {stores.play || stores.appStore ? (
            <>
              <p>
                {t("storeGetApp")}{" "}
                {stores.play && (
                  <PlayStoreLink testId="home-store-play" className={storeLink}>
                    {t("storeGooglePlay")}
                  </PlayStoreLink>
                )}
                {stores.play && stores.appStore && <span aria-hidden="true"> · </span>}
                {stores.appStore && (
                  <a href={APP_STORE_URL!} data-testid="home-store-appstore" className={storeLink}>
                    {t("storeAppStore")}
                  </a>
                )}
              </p>
              {!(stores.play && stores.appStore) && <p className="mt-1">{t(stores.play ? "storeSoonAppStore" : "storeSoonPlay")}</p>}
            </>
          ) : (
            <p>{t("storeSoon")}</p>
          )}
        </div>
      </section>

      <ul className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {features.map(({ key, title, body, icon }) => (
          <li key={key} className="rounded-3xl border border-border bg-surface p-5 break-words sm:p-6" data-testid={`home-feature-${key}`}>
            <span className="block h-8 w-8 text-accent" aria-hidden="true">
              {icon}
            </span>
            <h2 className="mt-4 text-lg font-medium leading-snug">{title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ul>

      <section className="my-10 flex w-full max-w-4xl flex-col items-center gap-3 break-words rounded-3xl bg-pill px-5 py-10 sm:px-6 text-center sm:my-14" aria-labelledby="home-private" data-testid="home-private">
        <span className="block h-8 w-8 text-accent" aria-hidden="true">
          <LockIcon />
        </span>
        <h2 id="home-private" className="text-2xl font-medium tracking-tight">
          {t("privateTitle")}
        </h2>
        <p className="max-w-[440px] text-[15px] leading-relaxed text-text">{t("privateBody")}</p>
      </section>
    </main>
  );
}

function FaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5q3.5 3 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
