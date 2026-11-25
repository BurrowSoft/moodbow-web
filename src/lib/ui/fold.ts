// A row that folds away while someone writes (the storybook's board 31b, 25 Nov): its height to
// nothing with a fade, 250 ms easeOutCubic, and back the same way; with reduced motion, no
// transition at all, so it's instant. Folded, it also gives back the editor's 1rem gap above it
// (-mt-4 against the form's gap-4), so what's below moves up smoothly and the text box never
// jumps, and it ends hidden: visibility flips at the end of the fold and at the start of the
// unfold. inline: a part of a line of text (the prompt's Another): only its height folds, and its
// width stays, so the words beside it don't rewrap.
// Here and not in the component, so e2e/fold.spec.ts checks these exact classes in a browser.
export const FOLD_MS = 250;

export const foldClass = (folded: boolean, inline = false) =>
  [
    inline ? "inline-grid" : "grid",
    "transition-[grid-template-rows,opacity,margin-top,visibility] duration-[250ms] ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
    folded ? "grid-rows-[0fr] opacity-0 invisible" : "grid-rows-[1fr] opacity-100",
    folded && !inline ? "-mt-4" : "",
  ]
    .filter(Boolean)
    .join(" ");

// Its content, in a flex column, so a link or button lays out exactly as it did as the editor's own
// row (a flex item: no line box around it to make a 44 px row taller). Clipped while folded and while
// it moves, so nothing spills over the rows below it; open, nothing is clipped, so a focus ring
// (5 px outside, globals.css) shows whole.
export const foldInnerClass = (clip: boolean) => (clip ? "flex min-h-0 flex-col overflow-hidden" : "flex min-h-0 flex-col");
