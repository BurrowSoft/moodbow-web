import { Fragment } from "react";

// A sentence holding a help number, as someone has to dial it (Web Tester, #247; UX). By CSS, not
// no-break spaces: what's copied has plain spaces, for pasting into a dialler or a message, and it
// needs no script.
// - The number, with the "(" and ")" around it, is one inline block: where it fits on a line it
//   stays whole there, moving to the next line rather than splitting.
// - Only a number wider than the line itself (at large text: "0800 111 0 111" at 300 % on a
//   320 px phone, UX 12 Nov) wraps, and then only between its digit groups, never inside one.
// - The block takes the link's underline (an inline block doesn't inherit it by itself).
export function HelpNumberText({ text, number }: { text: string; number: string }) {
  const at = text.indexOf(number);
  if (at < 0) return text;
  const open = text[at - 1] === "(" ? "(" : "";
  const close = text[at + number.length] === ")" ? ")" : "";
  const groups = number.split(" ");
  return (
    <>
      {text.slice(0, at - open.length)}
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
