// One-off: Moodbow's own Stripe Customer Portal configuration. The Stripe account is shared with SolvyMed, whose
// default configuration it is, so api/billing/portal passes this one (STRIPE_PORTAL_CONFIG_ID) and never the default.
// Prints the configuration's id and the mode, nothing else. Run once per mode, with that mode's key in
// STRIPE_SECRET_KEY (from a file or the shell, never typed into the command, never printed):
//   node scripts/stripe-portal-config.mjs           test mode: sk_test_ or rk_test_
//   node scripts/stripe-portal-config.mjs --live    live mode: sk_live_ or rk_live_ (a live Stripe object:
//                                                   Vitor's to run, or on his typed go)
// Safe to run again: an active configuration tagged metadata.app = moodbow is brought up to these settings in place
// (same id), never made twice. A restricted key needs "Customer portal" write. No packages: Node's own fetch.

const API = "https://api.stripe.com/v1/billing_portal/configurations";
const VERSION = "2026-05-27.dahlia"; // as src/lib/plus/stripe.ts
const APP = "moodbow"; // as src/lib/plus/ours.ts

const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const wantLive = process.argv.includes("--live");
const isTest = key.startsWith("sk_test_") || key.startsWith("rk_test_");
const isLive = key.startsWith("sk_live_") || key.startsWith("rk_live_");
if (!isTest && !isLive) fail("STRIPE_SECRET_KEY isn't a Stripe secret or restricted key");
if (isLive && !wantLive) fail("that is a live key: add --live if you mean it");
if (isTest && wantLive) fail("--live with a test key");
const mode = isLive ? "live" : "test";

// What the portal lets people do (UX, as Vitor's own portal settings): change the card, see invoices, cancel at the
// end of the period with the reasons survey, edit their name and email; no plan switching, no phone. Not the
// address: with Stripe Tax off nothing needs it, and the privacy policy names only what the card form asks for
// (the Reviewer, 21 Nov).
const SETTINGS = [
  ["business_profile[headline]", "Moodbow Plus"],
  ["business_profile[privacy_policy_url]", "https://www.moodbow.com/privacy"],
  ["business_profile[terms_of_service_url]", "https://www.moodbow.com/terms"],
  ["features[payment_method_update][enabled]", "true"],
  ["features[invoice_history][enabled]", "true"],
  ["features[subscription_update][enabled]", "false"],
  ["features[subscription_cancel][enabled]", "true"],
  ["features[subscription_cancel][mode]", "at_period_end"],
  ["features[subscription_cancel][cancellation_reason][enabled]", "true"],
  ...["too_expensive", "missing_features", "switched_service", "unused", "customer_service", "too_complex", "low_quality", "other"].map((r, i) => [
    `features[subscription_cancel][cancellation_reason][options][${i}]`,
    r,
  ]),
  ["features[customer_update][enabled]", "true"],
  ...["name", "email"].map((u, i) => [`features[customer_update][allowed_updates][${i}]`, u]),
  ["metadata[app]", APP],
];

function fail(why) {
  console.error(`stripe-portal-config: ${why}`);
  process.exit(1);
}

async function stripe(method, url, body, idempotencyKey) {
  const headers = { Authorization: `Bearer ${key}`, "Stripe-Version": VERSION };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(url, { method, headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Stripe's type and code, and for a restricted key the permission it lacks; never the message itself, which
    // can quote part of the key.
    const missing = String(json.error?.message ?? "").match(/rak_[a-z_]+/g) ?? [];
    fail(`Stripe answered ${res.status} ${json.error?.type ?? ""} ${json.error?.code ?? ""}${missing.length ? `; the key lacks ${missing.join(", ")}` : ""}`);
  }
  return json;
}

// One of ours already: brought up to SETTINGS in place, so its id (STRIPE_PORTAL_CONFIG_ID) stays. Only ours is ever
// picked, by its tag; nothing of anyone else's is printed.
let ours = null;
let after = null;
for (;;) {
  const page = await stripe("GET", `${API}?active=true&limit=100${after ? `&starting_after=${after}` : ""}`);
  ours = page.data.find((c) => c.metadata?.app === APP) ?? null;
  if (ours || !page.has_more || page.data.length === 0) break;
  after = page.data.at(-1).id;
}

const saved = ours
  ? await stripe("POST", `${API}/${ours.id}`, new URLSearchParams(SETTINGS))
  : await stripe("POST", API, new URLSearchParams(SETTINGS), `moodbow-portal-config-${mode}-v2`);
if (saved.livemode !== isLive) fail("Stripe answered in the other mode");
if (saved.is_default) fail(`${saved.id} is the default configuration: check it in the Dashboard`);
const editable = saved.features?.customer_update?.allowed_updates ?? [];
console.log(`${saved.id} (${mode}, ${ours ? "updated in place" : "made"}; people can edit: ${editable.join(", ") || "nothing"})`);
