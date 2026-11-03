"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { hasLocalKinds, SIGN_OUT_TRACE_KINDS, UNSYNCED_KINDS, wipeLocalKinds } from "@/lib/localData";
import { broadcastSignOut, type SignOutMode } from "@/lib/signOutSignal";
import { withTimeout } from "@/lib/ui/withTimeout";
import { saveCheckIn } from "../actions";
import { pendingForms, removePending } from "../CheckInCard";
import { signOut } from "./actions";

// Me → Sign out on a shared computer (UX & PM 2026-11-03, option C, amending
// decision 81 for deliberate web sign-outs; an expired session still keeps
// everything, and the app, a personal phone, stays on 81). Check-ins saved
// offline get one try first. If writing not yet saved to the journal is
// still in this browser, a dialog asks whether to keep it here for next
// time or delete it; Cancel stays signed in. Either way On this day's
// "hidden today" marks go, and the other tabs are told (lib/signOutSignal).

// One try, 5 s in all (UX): whatever isn't saved by then is asked about.
const SYNC_BUDGET_MS = 5000;

async function syncPending(uid: string): Promise<void> {
  if (!navigator.onLine) return;
  const deadline = Date.now() + SYNC_BUDGET_MS;
  for (const { key, form } of pendingForms(uid)) {
    const left = deadline - Date.now();
    if (left <= 0) return;
    try {
      const result = await withTimeout(saveCheckIn({ status: "idle" }, form), left);
      if (result.status === "saved") removePending(key);
    } catch {
      // failed, timed out or redirected (the session already ended): the
      // rest stays, as decision 81 keeps it
      return;
    }
  }
}

function hasUnsynced(uid: string): boolean {
  try {
    return hasLocalKinds(window.localStorage, uid, UNSYNCED_KINDS);
  } catch {
    return false;
  }
}

export function SignOutButton({ uid }: { uid: string }) {
  const t = useTranslations("app");
  const tm = useTranslations("me");
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  const signOutWith = (mode: SignOutMode) => {
    setAsking(false);
    // The other tabs first, so their editors stop writing before this wipes.
    broadcastSignOut({ uid, mode });
    try {
      if (mode === "delete") wipeLocalKinds(window.localStorage, uid, UNSYNCED_KINDS);
      wipeLocalKinds(window.localStorage, uid, SIGN_OUT_TRACE_KINDS);
    } catch {
      // storage unavailable: nothing is there to wipe
    }
    form.current?.requestSubmit();
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    await syncPending(uid);
    setBusy(false);
    if (hasUnsynced(uid)) setAsking(true);
    else signOutWith("keep");
  };

  return (
    <>
      <form ref={form} action={signOut}>
        <button
          type="button"
          data-testid="me-sign-out"
          onClick={start}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className="inline-flex min-h-12 items-center rounded-full border border-border px-6 font-medium text-accent hover:bg-pill aria-disabled:opacity-50"
        >
          {t("meSignOut")}
        </button>
      </form>
      {asking && (
        // The safe choice last, filled, and where focus starts (decision 143).
        <Dialog title={tm("signOutKeepTitle")} body={tm("signOutKeepBody")} onCancel={() => setAsking(false)} testId="sign-out-dialog" initialFocus="last">
          <button type="button" data-testid="sign-out-delete" className={dialogButton()} onClick={() => signOutWith("delete")}>
            {tm("signOutDelete")}
          </button>
          <button type="button" data-testid="sign-out-keep" className={dialogButton(true)} onClick={() => signOutWith("keep")}>
            {tm("signOutKeep")}
          </button>
        </Dialog>
      )}
    </>
  );
}
