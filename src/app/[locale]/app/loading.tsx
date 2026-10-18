import { SlowLoading } from "@/components/SlowLoading";

// Shown at once on in-app navigation (tabs, links) while the next page
// loads; it says "Taking longer than usual…" after 3 s. A full page load
// keeps the browser's own spinner instead (UX: the proxy settles the session
// before any HTML is sent).
export default function AppLoading() {
  return (
    <div className="py-16 text-center">
      <SlowLoading />
    </div>
  );
}
