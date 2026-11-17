import type { Locale } from "@/i18n/routing";
import { APP_STORE_URL, type LiveStores } from "@/lib/stores";
import { PlayStoreLink } from "./PlayStoreLink";

// The official store badges (UX & PM, 17 Nov), from the App Store launch on
// (appstore-live): before that, the neutral text links (decision 185). Both
// badges change together, so Play's badge comes with the same flip.
//
// Each brand's rules (Apple's App Store marketing guidelines, Google Play's
// badge guidelines): the art unmodified, from the brands' own downloads, in
// the page's language (public/badges/; Thai and the others exist for both).
// Apple's badge is at least 40 px tall with clear space of a quarter of its
// height around it; Google's PNG carries its own clear space, so at 60 px
// tall its badge matches Apple's 40 px. Never recoloured, cropped or animated.
export const BADGE_LOCALES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const satisfies readonly Locale[];

// Apple's art is 40 high; the French one is wider ("Télécharger dans l'App Store").
const APPLE_WIDTH: Partial<Record<Locale, number>> = { fr: 127 };
export const APPLE_HEIGHT = 40;
export const GOOGLE_HEIGHT = 60;
// Google's PNG is 646 × 250.
const GOOGLE_WIDTH = Math.round((646 / 250) * GOOGLE_HEIGHT);

export const appStoreBadge = (locale: Locale) => `/badges/app-store-${locale}.svg`;
export const googlePlayBadge = (locale: Locale) => `/badges/google-play-${locale}.png`;

export function StoreBadges({ stores, locale, labels, testId }: { stores: LiveStores; locale: Locale; labels: { play: string; appStore: string }; testId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center" data-testid={`${testId}-badges`}>
      {stores.play && (
        <PlayStoreLink testId={`${testId}-store-play`} className="inline-flex shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand's art as it is, no resizing pipeline */}
          <img src={googlePlayBadge(locale)} alt={labels.play} width={GOOGLE_WIDTH} height={GOOGLE_HEIGHT} className="block h-[60px] w-auto" />
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
