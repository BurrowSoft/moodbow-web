import { Fragment, type ReactNode } from "react";
import { SUPPORT_EMAIL } from "@/lib/site";

// Names never hyphenate (UX, 19 Nov: "Car-valho", "Bur-rowSoft" at large text read as mistakes; 20 Nov: on
// every page the large-text hyphen rule reaches, which is all of them). A name is wrapped in a span that
// turns hyphenation off for it. Case-sensitive, so "moodbow.com" and support@moodbow.com are left alone.
// The text itself never changes.
// Product and company names (UX, 19 Nov), and every other brand with 8+ letters that pages show (UX, 20 Nov: any
// trademark, e.g. WhatsApp or Instagram if they ever appear): Supabase (the legal pages' processors), JavaScript (the
// journal's no-script line), Bluetooth (/privacy), and the helplines' own brand names (UX, 20 Nov: TelefonSeelsorge,
// the countries registry's only one; HelpNumberText keeps it whole in a call line, breaking only at its compound
// boundary where it can't fit). wholeNames.test fails on a known trademark or a camel-case word of HYPHEN_MIN+
// letters that isn't here.
export const WHOLE_NAMES = ["Vitor Carvalho", "BurrowSoft", "Moodbow", "Anthropic", "Stripe", "Google Play", "App Store", "Supabase", "JavaScript", "Bluetooth", "TelefonSeelsorge"] as const;
// The global large-text rule (globals.css) hyphenates only words of HYPHEN_MIN letters or more. A name whose words are all
// shorter can never break, wrapped or not ("Moodbow", "Google Play"…). The LONG_NAMES have a word that long, so they're
// wrapped wherever they render (wholeNames.test checks every message that holds one).
export const HYPHEN_MIN = 8;
export const LONG_NAMES: readonly string[] = WHOLE_NAMES.filter((n) => n.split(" ").some((w) => w.length >= HYPHEN_MIN));
// globals.css sets hyphens: manual on .whole-name itself, which beats the hyphens: auto it would inherit from body.
export const WHOLE_NAME_CLASS = "whole-name";

const NAME = new RegExp(`(${WHOLE_NAMES.join("|")})`, "g");

// For text a component renders: the names as spans, everything else as it was.
// A word that starts with a hyphen: German's suspended compound ("KI-Reflexionen und -Berichte").
// The browser may break right after that "-", leaving "und -" / "Berichte" (the Web Tester, UX
// 19 Nov), so it's kept on one line. No U+2011: the text itself stays as written.
const SUSPENDED = /((?<=^|\s)-\p{L}+)/u;
export const KEEP_TOGETHER_CLASS = "whitespace-nowrap";

function keepSuspended(text: string, key: string, atWordStart = true): ReactNode[] {
  // Right after a name ("Moodbow-Tipps"), the text continues that word: its "-Tipps" is no
  // suspended compound, so the rest of the word stays plain.
  if (!atWordStart) {
    const rest = text.match(/^\S+/)?.[0];
    if (rest) return [<Fragment key={`${key}-w`}>{rest}</Fragment>, ...keepSuspended(text.slice(rest.length), key)];
  }
  return text.split(SUSPENDED).map((part, i) =>
    i % 2 === 1 ? (
      <span key={`${key}-${i}`} className={KEEP_TOGETHER_CLASS}>
        {part}
      </span>
    ) : (
      <Fragment key={`${key}-${i}`}>{part}</Fragment>
    ),
  );
}

export function wholeNames(text: string): ReactNode {
  const parts = text.split(NAME);
  if (parts.length === 1 && !SUSPENDED.test(text)) return text;
  return parts.flatMap((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={WHOLE_NAME_CLASS}>
        {part}
      </span>
    ) : (
      keepSuspended(part, String(i), i === 0)
    ),
  );
}

// For rendered HTML (the legal pages): only in text between tags, never inside a tag or an
// attribute (a link's address keeps its words).
// names: a subset to wrap (Help wraps only LONG_NAMES; its tests read the short names as plain text).
export function wholeNamesHtml(html: string, names: readonly string[] = WHOLE_NAMES): string {
  const pattern = names === WHOLE_NAMES ? NAME : new RegExp(`(${names.join("|")})`, "g");
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.replace(pattern, `<span class="${WHOLE_NAME_CLASS}">$1</span>`)))
    .join("");
}

// The support address at large text (UX, 20 Nov, the Web Tester's fr/pt-BR sweep: "support@mood / bow.com" on six
// public pages): a line may end only after its "@", and the domain stays whole (it fits a 320 px line at 300 %). The
// text is unchanged (a <wbr> and a no-wrap span), so copying it gives the plain address.
const [SUPPORT_LOCAL, SUPPORT_DOMAIN] = SUPPORT_EMAIL.split("@");
export function SupportAddress() {
  return (
    <>
      {SUPPORT_LOCAL}@<wbr />
      <span className={KEEP_TOGETHER_CLASS}>{SUPPORT_DOMAIN}</span>
    </>
  );
}
// A message that names the address as plain text ({email}): the address in its place.
export function withSupportAddress(text: string): ReactNode {
  const parts = text.split(SUPPORT_EMAIL);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<SupportAddress key={i} />, part]));
}
// The same in rendered HTML (the legal pages, Help's articles): only in text between tags, so a mailto: link's
// address stays as it is.
export function supportAddressHtml(html: string): string {
  const shown = `${SUPPORT_LOCAL}@<wbr><span class="${KEEP_TOGETHER_CLASS}">${SUPPORT_DOMAIN}</span>`;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith("<") ? part : part.split(SUPPORT_EMAIL).join(shown)))
    .join("");
}
