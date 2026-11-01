"use client";

import { createContext, useContext, useState } from "react";

// Today's unsaved check-in choices, kept in memory above the routes (#9765
// M-01): leaving Today and coming back in the same visit brings them back,
// until saved or the day changes. Never in browser storage (a check-in is
// health data; the privacy policy keeps only display choices there). The
// layout keys this by user, and sign-out leaves /app, so it's gone then;
// a reload loses it too (UX: acceptable).
export type CheckInDraftSlot<F> = { get: (date: string) => F | null; set: (date: string, fields: F | null) => void };

const DraftContext = createContext<CheckInDraftSlot<unknown> | null>(null);

export function CheckInDraftProvider({ children }: { children: React.ReactNode }) {
  // One slot: only Today's card uses it, so another day's draft is stale.
  const [value] = useState<CheckInDraftSlot<unknown>>(() => {
    let slot: { date: string; fields: unknown } | null = null;
    return {
      get: (date) => (slot?.date === date ? slot.fields : null),
      set: (date, fields) => {
        slot = fields === null ? null : { date, fields };
      },
    };
  });
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

// null outside the provider (tests, a card that doesn't keep a draft).
export const useCheckInDraft = <F,>() => useContext(DraftContext) as CheckInDraftSlot<F> | null;
