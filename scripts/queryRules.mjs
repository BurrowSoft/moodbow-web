// Decision 196, for eslint.config.mjs (and its test, src/lib/queryRules.test.ts):
// text filters on a PostgREST select go into the request URL as query
// parameters, and Supabase's API logs keep URLs, so a user's words must
// travel in an rpc's POST body instead (search_entries). No exceptions.

// The named filters, including the many-values forms (reviewer: parity with
// the app's guard).
export const URL_FILTERS = "^(ilike|like|textSearch|or|likeAnyOf|likeAllOf|ilikeAnyOf|ilikeAllOf)$";
export const NO_URL_FILTERS =
  "No .ilike/.like/.textSearch/.or (or their AnyOf/AllOf forms) on Supabase queries: they put user text in the request URL and logs (decision 196). Use an rpc (POST body).";

export const QUERY_RULES = [
  { selector: `CallExpression[callee.property.name=/${URL_FILTERS}/]`, message: NO_URL_FILTERS },
  // The generic forms, .filter(col, "ilike", v) and .not(col, op, v), put
  // values in the URL too; Array.prototype.filter never takes 3 arguments.
  { selector: "CallExpression[callee.property.name=/^(filter|not)$/][arguments.length=3]", message: NO_URL_FILTERS },
];
