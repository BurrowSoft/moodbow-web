import { Fragment, type ReactNode } from "react";
import { WHOLE_NAME_CLASS, WHOLE_NAMES } from "@/lib/wholeNames";

// A sentence holding a help number, as someone has to dial it (Web Tester, #247; UX). By CSS, not
// no-break spaces: what's copied has plain spaces, for pasting into a dialler or a message, and it
// needs no script.
// - The number, with the "(" and ")" around it, is one inline block: where it fits on a line it
//   stays whole there, moving to the next line rather than splitting.
// - Only a number wider than the line itself (at large text: "0800 111 0 111" at 300 % on a
//   320 px phone, UX 12 Nov) wraps, and then only between its digit groups, never inside one.
// - The block takes the link's underline (an inline block doesn't inherit it by itself).
// - name (the helpline's, in "Call {name} ({number})"): one inline block too, so a long name takes its own line
//   rather than being cut (UX, 20 Nov: the Web Tester's "TelefonSeelsor / ge" on the safety plan at 200 %). A brand
//   name (WHOLE_NAMES) stays whole; where it can't fit at all (16 letters at 300 % on a 320 px phone) it breaks only
//   at its compound boundary, with a hyphen ("Telefon- / Seelsorge": a soft hyphen there, the only one). An ordinary
//   long word in a name hyphenates at large text (globals.css, [data-help-name]); the number and the verb never do.
export function HelpNumberText({ text, number, name }: { text: string; number: string; name?: string }) {
  const at = text.indexOf(number);
  if (at < 0) return text;
  const open = text[at - 1] === "(" ? "(" : "";
  const close = text[at + number.length] === ")" ? ")" : "";
  const groups = number.split(" ");
  const before = text.slice(0, at - open.length);
  return (
    <>
      {name ? withName(before, name) : before}
      <span className="inline-block max-w-full [text-decoration:inherit]">
        {open}
        <span data-help-number="">
          {groups.map((group, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">{group}</span>
            </Fragment>
          ))}
        </span>
        {close}
      </span>
      {text.slice(at + number.length + close.length)}
    </>
  );
}

// A soft hyphen between a lowercase letter and the capital after it: a compound brand name's own boundary
// ("TelefonSeelsorge" → "Telefon­Seelsorge"), the one place it may break. The text otherwise stays as written.
export const compoundBreak = (name: string) => name.replace(/(?<=\p{Ll})(?=\p{Lu})/gu, "­");

function withName(text: string, name: string): ReactNode {
  const at = text.indexOf(name);
  if (at < 0) return text;
  const brand = (WHOLE_NAMES as readonly string[]).includes(name);
  return (
    <>
      {text.slice(0, at)}
      <span data-help-name="" className="inline-block max-w-full [text-decoration:inherit]">
        {brand ? <span className={WHOLE_NAME_CLASS}>{compoundBreak(name)}</span> : name}
      </span>
      {text.slice(at + name.length)}
    </>
  );
}
