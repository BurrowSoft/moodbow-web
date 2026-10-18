"use client";

import { Analytics } from "@vercel/analytics/next";
import { scrubEvent } from "@/lib/analytics";

// Vercel Web Analytics with the URL scrubber (lib/analytics.ts). Rendered
// only when the "web-analytics" condition is met (the locale layout).
export function VisitCounts() {
  return <Analytics beforeSend={scrubEvent} />;
}
