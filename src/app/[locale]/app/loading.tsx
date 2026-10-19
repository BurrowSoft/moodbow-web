import { SlowLoading } from "@/components/SlowLoading";

// Shown at once on in-app navigation (tabs, links) while the next page
// loads: a quiet spinner, and "Taking longer than usual…" after 3 s. A full
// page load keeps the browser's own spinner instead (UX: the proxy settles
// the session before any HTML is sent).
export default function AppLoading() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center" data-testid="app-loading" data-loading-boundary="">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none" aria-hidden="true" />
      <SlowLoading />
    </div>
  );
}
