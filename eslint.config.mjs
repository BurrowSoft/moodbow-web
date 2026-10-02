import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Attributes whose text users see or hear (screen readers, tooltips).
const USER_FACING_ATTRS = "^(alt|title|placeholder|label|aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext)$";
const NO_HARDCODED_TEXT = "User-facing text must come from next-intl messages (src/messages/*.json).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Zero hard-coded user-facing text (decision #32): JSX text and the
  // user-facing attributes above must come from messages, so adding a
  // language is a messages-only change. Metadata in .ts files follows the
  // same rule by review (pageMetadata, manifest).
  {
    files: ["src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·"] }],
      "no-restricted-syntax": [
        "error",
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
