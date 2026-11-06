import { createHmac } from "node:crypto";

// A short-lived signed statement of the country a request came from, for server
// functions that are only on in some countries (Bo first; specs/bo-design.md §7).
// A Supabase function sees no country, and Vercel does. It states a country and
// nothing else: it isn't tied to a person, and each function checks its own list.
// `<payload>.<sig>`: payload is base64url JSON { c, exp }, sig is base64url
// HMAC-SHA256 over "region.v1." + payload, with REGION_SECRET (different for
// Production and Preview, so a staging token can't open prod). The IP is never
// read, and neither the token nor the country is logged here.
export const REGION_TOKEN_SECONDS = 15 * 60;
const SIGNATURE_PREFIX = "region.v1.";
const COUNTRY = /^[A-Z]{2}$/;

// null, never a throw, when there's no secret or no usable country: the function
// treats no token as unknown, so off.
export function signRegionToken(country: string | null | undefined, secret: string | undefined = process.env.REGION_SECRET, now: number = Date.now()): string | null {
  if (!secret || !country || !COUNTRY.test(country)) return null;
  const payload = Buffer.from(JSON.stringify({ c: country, exp: Math.floor(now / 1000) + REGION_TOKEN_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(SIGNATURE_PREFIX + payload).digest("base64url");
  return `${payload}.${signature}`;
}

// The country Vercel saw for this request. Its edge sets this header; whether a
// client can forge it is the Web Tester's S1 row on Preview and www, before anyone
// relies on this (Reviewer).
export const regionTokenFor = (headers: Headers): string | null => signRegionToken(headers.get("x-vercel-ip-country"));
