// A switch row at any text size (UX, 20 Nov; the Web Tester's sweep found "T / ä / gl / ic / h / e" beside Me's
// reminder switch at 300 % on a 320 px phone): the label and its switch share the line while they fit. At large text
// the label takes the whole line and the switch goes under it, on the right. The label's basis is in em, so it grows
// with the text and wraps the row just when the label would otherwise be squeezed; at the normal size nothing moves.
export const SWITCH_ROW = "flex flex-wrap items-center gap-x-4 gap-y-2";
export const SWITCH_LABEL = "min-w-0 grow basis-[9em] [overflow-wrap:anywhere]";
export const SWITCH_CONTROL = "ml-auto shrink-0";
