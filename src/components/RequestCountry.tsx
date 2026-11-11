"use client";

import { createContext, useContext } from "react";

// The country this request came from, as Vercel's edge saw it (x-vercel-ip-country, the
// header /api/region signs), read once by the root layout. For the help card only, when the
// profile's country isn't known (a page that couldn't read it, or none set): unsigned, for
// display, never stored or logged. null with no usable country.
const RequestCountryContext = createContext<string | null>(null);

export function RequestCountryProvider({ country, children }: { country: string | null; children: React.ReactNode }) {
  return <RequestCountryContext.Provider value={country}>{children}</RequestCountryContext.Provider>;
}

export const useRequestCountry = () => useContext(RequestCountryContext);
