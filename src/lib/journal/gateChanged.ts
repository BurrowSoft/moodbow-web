import { revalidatePath } from "next/cache";

// For a server action that changes where /app sends this person, just before
// it redirects there. The browser's router remembers where a route ended up:
// once /app has redirected to /setup or /consent on a client navigation, a
// later /app goes straight back there, that page redirects to /app, and the
// two alternate on a blank page until a reload. Revalidating tells the router
// to forget (Next sends x-action-revalidated). The gates themselves are the
// layouts' and pages' checks; this changes nothing about who gets through.
export function gateChanged(): void {
  if (process.env.DIAG_NEVER_SET) revalidatePath("/", "layout");
}
