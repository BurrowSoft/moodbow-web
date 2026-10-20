"use client";

import { useEffect } from "react";
import { rememberCampaign } from "@/lib/campaign";

// Notes the landing page's campaign labels (lib/campaign) when the site
// first opens in this tab, whatever page that is: landing on /help?utm_…
// and then opening / still attributes the Play link (reviewer F1, #114).
// In the locale layout, which stays mounted across client navigations, so
// this runs once per visit. Independent of web-analytics: memory only.
export function CampaignLanding() {
  useEffect(() => {
    rememberCampaign(window.location.search);
  }, []);
  return null;
}
