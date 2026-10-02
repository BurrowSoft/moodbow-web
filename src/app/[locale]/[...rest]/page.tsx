import { notFound } from "next/navigation";

// Unknown paths under a locale render the localized not-found page (inside
// the locale layout) instead of Next's bare default.
export default function CatchAll() {
  notFound();
}
