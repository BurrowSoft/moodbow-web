import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Attributes whose text users see or hear (screen readers, tooltips).
const USER_FACING_ATTRS = "^(alt|title|placeholder|label|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$";
const NO_HARDCODED_TEXT = "User-facing text must come from next-intl messages (src/messages/*.json).";

// Sentry scope setters attach identity or free text to every envelope,
// including session envelopes that bypass beforeSend (decision 49). None of
// them may be called anywhere in src.
const SENTRY_SETTERS = "^(setUser|setTag|setTags|setContext|setExtra|setExtras)$";
const NO_SENTRY_SETTERS = "Never attach user identity or free text to Sentry (decision 49): no setUser/setTag/setContext/setExtra.";
const SENTRY_RULES = [
  { selector: `CallExpression[callee.property.name=/${SENTRY_SETTERS}/]`, message: NO_SENTRY_SETTERS },
  { selector: `ImportSpecifier[imported.name=/${SENTRY_SETTERS}/]`, message: NO_SENTRY_SETTERS },
];

// Text filters on a PostgREST select go into the request URL as query
// parameters, and Supabase's API logs keep URLs (decision 196): a user's words
// must travel in an rpc's POST body instead (search_entries). No exceptions.
const URL_FILTERS = "^(ilike|like|textSearch|or)$";
const NO_URL_FILTERS = "No .ilike/.like/.textSearch/.or on Supabase queries: they put user text in the request URL and logs (decision 196). Use an rpc (POST body).";
const QUERY_RULES = [
  { selector: `CallExpression[callee.property.name=/${URL_FILTERS}/]`, message: NO_URL_FILTERS },
  // The generic forms, .filter(col, "ilike", v) and .not(col, op, v), put
  // values in the URL too; Array.prototype.filter never takes 3 arguments.
  { selector: "CallExpression[callee.property.name=/^(filter|not)$/][arguments.length=3]", message: NO_URL_FILTERS },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...SENTRY_RULES, ...QUERY_RULES] },
  },
  // Zero hard-coded user-facing text (decision #32): JSX text and the
  // user-facing attributes above must come from messages, so adding a
  // language is a messages-only change. Metadata in .ts files follows the
  // same rule by review (pageMetadata, manifest). no-restricted-syntax is
  // replaced per file, so the Sentry and query rules are repeated here.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·"] }],
      "no-restricted-syntax": [
        "error",
        ...SENTRY_RULES,
        ...QUERY_RULES,
        { selector: `JSXAttribute[name.name=/${USER_FACING_ATTRS}/] > Literal[value=/\\S/]`, message: NO_HARDCODED_TEXT },
        { selector: `JSXAttribute[name.name=/${USER_FACING_ATTRS}/] > JSXExpressionContainer > Literal[value=/\\S/]`, message: NO_HARDCODED_TEXT },
        { selector: `JSXAttribute[name.name=/${USER_FACING_ATTRS}/] > JSXExpressionContainer > TemplateLiteral`, message: NO_HARDCODED_TEXT },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
