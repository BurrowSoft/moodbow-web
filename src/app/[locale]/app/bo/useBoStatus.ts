"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { parseBoStatus, type BoStatus } from "@/lib/journal/bo";

// Whether Bo is available, asked once the page is on screen, so no page waits on Bo for its
// first byte, Today least of all (UX). No answer in BO_STATUS_WAIT_MS: nothing, as if Bo were
// off. The answer is kept for this tab for a few minutes, per account and language, so each page
// doesn't ask again; it's a yes or no and a reason, never anything said to Bo.
export const BO_STATUS_WAIT_MS = 2500;
export const BO_STATUS_FRESH_MS = 5 * 60_000;
const KEY = "moodbow.bo-status";

type Kept = { uid: string; language: string; at: number; status: BoStatus };

function read(uid: string, language: string, now: number): BoStatus | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Kept | null;
    if (kept && kept.uid === uid && kept.language === language && now - kept.at < BO_STATUS_FRESH_MS) return kept.status;
  } catch {}
  return null;
}

function keep(uid: string, language: string, status: BoStatus) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ uid, language, at: Date.now(), status } satisfies Kept));
  } catch {}
}

export function useBoStatus(uid: string): BoStatus | null {
  const language = useLocale();
  const [status, setStatus] = useState<BoStatus | null>(null);
  useEffect(() => {
    let current = true;
    const kept = read(uid, language, Date.now());
    if (kept) {
      // After the first render, as the server rendered no answer: the same first paint on both.
      void Promise.resolve().then(() => current && setStatus(kept));
      return () => {
        current = false;
      };
    }
    fetch("/api/bo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", language }), signal: AbortSignal.timeout(BO_STATUS_WAIT_MS) })
      .then((r) => r.json())
      .then((body: unknown) => {
        // The route's own shape, read again: anything else is no answer.
        const b = (body ?? {}) as { status?: unknown; available?: unknown; reason?: unknown; pictures?: unknown; maxChars?: unknown };
        const answer: BoStatus = b.status === "ok" ? parseBoStatus({ available: b.available, reason: b.reason, pictures: b.pictures, limits: { max_chars: b.maxChars } }) : { status: "no_answer" };
        if (answer.status !== "ok") return;
        keep(uid, language, answer);
        if (current) setStatus(answer);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [uid, language]);
  return status;
}
