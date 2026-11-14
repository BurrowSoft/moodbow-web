"use client";

import { useEffect } from "react";
import { clearPictures } from "@/lib/me/picture";

// With no session (SessionEnded), Me's pictures in this browser go: nobody is signed in to see one,
// and the next person here may be someone else (the Reviewer, #321).
export function PicturesClear() {
  useEffect(() => {
    void clearPictures().catch(() => {});
  }, []);
  return null;
}
