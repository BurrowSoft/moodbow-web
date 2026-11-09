"use server";

import { headers } from "next/headers";

// The country this request came from, as Vercel's edge saw it (x-vercel-ip-country, the
// header /api/region signs). For the help card only, when the profile's country isn't known
// (a page that couldn't read it, or none set): unsigned, for display, never stored or logged.
// null with no usable country, so the card keeps its sentence and Find a helpline.
export async function requestCountry(): Promise<string | null> {
  const country = (await headers()).get("x-vercel-ip-country")?.toUpperCase() ?? null;
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}
