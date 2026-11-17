import type { Locale } from "@/i18n/routing";
import { APP_STORE_URL, type LiveStores } from "@/lib/stores";
import { PlayStoreLink } from "./PlayStoreLink";

// The official store badges (UX & PM, 17 Nov), from the App Store launch on
// (appstore-live): before that, the neutral text links (decision 185). Both
// badges change together, so Play's badge comes with the same flip.
//
// Each brand's rules (Apple's App Store marketing guidelines, Google Play's
// badge guidelines): the art unmodified, from the brands' own downloads, in
// the page's language (public/badges/). Apple's badge is 40 px tall with clear
// space of a quarter of its height around it, and no other badge is taller.
// Never recoloured, cropped or animated.
export const BADGE_LOCALES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const satisfies readonly Locale[];

// Apple's art is 40 high; the French one is wider ("Télécharger dans l'App Store").
const APPLE_WIDTH: Partial<Record<Locale, number>> = { fr: 127 };
export const APPLE_HEIGHT = 40;

// Google's PNGs are 646 × 250, but not cropped alike (the Web Tester, #355):
// the English one carries a 41 px margin on every side (its badge is rows
// 41–208), the localized ones are tight (columns 0–645, rows 29–220). Each is
// sized so its visible badge is Apple's 40 px, and padded so it has a quarter
// of that (10 px) of clear space on every side.
export const GOOGLE_PNG = { width: 646, height: 250 } as const;
export const GOOGLE_ART: Record<(typeof BADGE_LOCALES)[number], { top: number; bottom: number; left: number; right: number }> = {
  en: { top: 41, bottom: 208, left: 41, right: 604 },
  fr: { top: 29, bottom: 220, left: 0, right: 645 },
  es: { top: 29, bottom: 220, left: 0, right: 645 },
  "pt-br": { top: 29, bottom: 220, left: 0, right: 645 },
  de: { top: 29, bottom: 220, left: 0, right: 645 },
  it: { top: 29, bottom: 220, left: 0, right: 645 },
  th: { top: 29, bottom: 220, left: 0, right: 645 },
};
// Rendered height and padding (px) per crop: the English art at 60 px is 40.3
// px with 9.8 px of its own margin; the tight art at 52 px is 39.9 px, so the
// link adds 10 px at the sides and 4 px top and bottom (with the PNG's 6 px).
export const GOOGLE_SIZE = {
  margin: { height: 60, padX: 0, padY: 0, className: "" },
  tight: { height: 52, padX: 10, padY: 4, className: "px-[10px] py-[4px]" },
} as const;
export const googleSize = (locale: Locale) => (GOOGLE_ART[locale as (typeof BADGE_LOCALES)[number]]?.left === 0 ? GOOGLE_SIZE.tight : GOOGLE_SIZE.margin);

export const appStoreBadge = (locale: Locale) => `/badges/app-store-${locale}.svg`;
export const googlePlayBadge = (locale: Locale) => `/badges/google-play-${locale}.png`;

// labels: each badge's own printed words in the page's language (home.storeBadge*),
// so the link's name contains what it shows (WCAG 2.5.3, the Web Tester + UX).
export function StoreBadges({ stores, locale, labels, testId }: { stores: LiveStores; locale: Locale; labels: { play: string; appStore: string }; testId: string }) {
  const google = googleSize(locale);
  return (
    <div className="flex flex-wrap items-center justify-center" data-testid={`${testId}-badges`}>
      {stores.play && (
        <PlayStoreLink testId={`${testId}-store-play`} className={`inline-flex shrink-0 ${google.className}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand's art as it is, no resizing pipeline */}
          <img
            src={googlePlayBadge(locale)}
            alt={labels.play}
            width={Math.round((GOOGLE_PNG.width / GOOGLE_PNG.height) * google.height)}
            height={google.height}
            style={{ height: google.height }}
            className="block w-auto"
          />
        </PlayStoreLink>
      )}
      {stores.appStore && APP_STORE_URL && (
        <a href={APP_STORE_URL} data-testid={`${testId}-store-appstore`} data-count="cta_store_appstore" className="inline-flex shrink-0 p-[10px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand's art as it is, no resizing pipeline */}
          <img src={appStoreBadge(locale)} alt={labels.appStore} width={APPLE_WIDTH[locale] ?? 120} height={APPLE_HEIGHT} className="block h-[40px] w-auto" />
        </a>
      )}
    </div>
  );
}
