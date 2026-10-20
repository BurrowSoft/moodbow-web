"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { readShortcutsOn, shortcutFor, SHORTCUTS } from "@/lib/shortcuts";
import { requestArrival } from "@/lib/ui/arrival";
import { leaveThen } from "@/lib/ui/leaveGuard";

// Web keyboard shortcuts (1.1 O, decision 200), for the whole journal:
// n new entry, c Today's check-in, t Timeline, i Insights, / Timeline search
// (when search is live), ? this list. lib/shortcuts decides when a key
// counts (never while typing, in a dialog or with Ctrl/Cmd/Alt); Me →
// Appearance turns them all off on this device.
export function KeyboardShortcuts({ search }: { search: boolean }) {
  const t = useTranslations("me");
  const ts = useTranslations("safety");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!readShortcutsOn()) return;
      const action = shortcutFor(e, { search });
      if (!action) return;
      e.preventDefault();
      if (action === "help") {
        opener.current = document.activeElement;
        setOpen(true);
        return;
      }
      // Every way out asks first where there's unsaved text (the entry
      // editor's leave dialog; decision 206): the arrival too, so Keep
      // editing leaves none waiting.
      leaveThen(() => {
        if (action === "new") router.push("/app/write");
        else if (action === "timeline") router.push("/app/timeline");
        else if (action === "insights") router.push("/app/insights");
        else if (action === "checkIn") {
          requestArrival("checkIn");
          if (pathname !== "/app") router.push("/app");
        } else if (action === "search") {
          requestArrival("search");
          if (pathname !== "/app/timeline") router.push("/app/timeline");
        }
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, pathname, search]);

  // A modal <dialog>: the browser traps focus, makes the page inert and
  // closes it on Esc.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !open) return;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }, [open]);

  const close = () => {
    dialog.current?.close?.();
    setOpen(false);
    if (opener.current instanceof HTMLElement) opener.current.focus();
  };

  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="shortcuts-title"
      data-testid="shortcuts-dialog"
      onClose={close}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface p-6 text-text backdrop:bg-black/40"
    >
      <h2 id="shortcuts-title" className="text-lg font-medium">
        {t("shortcutsTitle")}
      </h2>
      <dl className="mt-4 space-y-2">
        {/* The keys, then "?" itself (this list; UX). */}
        {[...SHORTCUTS.filter((s) => s.action !== "search" || search), { key: "?", label: "shortcutsTitle" } as const].map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <dt>
              <kbd className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border bg-bg px-2 font-mono text-sm">{s.key}</kbd>
            </dt>
            <dd>{t(s.label)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-muted">{t("shortcutsOff")}</p>
      <button
        type="button"
        data-testid="shortcuts-close"
        onClick={close}
        className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-pill"
      >
        {ts("safetyClose")}
      </button>
    </dialog>
  );
}
