import { conditionMet } from "@/lib/conditions";

// The app's store listings (runbook 0.9, decision 185). Each store shows on
// the web only once its condition is met (play-live / appstore-live) AND its
// link exists, so a met condition can never render a dead link. The official
// badge art waits for the live listings (UX): neutral text links until then.
export const PLAY_PACKAGE = "com.burrowsoft.moodbow";
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
// TODO(appstore-live): the App Store listing's URL and numeric app id, once
// the app exists in App Store Connect (Vitor). Until then the App Store never
// counts as live, whatever its condition says.
export const APP_STORE_URL: string | null = null;
export const APP_STORE_ID: string | null = null;

// The app's backup screen, from a browser on Android (decision 216; the
// Mobile Dev's contract for app PR C): moodbow://app/me/backup as an intent
// link, so Chrome opens the app if it can and the Play listing (which offers
// Install or Update) if it can't. The staging app has its own package; a
// Preview opens that one. The Play page is the prod listing either way.
export const STAGING_PACKAGE = `${PLAY_PACKAGE}.staging`;
export function openAppIntent(production: boolean): string {
  const pkg = production ? PLAY_PACKAGE : STAGING_PACKAGE;
  return `intent://app/me/backup#Intent;scheme=moodbow;package=${pkg};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;
}

export type LiveStores = { play: boolean; appStore: boolean };

export function liveStores(met: (id: "play-live" | "appstore-live") => boolean = conditionMet): LiveStores {
  return { play: met("play-live"), appStore: met("appstore-live") && APP_STORE_URL !== null && APP_STORE_ID !== null };
}
