"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { promptFor, promptText } from "@/lib/journal/prompts";
import { Dialog, dialogButton } from "@/components/Dialog";
import { SafetyCard } from "@/components/SafetyCard";
import { Switch } from "@/components/Switch";
import { useRouter } from "@/i18n/navigation";
import { withQuestion } from "@/lib/journal/answer";
import { MAX_ENTRY_CHARS, sameEntry, type Entry } from "@/lib/journal/entry";
import { localKey } from "@/lib/localData";
import { flagsCrisis } from "@/lib/safety/crisis";
import { holdLeaving } from "@/lib/ui/leaveGuard";
import { SAVE_WAIT_MS, withTimeout } from "@/lib/ui/withTimeout";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { PRIMARY_SAVE } from "@/lib/ui/journalLayout";
import { deleteEntry, getEntry, saveEntry, type DeleteState, type EntryState } from "./actions";

// The entry editor (M4): a full-page text area, a date (today or earlier)
// and "Mark as a moment". A draft is autosaved in this browser, per user and
// per entry, every couple of seconds; leaving with changes (Cancel or any
// link in the page) asks to keep or discard it, and closing the tab gets
// the browser's own prompt (the draft
// is already saved). A save that meets a newer version from another device
// asks which one to keep (decision 87).
type Fields = { body: string; date: string; isMoment: boolean };
// base: the server version (updated_at) these edits started from; null for
// an entry that doesn't exist on the server yet.
type Draft = Fields & { id: string; base: string | null };

const AUTOSAVE_MS = 2000;
const fromEntry = (e: Entry): Fields => ({ body: e.body, date: e.entry_date, isMoment: e.is_moment });
const same = (a: Fields, b: Fields) => a.body === b.body && a.date === b.date && a.isMoment === b.isMoment;

function readDraft(key: string): Draft | null {
  try {
    const d = JSON.parse(window.localStorage.getItem(key) ?? "null") as Draft | null;
    return d && typeof d.id === "string" && typeof d.body === "string" && typeof d.date === "string" && typeof d.isMoment === "boolean" ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: Draft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // storage unavailable: the editor still works, nothing is kept
  }
}
function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// Whether this browser holds an unsaved draft of the entry: the entry view
// opens the editor straight away, so the draft isn't hidden (decision 151).
export const hasDraft = (uid: string, entryId: string) => readDraft(localKey("draft-entry", uid, entryId))?.id === entryId;

// startDate: the day a new entry starts on (a Timeline day's "Add an entry").
// country: the profile's, for the safety card's numbers (M8).
// backTo: where leaving the editor goes: the page it was opened from
// (decision 152), else Today.
// From the entry view (decision 151): start puts the caret where the text was
// clicked, or at the end; with a question ("Write your answer") it's quoted
// after the entry first. onLeave replaces going to backTo: Save and Cancel
// return to the view, with the saved entry when there's a new version.
// promptDate: the writing prompt's day (1.1 I), where prompts are on and
// nothing earlier that day was crisis-flagged (the page decides); shown only
// while the text is empty and the entry is still on that day (reviewer #83).
export type EditorStart = { at: number | "end"; question?: string };
type Props = {
  promptDate?: string | null;
  initial: Entry | null;
  newId: string;
  uid: string;
  today: string;
  startDate?: string;
  country?: string | null;
  backTo?: string;
  start?: EditorStart;
  onLeave?: (saved: Entry | null) => void;
};

const noSubscribe = () => () => {};

// The draft lives in this browser only, so the server renders the editor
// without it; once in the browser the editor mounts again and starts from
// the draft, if there is one.
export function EntryEditor(props: Props) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return <Editor key={inBrowser ? "browser" : "server"} {...props} restore={inBrowser} />;
}

function Editor({ initial, newId, uid, today, startDate, country, backTo = "/app", start, onLeave, restore, promptDate }: Props & { restore: boolean }) {
  const t = useTranslations("entry");
  const language = useLocale();
  // "Another" steps through the list from the day's prompt.
  const [promptStep, setPromptStep] = useState(0);
  const tt = useTranslations("today");
  const router = useRouter();
  const draftKey = localKey("draft-entry", uid, initial ? initial.id : "new");

  // What "unchanged" means: the server version, or a blank new entry.
  const [saved, setSaved] = useState<Fields>(initial ? fromEntry(initial) : { body: "", date: startDate ?? today, isMoment: false });
  // A new entry's draft is kept only with text in it: a changed date or
  // moment alone isn't worth keeping, and must not win over the day the
  // next "Add an entry" asks for (Web Tester #83).
  const [draft] = useState(() => {
    const d = restore ? readDraft(draftKey) : null;
    return d && (!initial || d.id === initial.id) && (initial || d.body.trim() !== "") ? d : null;
  });
  const [id, setId] = useState(draft?.id ?? initial?.id ?? newId);
  const [base, setBase] = useState<string | null>(draft ? draft.base : (initial?.updated_at ?? null));
  const [fields, setFields] = useState<Fields>(() => {
    const f = draft ? { body: draft.body, date: draft.date, isMoment: draft.isMoment } : saved;
    return start?.question ? { ...f, body: withQuestion(f.body, start.question) } : f;
  });
  const [dialog, setDialog] = useState<null | "leave" | "delete" | { conflict: Entry | null }>(null);
  // The safety card after a save the keyword check flagged (M8, decision
  // 124): the entry is already saved; we stay on it, and closing the card
  // puts focus back in the entry. The check runs here only; nothing about
  // it is sent or kept (decision 125).
  const [safety, setSafety] = useState<"closed" | "open">("closed");
  const dirty = !same(fields, saved);
  // Whether there's anything to keep in this browser (see draft above).
  const keep = dirty && (initial !== null || fields.body.trim() !== "");

  // The latest values for the unload handler and the autosave timer.
  const current = useRef<Draft>({ ...fields, id, base });
  const keepRef = useRef(keep);
  useEffect(() => {
    current.current = { ...fields, id, base };
    keepRef.current = keep;
  });
  // Set once the text is saved, discarded or deleted: nothing left to keep.
  const finished = useRef(false);

  // Leaving by any route (a redirect after Save, the tab bar, Back) keeps
  // unsaved text: the 2 s autosave timer dies with the editor.
  useEffect(() => {
    if (!restore) return;
    return () => {
      if (!finished.current && keepRef.current) writeDraft(draftKey, current.current);
    };
  }, [draftKey, restore]);

  // A restored "new" draft may already be saved (the answer to its save was
  // lost) and even edited since. Ask the server before treating it as new,
  // the same as the app: none → keep writing; the same text → it's saved,
  // start a fresh entry; different → the decision 87 dialog.
  useEffect(() => {
    if (!restore || initial || !draft) return;
    let cancelled = false;
    getEntry(draft.id)
      .then((result) => {
        if (cancelled || result.status !== "ok" || !result.entry) return;
        if (sameEntry(result.entry, draft)) {
          // Only if nothing was typed while we asked.
          if (!same(current.current, draft)) return;
          removeDraft(draftKey);
          setId(newId);
          setBase(null);
          setFields({ body: "", date: startDate ?? today, isMoment: false });
        } else {
          setDialog({ conflict: result.entry });
        }
      })
      .catch(() => {
        // offline: the save path asks again
      });
    return () => {
      cancelled = true;
    };
  }, [restore, initial, draft, draftKey, newId, today, startDate]);

  // Autosave the draft a moment after each change; an editor put back to
  // the saved version has nothing to keep. Not before the draft was read
  // (the server-rendered pass), or it would be wiped before it's restored.
  useEffect(() => {
    if (!restore) return;
    if (!keep) {
      removeDraft(draftKey);
      return;
    }
    const timer = window.setTimeout(() => writeDraft(draftKey, current.current), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [fields, keep, draftKey, restore]);

  // Closing or reloading the tab: the browser's own prompt (it can't show
  // ours), only when there's something to keep (decision 206).
  useEffect(() => {
    if (!restore) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!keepRef.current || finished.current) return;
      writeDraft(draftKey, current.current);
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [draftKey, restore]);

  // Every way out asks (decision 206): a link in the page (the tab bar, the
  // Back chevron) is held before the router sees it, the leave dialog
  // opens, and after Discard or Keep draft the same click is replayed on
  // the same link, so it goes exactly where it would have.
  const leaveVia = useRef<HTMLAnchorElement | null>(null);
  const letThrough = useRef(false);
  useEffect(() => {
    if (!restore) return;
    const onClick = (e: MouseEvent) => {
      if (letThrough.current) {
        letThrough.current = false;
        return;
      }
      if (!keepRef.current || finished.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      leaveVia.current = a;
      setDialog("leave");
    };
    // On window, in the capture phase: before React's own listeners.
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [restore]);

  // Ways out that aren't links (the keyboard shortcuts) ask the same way:
  // the dialog opens, and the way out runs after Discard or Keep draft.
  const leaveGo = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!restore) return;
    return holdLeaving((go) => {
      if (!keepRef.current || finished.current) return go();
      leaveVia.current = null;
      leaveGo.current = go;
      setDialog("leave");
    });
  }, [restore]);

  // Opened from the entry view: the caret goes where the text was clicked
  // (a draft may be shorter: then its end), or at the end, ready to write.
  const startAt = start && (start.question || start.at === "end" ? "end" : start.at);
  useEffect(() => {
    if (!restore || startAt === undefined) return;
    const el = document.getElementById("entry-text") as HTMLTextAreaElement | null;
    if (!el) return;
    const at = startAt === "end" ? el.value.length : Math.min(startAt, el.value.length);
    el.focus();
    el.setSelectionRange(at, at);
  }, [restore, startAt]);

  // The last version saved from here: the view shows it even when leaving
  // later by Cancel (after a save the safety card kept us on the entry).
  const lastSaved = useRef<Entry | null>(null);
  const leave = useCallback(() => (onLeave ? onLeave(lastSaved.current) : router.push(backTo)), [router, backTo, onLeave]);
  // After the leave dialog: on through the link that opened it, if any (and
  // still there), else the editor's own way out.
  // A held link or shortcut goes on only once the dialog has closed: its
  // inert is off the page and its focus restored, so where the way out
  // puts focus (the "c" shortcut: Today's first face) isn't undone or
  // refused inside an inert page (Web Tester, #110 P8).
  const leaveOn = useCallback(() => {
    const a = leaveVia.current;
    const go = leaveGo.current;
    leaveVia.current = null;
    leaveGo.current = null;
    setDialog(null);
    if (!go && !a) return leave();
    window.setTimeout(() => {
      if (go) go();
      else if (a?.isConnected) {
        letThrough.current = true;
        a.click();
      } else leave();
    }, 0);
  }, [leave]);
  const closeSafety = useCallback(() => {
    setSafety("closed");
    // After the card's own focus restore (on its unmount): back into the entry.
    window.setTimeout(() => document.getElementById("entry-text")?.focus(), 0);
  }, []);

  const [state, action, pending] = useActionState<EntryState, FormData>(async (prev, form) => {
    let next: EntryState;
    try {
      // No answer in 30 s: the same as a failed request (the draft is kept;
      // Save again; the timeout audit).
      next = await withTimeout(saveEntry(prev, form), SAVE_WAIT_MS);
      // "Changed elsewhere", but the server's version is exactly this one:
      // our own save that landed after the browser stopped waiting. Saved;
      // no conflict dialog (UX, after the timeout audit).
      if (next.status === "error" && next.error === "stale" && next.latest && sameEntry(next.latest, { body: String(form.get("body") ?? ""), date: String(form.get("entry_date") ?? ""), isMoment: form.get("is_moment") === "true" })) {
        next = { status: "saved", entry: next.latest };
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      // offline or the request failed: the draft is still here
      return { status: "error", error: "generic" };
    }
    if (next.status === "saved") {
      finished.current = true;
      removeDraft(draftKey);
      lastSaved.current = next.entry;
      setSaved(fromEntry(next.entry));
      setFields(fromEntry(next.entry));
      if (flagsCrisis(next.entry.body, CRISIS_KEYWORDS)) {
        // Staying on the saved entry: it's now the version edits start from,
        // and further edits are a draft again (reviewer #35).
        finished.current = false;
        setBase(next.entry.updated_at);
        setSafety("open");
      } else leave();
    } else if (next.status === "error" && next.error === "stale") {
      setDialog({ conflict: next.latest });
    }
    return next;
  }, { status: "idle" });

  const [deleteState, deleteAction, deleting] = useActionState<DeleteState, FormData>(async (prev, form) => {
    try {
      const next = await deleteEntry(prev, form);
      if (next.status === "error") finished.current = false;
      return next;
    } catch (e) {
      if (isRedirect(e)) throw e;
      // offline or the request failed: nothing was deleted
      finished.current = false;
      return { status: "error" };
    }
  }, { status: "idle" });

  const send = (withBase: string | null) => {
    // Kept before the request: a redirect (session ended, consent) unmounts
    // the editor before any answer comes back.
    if (restore) writeDraft(draftKey, { ...fields, id, base: withBase });
    const form = new FormData();
    form.set("id", id);
    form.set("entry_date", fields.date);
    form.set("body", fields.body);
    form.set("is_moment", String(fields.isMoment));
    form.set("expected_updated_at", withBase ?? "");
    startTransition(() => action(form));
  };

  const tooLong = fields.body.length > MAX_ENTRY_CHARS;
  const future = fields.date > today;
  const blank = fields.body.trim() === "";
  const errorText = tooLong
    ? t("entryTooLong")
    : future
      ? tt("errDateInFuture")
      : state.status === "error" && state.error !== "stale"
        ? state.error === "dateInFuture"
          ? tt("errDateInFuture")
          : state.error === "tooLong"
            ? t("entryTooLong")
            : tt("errGeneric")
        : deleteState.status === "error"
          ? tt("errGeneric")
          : null;

  const closeDialog = useCallback(() => {
    leaveVia.current = null;
    leaveGo.current = null;
    setDialog(null);
  }, []);
  const conflict = dialog && typeof dialog === "object" ? dialog.conflict : undefined;

  const showPrompt = !!promptDate && fields.date === promptDate && fields.body.trim() === "";
  return (
    <form
      className="flex min-h-[70dvh] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blank && !tooLong && !future) send(base);
      }}
    >
      {/* The page's heading (also its title), for heading navigation. */}
      <h1 className="sr-only">{initial ? t("entryEditTitle") : t("entryNewTitle")}</h1>
      {/* The date first, then the text (the mockups, decision 161). */}
      <div className="flex flex-col gap-1">
        <label htmlFor="entry-date" className="text-sm font-medium text-text">
          {t("entryDateLabel")}
        </label>
        <input
          id="entry-date"
          data-testid="entry-date"
          type="date"
          max={today}
          aria-invalid={future || undefined}
          aria-describedby={future ? "entry-error" : undefined}
          value={fields.date}
          onChange={(e) => e.target.value && setFields((f) => ({ ...f, date: e.target.value }))}
          className="min-h-11 w-fit rounded-full border border-border bg-bg px-4 text-text"
        />
      </div>
      {/* A quiet invitation, never inserted: only while the entry is empty. */}
      {showPrompt && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted" data-testid="entry-prompt">
          <span id="entry-prompt-text" data-testid="entry-prompt-text">
            {promptText(promptFor(promptDate!, promptStep), language)}
          </span>
          <button type="button" data-testid="entry-prompt-another" onClick={() => setPromptStep((n) => n + 1)} className="min-h-11 font-medium text-accent underline underline-offset-4">
            {t("promptAnother")}
          </button>
        </p>
      )}
      <label className="sr-only" htmlFor="entry-text">
        {t("entryTextLabel")}
      </label>
      <textarea
        id="entry-text"
        data-testid="entry-text"
        value={fields.body}
        onChange={(e) => setFields((f) => ({ ...f, body: e.target.value }))}
        placeholder={t("entryPlaceholder")}
        // Too long: the message is tied to the text (a11y pass).
        aria-invalid={tooLong || undefined}
        aria-describedby={[tooLong && "entry-error", showPrompt && "entry-prompt-text"].filter(Boolean).join(" ") || undefined}
        className="min-h-[50dvh] w-full flex-1 resize-none rounded-3xl border border-border bg-surface p-6 text-lg leading-relaxed text-text placeholder:text-muted"
      />

      {/* A switch with its hint under it, as the app (decision 206). */}
      <Switch
        checked={fields.isMoment}
        onChange={(isMoment) => setFields((f) => ({ ...f, isMoment }))}
        label={t("entryMoment")}
        hint={t("entryMomentHint")}
        hintId="entry-moment-hint"
        testId="entry-moment"
        className="flex max-w-md flex-col gap-1"
      />

      {errorText && (
        <p id="entry-error" role="alert" data-testid="entry-error" className="font-medium text-accent">
          {errorText}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          data-testid="entry-save"
          disabled={blank || tooLong || future || pending || deleting}
          className={PRIMARY_SAVE}
        >
          {t("entrySave")}
        </button>
        <button type="button" data-testid="entry-cancel" onClick={() => (keep ? setDialog("leave") : leave())} className={dialogButton()}>
          {t("cancel")}
        </button>
        {initial && (
          <button
            type="button"
            data-testid="entry-delete"
            onClick={() => setDialog("delete")}
            className="ml-auto font-medium text-accent underline underline-offset-4"
          >
            {t("entryDelete")}
          </button>
        )}
      </div>

      {dialog === "leave" && (
        <Dialog title={t("entryLeaveTitle")} onCancel={closeDialog} testId="entry-leave-dialog" initialFocus="last">
          <button
            type="button"
            data-testid="entry-discard"
            className={dialogButton()}
            onClick={() => {
              finished.current = true;
              removeDraft(draftKey);
              setFields(saved);
              leaveOn();
            }}
          >
            {t("entryLeaveDiscard")}
          </button>
          <button
            type="button"
            data-testid="entry-keep-draft"
            className={dialogButton()}
            onClick={() => {
              writeDraft(draftKey, current.current);
              leaveOn();
            }}
          >
            {t("entryLeaveKeep")}
          </button>
          {/* The safe choice, the filled default, and where focus starts
              (initialFocus last; decisions 143, 206): back to the text. */}
          <button type="button" data-testid="entry-keep-editing" className={dialogButton(true)} onClick={closeDialog}>
            {t("entryKeepEditing")}
          </button>
        </Dialog>
      )}

      {dialog === "delete" && (
        <Dialog title={t("entryDeleteTitle")} body={t("entryDeleteBody")} onCancel={closeDialog} testId="entry-delete-dialog">
          <button type="button" data-testid="entry-delete-cancel" className={dialogButton()} onClick={closeDialog}>
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="entry-delete-confirm"
            className={dialogButton(true)}
            onClick={() => {
              finished.current = true;
              removeDraft(draftKey);
              setDialog(null);
              const form = new FormData();
              form.set("id", id);
              form.set("from", backTo);
              startTransition(() => deleteAction(form));
            }}
          >
            {t("entryDelete")}
          </button>
        </Dialog>
      )}

      {conflict && (
        <Dialog title={t("entryConflictTitle")} body={t("entryConflictBody")} onCancel={closeDialog} testId="entry-conflict-dialog">
          <button type="button" data-testid="entry-conflict-cancel" className={dialogButton()} onClick={closeDialog}>
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="entry-conflict-use-other"
            className={dialogButton()}
            onClick={() => {
              setDialog(null);
              removeDraft(draftKey);
              setBase(conflict.updated_at);
              lastSaved.current = conflict;
              setSaved(fromEntry(conflict));
              setFields(fromEntry(conflict));
            }}
          >
            {t("entryConflictUseOther")}
          </button>
          <button
            type="button"
            data-testid="entry-conflict-keep-mine"
            className={dialogButton(true)}
            onClick={() => {
              // Save mine over the other version: the lock moves to the
              // version just seen, so a third change meanwhile asks again.
              setDialog(null);
              setBase(conflict.updated_at);
              send(conflict.updated_at);
            }}
          >
            {t("entryConflictKeepMine")}
          </button>
        </Dialog>
      )}

      {conflict === null && (
        // Deleted on another device: there's no other version to pick.
        <Dialog title={t("entryDeletedTitle")} body={t("entryDeletedBody")} onCancel={closeDialog} testId="entry-deleted-dialog" initialFocus="last">
          <button
            type="button"
            data-testid="entry-deleted-discard"
            className={dialogButton()}
            onClick={() => {
              finished.current = true;
              setDialog(null);
              removeDraft(draftKey);
              // There's no entry left to view: back where it was opened from.
              router.push(backTo);
            }}
          >
            {t("entryDeletedDiscard")}
          </button>
          <button
            type="button"
            data-testid="entry-deleted-keep"
            className={dialogButton(true)}
            onClick={() => {
              // Re-created with the same id: no version to lock against.
              setDialog(null);
              setBase(null);
              send(null);
            }}
          >
            {t("entryDeletedKeep")}
          </button>
        </Dialog>
      )}
      {safety === "open" && <SafetyCard country={country} onClose={closeSafety} />}
    </form>
  );
}
