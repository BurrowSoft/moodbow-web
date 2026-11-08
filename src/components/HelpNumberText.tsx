// A sentence holding a help number, with the number kept on one line, as someone has to dial it
// (Web Tester, #247; UX). By CSS, not no-break spaces: what's copied has plain spaces, for pasting into
// a dialler or a message, and it needs no script. "(" and ")" don't break from what they touch.
export function HelpNumberText({ text, number }: { text: string; number: string }) {
  const at = text.indexOf(number);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-help-number="" className="whitespace-nowrap">
        {number}
      </span>
      {text.slice(at + number.length)}
    </>
  );
}
