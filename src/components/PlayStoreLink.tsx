"use client";

import { useSyncExternalStore } from "react";
import { currentCampaign, playLink } from "@/lib/campaign";
import { PLAY_URL } from "@/lib/stores";

const noSubscribe = () => () => {};

// The Google Play listing link, with the landing page's campaign as Play's
// install referrer (lib/campaign, decision 79), so an install is attributed
// to the campaign that brought the visit. The server renders the plain link;
// the browser adds the campaign, which lives in this tab's memory only.
export function PlayStoreLink({ className, testId, children }: { className?: string; testId?: string; children: React.ReactNode }) {
  const href = useSyncExternalStore(noSubscribe, () => playLink(PLAY_URL, currentCampaign()), () => PLAY_URL);
  return (
    <a href={href} data-testid={testId} className={className}>
      {children}
    </a>
  );
}
