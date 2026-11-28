"use client";

import { useEffect, useState } from "react";
import { FOLD_MS, foldClass, foldInnerClass } from "@/lib/ui/fold";

// A row of the entry editor that folds away while someone writes and comes back if the box is
// emptied (lib/ui/fold: board 31b). Folded, it's inert: no focus lands in it, nothing in it is
// read, and it ends hidden.
export function Fold({ folded, inline = false, testId, children }: { folded: boolean; inline?: boolean; testId?: string; children: React.ReactNode }) {
  // Clipped from the moment it starts to move (either way) until it has opened again.
  const [clip, setClip] = useState(folded);
  const [was, setWas] = useState(folded);
  if (folded !== was) {
    setWas(folded);
    setClip(true);
  }
  useEffect(() => {
    if (folded || !clip) return;
    const timer = window.setTimeout(() => setClip(false), FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [folded, clip]);
  const Tag = inline ? "span" : "div";
  return (
    <Tag inert={folded} data-testid={testId} data-folded={folded} className={foldClass(folded, inline)}>
      <Tag className={foldInnerClass(clip)}>{children}</Tag>
    </Tag>
  );
}
