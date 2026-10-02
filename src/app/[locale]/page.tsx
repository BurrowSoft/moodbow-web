import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Logo } from "@/components/Logo";
import { pageMetadata } from "@/lib/metadata";
import { NOTIFY_MAILTO } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: locale as Locale, path: "/" });
}

// Feature blocks: the app's welcome slides 1–3 (r1-screens-and-copy.md),
// with welcome3BodyNoAi until AI claims are live. Each gets one brand colour.
const FEATURES = [
  { n: 1, color: "text-peach", icon: <PenIcon /> },
  { n: 2, color: "text-lavender", icon: <ChartIcon /> },
  { n: 3, color: "text-rose", icon: <LockIcon /> },
] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("home");

  return (
    <main id="main" className="flex flex-1 flex-col items-center px-6 sm:px-8">
      <section className="flex w-full max-w-[560px] flex-col items-center py-12 text-center sm:py-16">
        <div className="w-[120px] sm:w-[160px]">
          <Logo variant="stacked" width={160} priority />
        </div>
        <p className="mt-8 rounded-full bg-pill px-3.5 py-1.5 text-[13px] font-medium tracking-wide text-accent">
          {t("comingSoon")}
        </p>
        <h1 className="mt-5 text-balance text-[28px] font-medium leading-tight tracking-tight sm:text-4xl">{t("tagline")}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-[17px]">{t("intro")}</p>
        <a
          href={NOTIFY_MAILTO}
          aria-label={t("notifyAria")}
          className="mt-9 inline-flex min-h-[52px] min-w-[200px] items-center justify-center rounded-full bg-accent px-8 py-3.5 text-base font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          {t("notify")}
        </a>
        <p className="mt-3 text-[13px] text-muted">{t("notifyNote")}</p>
      </section>

      <ul className="grid w-full max-w-4xl gap-4 pb-8 sm:grid-cols-3">
        {FEATURES.map(({ n, color, icon }) => (
          <li key={n} className="rounded-3xl border border-border bg-surface p-6">
            <span className={`block h-8 w-8 ${color}`} aria-hidden="true">
              {icon}
            </span>
            <h2 className="mt-4 text-lg font-medium leading-snug">{t(`feature${n}Title`)}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{t(`feature${n}Body`)}</p>
          </li>
        ))}
      </ul>
    </main>
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
