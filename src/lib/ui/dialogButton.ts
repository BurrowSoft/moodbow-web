import { LARGE_TEXT_CAP } from "./largeText";

// The app's dialog and card buttons (exported by components/Dialog too). Decision 231's cap at large text on a narrow
// screen (UX, 20 Nov: "Exporter mes donnée / s" at fr 320 px / 300 %). A module of its own, without React, so
// e2e/large-text.spec.ts builds the same button in a real browser.
export const dialogButton = (primary = false, hyphens = true) =>
  `inline-flex min-h-11 max-w-full items-center justify-center rounded-full px-[20px] text-center font-medium ${hyphens ? "hyphens-auto" : ""} [overflow-wrap:anywhere] ${LARGE_TEXT_CAP} ${
    primary ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-border text-text hover:bg-pill"
  }`;
