// The header Vercel's edge sets with the country a request came from (the one /api/region
// signs), as the root layout reads it for the help card: two capital letters, or nothing.
// A plain module, as the layout runs on the server (a helper from a "use client" file can't).
export const usableCountry = (header: string | null | undefined): string | null => {
  const c = header?.toUpperCase() ?? null;
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
};
