// Campaign attribution (decision 79, 1.0 launch): our own campaign labels
// from the landing page's address (utm_source / utm_medium / utm_campaign
// only), so a visit can be counted per campaign (lib/analytics) and an app
// install attributed (the Play link's referrer). Held in this tab's memory
// only: no cookie, no storage, never sent to our server. A reload loses it.
// Values are labels we set ourselves: letters, digits, . _ - and at most 64
// characters; anything else (an email, a long token) is dropped.
export const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
export type Campaign = Partial<Record<(typeof CAMPAIGN_KEYS)[number], string>>;

const LABEL = /^[A-Za-z0-9._-]{1,64}$/;

// The allow-listed labels in a query string, or null when there are none.
export function campaignFrom(search: string): Campaign | null {
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(search);
  } catch {
    return null;
  }
  const campaign: Campaign = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = query.get(key);
    if (value !== null && LABEL.test(value)) campaign[key] = value;
  }
  return Object.keys(campaign).length > 0 ? campaign : null;
}

// The query string of a campaign, in CAMPAIGN_KEYS order.
export const campaignQuery = (campaign: Campaign) =>
  new URLSearchParams(CAMPAIGN_KEYS.flatMap((k) => (campaign[k] ? [[k, campaign[k]!]] : []))).toString();

// The first page this tab opened is the landing page: its campaign, if any,
// is kept for the rest of the visit (first touch). Read lazily, the first
// time anything asks.
let landing: { campaign: Campaign | null } | null = null;

export function rememberCampaign(search: string) {
  if (!landing) landing = { campaign: campaignFrom(search) };
}

export function currentCampaign(): Campaign | null {
  if (!landing && typeof window !== "undefined") rememberCampaign(window.location.search);
  return landing?.campaign ?? null;
}

// For tests: forget the landing page.
export function resetCampaign() {
  landing = null;
}

// Google Play's install referrer: the listing link with
// &referrer=<the campaign's query, URL-encoded>, which Play hands to the app
// on install (attribution only; the app reads no person from it).
export function playLink(base: string, campaign: Campaign | null): string {
  if (!campaign) return base;
  return `${base}${base.includes("?") ? "&" : "?"}referrer=${encodeURIComponent(campaignQuery(campaign))}`;
}
// TODO(appstore-live): the App Store's campaign link needs the provider
// token (pt) from App Store Connect (Vitor): `${APP_STORE_URL}?pt=<token>&ct=<utm_campaign>&mt=8`.
