import { Fragment, type ReactNode } from "react";

// Names never hyphenate (UX, 19 Nov: "Car-valho", "Bur-rowSoft" at large text read as mistakes).
// Where the large-text hyphen rule is on (Consent, Create account, the legal pages), each name is
// wrapped in a span that turns hyphenation off for it. Case-sensitive, so "moodbow.com" and
// support@moodbow.com are left alone. The text itself never changes.
// Product and company names (UX, 19 Nov).
export const WHOLE_NAMES = ["Vitor Carvalho", "BurrowSoft", "Moodbow", "Anthropic", "Stripe", "Google Play", "App Store"] as const;
// globals.css: :is([data-hyphenate], .legal-prose) .whole-name { hyphens: manual } (outranks the rule that turns hyphens on).
export const WHOLE_NAME_CLASS = "whole-name";

const NAME = new RegExp(`(${WHOLE_NAMES.join("|")})`, "g");

// For text a component renders: the names as spans, everything else as it was.
export function wholeNames(text: string): ReactNode {
  const parts = text.split(NAME);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={WHOLE_NAME_CLASS}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// For rendered HTML (the legal pages): only in text between tags, never inside a tag or an
// attribute (a link's address keeps its words).
export function wholeNamesHtml(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(NAME, `<span class="${WHOLE_NAME_CLASS}">$1</span>`)))
    .join("");
}
