// Leaving a screen that holds unsaved work, by a way that isn't a link (the
// keyboard shortcuts; reviewer M1 on #110). The entry editor holds the
// guard while it's open; leaveThen(go) asks it first, and the guard calls
// go() after Discard or Keep draft, or straight away with nothing to keep.
// With no guard, go() runs at once (decision 206: every way out asks).
type Guard = (go: () => void) => void;

let guard: Guard | null = null;

// Returns the release, for the effect's cleanup; a later holder isn't
// released by an earlier one's cleanup.
export function holdLeaving(g: Guard): () => void {
  guard = g;
  return () => {
    if (guard === g) guard = null;
  };
}

export function leaveThen(go: () => void) {
  if (guard) guard(go);
  else go();
}
