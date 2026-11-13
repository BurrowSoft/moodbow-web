"use client";

import { startTransition, useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { promptFor, promptText } from "@/lib/journal/prompts";
import { Dialog, dialogButton } from "@/components/Dialog";
import { SafetyCard } from "@/components/SafetyCard";
import { Switch } from "@/components/Switch";
import { useRouter } from "@/i18n/navigation";
import { useAnnounce, useFocusTitleAfterLeaving } from "../Announcer";
import { withQuestion } from "@/lib/journal/answer";
import { readServerBox, withTyped } from "@/lib/journal/typedBeforeLoad";
import { MAX_ENTRY_CHARS, sameEntry, type Entry } from "@/lib/journal/entry";
import { localKey } from "@/lib/localData";
import { flagsCrisis } from "@/lib/safety/crisis";
import { holdLeaving } from "@/lib/ui/leaveGuard";
import { goodThingsBody, goodThingsLines, NO_GOOD_THINGS, type GoodThingsLines } from "@/lib/journal/goodThings";
import { JOURNAL_HEADING } from "@/lib/ui/journalLayout";
import { useUntilLoaded } from "@/lib/ui/untilLoaded";
import { Link } from "@/i18n/navigation";
import { onSignOut } from "@/lib/signOutSignal";
import { SAVE_WAIT_MS, TimedOut, withTimeout } from "@/lib/ui/withTimeout";
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
// After a save: only the draft that save sent is done with. By the time the
// answer comes, the editor may have been left and opened again, and newer
// typing kept under the same key must stay (the app's #101, note 2).
function removeSentDraft(key: string, sent: Draft) {
  const d = readDraft(key);
  if (d && (d.id !== sent.id || !same(d, sent))) return;
  removeDraft(key);
}

const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// A delete's redirect back where the entry was opened from: it's gone (the
// app says "Entry deleted"). Not one to sign in (the session ended, nothing
// was deleted). The digest is "NEXT_REDIRECT;<type>;<url>;<status>;".
export function deletedRedirect(e: unknown): boolean {
  if (!isRedirect(e)) return false;
  const url = (e as { digest: string }).digest.split(";")[2] ?? "";
  return !new URL(url, "https://moodbow.invalid").pathname.endsWith("/sign-in");
}

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
// Stops growing at about 200 % on a narrow screen (decision 231), like PRIMARY_SAVE.
const CAPPED = "max-sm:[font-size:min(1rem,max(10vw,32px))]";
// Save in the top row (narrow screens only): the primary button, sized for
// a bar. Its padding is in px, as at 300 % rem padding split French's "Enregistrer" (Web Tester).
const TOP_SAVE =
  `ml-auto inline-flex min-h-[44px] max-w-full items-center justify-center rounded-full bg-accent px-[24px] text-center font-medium [overflow-wrap:anywhere] text-on-accent hover:bg-accent-hover disabled:opacity-50 aria-disabled:opacity-50 sm:hidden ${CAPPED}`;

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
  // The screen's Back link: the editor's top row holds it, with Save beside
  // it on a narrow screen.
  back?: React.ReactNode;
  // Three good things (1.3): three short fields write the text (the heading, then the filled
  // lines as a list); everything else is this editor's, the save, its wait, the safety card and
  // the leave dialog included (Ruling 3). No date or moment to set: today, ordinary.
  goodThings?: boolean;
  // A new entry on Write: where Three good things is, when it's on (Ruling 9).
  goodThingsHref?: string | null;
};

const noSubscribe = () => () => {};

// The draft lives in this browser only, so the server renders the editor
// without it; once in the browser the editor mounts again and starts from
// the draft, if there is one.
export function EntryEditor(props: Props) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return <Editor key={inBrowser ? "browser" : "server"} {...props} restore={inBrowser} />;
}

function Editor({ initial, newId, uid, today, startDate, country, backTo = "/app", start, onLeave, restore, promptDate, back, goodThings = false, goodThingsHref }: Props & { restore: boolean }) {
  const t = useTranslations("entry");
  const language = useLocale();
  // "Another" steps through the list from the day's prompt.
  const [promptStep, setPromptStep] = useState(0);
  const tt = useTranslations("today");
  const router = useRouter();
  const announce = useAnnounce();
  const focusTitleAfterLeaving = useFocusTitleAfterLeaving();
  // Three good things keeps its own new draft, apart from Write's.
  const draftKey = localKey("draft-entry", uid, initial ? initial.id : goodThings ? "new-good-things" : "new");

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
  // Whatever was typed in the server's box before the page's code ran: it's
  // still in the document during this first render, and it comes along.
  const [arrival] = useState(() => {
    const f = draft ? { body: draft.body, date: draft.date, isMoment: draft.isMoment } : saved;
    const fresh = start?.question ? { ...f, body: withQuestion(f.body, start.question) } : f;
    const box = restore ? readServerBox() : null;
    const { body, start: from, end } = withTyped(fresh.body, box, !!draft);
    return { fields: { ...fresh, body, date: box?.date ?? fresh.date }, focused: !!box?.focused, from, end };
  });
  const [fields, setFields] = useState<Fields>(arrival.fields);
  // Three good things: the three lines behind the text. Shown from the text whenever something
  // else set it (a kept draft, a conflict's other version), else as typed (a blank first line
  // with a second one filled stays where it was put).
  const goodHeading = t("goodThingsTitle");
  const [typedLines, setTypedLines] = useState<GoodThingsLines>(() => (goodThings ? goodThingsLines(goodHeading, arrival.fields.body) : [...NO_GOOD_THINGS]));
  const goodLines = goodThingsBody(goodHeading, typedLines) === fields.body ? typedLines : goodThingsLines(goodHeading, fields.body);
  const setGoodLine = (i: number, value: string) => {
    const next = goodLines.map((l, j) => (j === i ? value : l)) as GoodThingsLines;
    setTypedLines(next);
    setFields((f) => ({ ...f, body: goodThingsBody(goodHeading, next) }));
  };
  // Its fields take typing once the page's code runs (a remount would drop what came before).
  const untilLoaded = useUntilLoaded();
  // Before anything can paint or a key can land: a letter on the bare page
  // would be a keyboard shortcut (Web Tester, #100).
  useLayoutEffect(() => {
    if (!arrival.focused) return;
    const el = document.getElementById("entry-text") as HTMLTextAreaElement | null;
    el?.focus();
    el?.setSelectionRange(arrival.from, arrival.end);
  }, [arrival]);
  const [dialog, setDialog] = useState<null | "leave" | "delete" | { conflict: Entry | null }>(null);
  // The safety card after a save, or a failed save, the keyword check flagged
  // (M8, decision 124): we stay on the entry, and closing the card puts focus
  // back in it. The check runs here only; nothing about it is sent or kept
  // (decision 125).
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
  // Signed out in another tab: nothing more is written for this user here.
  const signedOut = useRef(false);

  // A deliberate sign-out elsewhere in this browser (UX & PM 2026-11-03,
  // option C): "Keep it" (or nothing to ask about) keeps what's here once,
  // "Delete it" drops it; either way this editor stops writing, so it can't
  // put back what the sign-out wiped. finished covers the unmount, unload
  // and hide writes; signedOut the autosave and Save's own copy.
  useEffect(() => {
    if (!restore) return;
    return onSignOut(({ uid: who, mode }) => {
      if (who !== uid || signedOut.current) return;
      if (mode === "keep" && keepRef.current && !finished.current) writeDraft(draftKey, current.current);
      signedOut.current = true;
      finished.current = true;
      if (mode === "delete") removeDraft(draftKey);
    });
  }, [draftKey, restore, uid]);

  // A save's answer can come after the editor was left: it then neither
  // leaves (again, from wherever the person is now) nor touches this one.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
          // The answer to that save never came, so neither did its card.
          if (flagsCrisis(result.entry.body, CRISIS_KEYWORDS)) setSafety("open");
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
    const timer = window.setTimeout(() => {
      if (!signedOut.current) writeDraft(draftKey, current.current);
    }, AUTOSAVE_MS);
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

  // A phone browser sent to the background (another app, the home screen)
  // may never unload the page: the system can close the tab later without
  // beforeunload (iOS Safari never sends it). Hidden is the last sure
  // moment, so the text the 2 s autosave hasn't written yet is kept then
  // (the app's #101: its last seconds of typing).
  useEffect(() => {
    if (!restore) return;
    const flush = () => {
      if (keepRef.current && !finished.current) writeDraft(draftKey, current.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
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
    if (!restore || startAt === undefined || arrival.focused) return;
    const el = document.getElementById("entry-text") as HTMLTextAreaElement | null;
    if (!el) return;
    const at = startAt === "end" ? el.value.length : Math.min(startAt, el.value.length);
    el.focus();
    el.setSelectionRange(at, at);
  }, [restore, startAt, arrival]);

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
  // Set when the card comes on the way out of a deleted entry: leaving first
  // would take the card away with the editor.
  const leaveAfterCard = useRef(false);
  const closeSafety = useCallback(() => {
    setSafety("closed");
    if (leaveAfterCard.current) return router.push(backTo);
    // After the card's own focus restore (on its unmount): back into the entry.
    window.setTimeout(() => (document.getElementById("entry-text") ?? document.getElementById("good-things-1"))?.focus(), 0);
  }, [router, backTo]);

  // The card comes once per Save press, whichever answers first: the 30 s
  // wait, the failure itself, or a save that lands after the wait. Each press
  // has its own form. Pressing Save again and failing again shows it again.
  const carded = useRef(new WeakSet<FormData>());
  const openCard = (form: FormData) => {
    if (carded.current.has(form)) return;
    carded.current.add(form);
    setSafety("open");
  };
  // A save that fails, offline included: the text was still written, and the
  // card needs no network (its numbers and words are bundled).
  const failedSave = (form: FormData) => {
    if (flagsCrisis(String(form.get("body") ?? ""), CRISIS_KEYWORDS)) openCard(form);
  };

  // A save that lands after the wait (Web Tester, #190 R6): its error would
  // say it failed, so it goes, and this is the version edits start from. The
  // editor stays: the person may have moved on to something else by now, and a
  // screen reader hears "Saved" (UX). Only the latest press counts; a newer one
  // has its own answer coming.
  const [landedLate, setLandedLate] = useState(false);
  const latestForm = useRef<FormData | null>(null);
  const hearLateAnswer = (call: Promise<EntryState>, form: FormData) => {
    call
      .then((late) => {
        if (late.status !== "saved") return;
        const sent: Draft = { id: String(form.get("id") ?? ""), body: String(form.get("body") ?? ""), date: String(form.get("entry_date") ?? ""), isMoment: form.get("is_moment") === "true", base: null };
        removeSentDraft(draftKey, sent);
        if (!mounted.current || latestForm.current !== form) return;
        lastSaved.current = late.entry;
        setBase(late.entry.updated_at);
        setSaved(fromEntry(late.entry));
        setLandedLate(true);
        announce?.(tt("checkinSaved"));
        if (same(current.current, sent)) removeDraft(draftKey);
        else if (!signedOut.current && !finished.current) writeDraft(draftKey, { ...current.current, base: late.entry.updated_at });
      })
      .catch(() => {
        // no answer after all: the error stands, and the draft is still here
      });
  };

  const [state, action, pending] = useActionState<EntryState, FormData>(async (prev, form) => {
    let next: EntryState;
    const call = saveEntry(prev, form);
    try {
      // No answer in 30 s: the same as a failed request (the draft is kept;
      // Save again; the timeout audit).
      next = await withTimeout(call, SAVE_WAIT_MS);
      // "Changed elsewhere", but the server's version is exactly this one:
      // our own save that landed after the browser stopped waiting. Saved;
      // no conflict dialog (UX, after the timeout audit).
      if (next.status === "error" && next.error === "stale" && next.latest && sameEntry(next.latest, { body: String(form.get("body") ?? ""), date: String(form.get("entry_date") ?? ""), isMoment: form.get("is_moment") === "true" })) {
        next = { status: "saved", entry: next.latest };
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      // offline or the request failed: the draft is still here
      failedSave(form);
      if (e instanceof TimedOut) hearLateAnswer(call, form);
      return { status: "error", error: "generic" };
    }
    if (next.status === "saved") {
      const sent: Draft = { id: String(form.get("id") ?? ""), body: String(form.get("body") ?? ""), date: String(form.get("entry_date") ?? ""), isMoment: form.get("is_moment") === "true", base: null };
      removeSentDraft(draftKey, sent);
      if (!mounted.current) return next;
      // Typed while the save was out (UX, #143 F1): stay with the newer text,
      // now on top of the version just saved, so the next Save is a plain
      // update (not "changed elsewhere"); it stays a draft, nothing leaves.
      if (!same(current.current, sent)) {
        const newer = { ...current.current, base: next.entry.updated_at };
        // Not once signed out in another tab: a save answered after that
        // mustn't write the text back (Reviewer #147, merge note).
        if (!signedOut.current) writeDraft(draftKey, newer);
        lastSaved.current = next.entry;
        setBase(next.entry.updated_at);
        setSaved(fromEntry(next.entry));
        if (flagsCrisis(next.entry.body, CRISIS_KEYWORDS)) openCard(form);
        return next;
      }
      // Still here and showing what was sent: that's saved, so no draft is
      // left, even one autosaved while the text was briefly different
      // ("AB" typed, then back to "A"; Reviewer, #143).
      removeDraft(draftKey);
      finished.current = true;
      lastSaved.current = next.entry;
      setSaved(fromEntry(next.entry));
      setFields(fromEntry(next.entry));
      if (flagsCrisis(next.entry.body, CRISIS_KEYWORDS)) {
        // Staying on the saved entry: it's now the version edits start from,
        // and further edits are a draft again (reviewer #35).
        finished.current = false;
        setBase(next.entry.updated_at);
        openCard(form);
      } else leave();
    } else if (next.status === "error" && next.error === "stale") {
      setDialog({ conflict: next.latest });
    } else if (next.status === "error") {
      failedSave(form);
    }
    return next;
  }, { status: "idle" });

  const [deleteState, deleteAction, deleting] = useActionState<DeleteState, FormData>(async (prev, form) => {
    try {
      const next = await deleteEntry(prev, form);
      if (next.status === "error") finished.current = false;
      return next;
    } catch (e) {
      if (deletedRedirect(e)) {
        announce?.(t("entryDeletedAnnounce"));
        focusTitleAfterLeaving?.();
      }
      if (isRedirect(e)) throw e;
      // offline or the request failed: nothing was deleted
      finished.current = false;
      return { status: "error" };
    }
  }, { status: "idle" });

  // The save's wait, kept outside the action (Web Tester, #122 T2b): while a
  // server action is held, Next keeps its router transition open, and the
  // action's own result (even withTimeout's) can't commit until that ends;
  // the error came at 71 s, not 30. This timer's update is urgent: past
  // SAVE_WAIT_MS of the latest send, the editor shows the generic error and
  // Save works again. Only meaningful while the save is still pending.
  const [waitedOut, setWaitedOut] = useState(false);
  const waitTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(waitTimer.current), []);
  // A save that settled needs no wait (stuck is pending-only anyway).
  useEffect(() => {
    if (!pending) window.clearTimeout(waitTimer.current);
  }, [pending]);
  const stuck = pending && waitedOut;
  // While a save is out, Save says so (aria-disabled) and ignores presses,
  // but isn't disabled: a disabled button drops focus to BODY, and after a
  // failed save focus stays on Save (Web Tester's keyboard-up row, UX).
  const busy = pending && !stuck;

  const send = (withBase: string | null) => {
    const form = new FormData();
    form.set("id", id);
    form.set("entry_date", fields.date);
    form.set("body", fields.body);
    form.set("is_moment", String(fields.isMoment));
    form.set("expected_updated_at", withBase ?? "");
    latestForm.current = form;
    setLandedLate(false);
    window.clearTimeout(waitTimer.current);
    setWaitedOut(false);
    waitTimer.current = window.setTimeout(() => {
      setWaitedOut(true);
      failedSave(form);
    }, SAVE_WAIT_MS);
    // Kept before the request: a redirect (session ended, consent) unmounts
    // the editor before any answer comes back.
    if (restore && !signedOut.current) writeDraft(draftKey, { ...fields, id, base: withBase });
    startTransition(() => action(form));
  };

  const tooLong = fields.body.length > MAX_ENTRY_CHARS;
  const future = fields.date > today;
  const blank = fields.body.trim() === "";
  const cantSave = blank || tooLong || future || deleting;
  const errorText = tooLong
    ? t("entryTooLong")
    : future
      ? tt("errDateInFuture")
      : stuck && !landedLate
        ? tt("errGeneric")
        : state.status === "error" && state.error !== "stale" && !landedLate
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
        if (!blank && !tooLong && !future && !busy) send(base);
      }}
    >
      {/* The page's heading (also its title), for heading navigation. */}
      {!goodThings && <h1 className="sr-only">{initial ? t("entryEditTitle") : t("entryNewTitle")}</h1>}
      {/* The top row, as the app: Back, and on a narrow screen Save, kept at
          the top while the text scrolls, so it's in reach with the keyboard
          up (Web Tester: the bottom Save sat below the fold at 360 × 380). */}
      {/* On a narrow screen the error is pinned with the row, right under
          it (the app), so text scrolled up can't hide it (Web Tester, #123
          N2). From sm the wrapper is display: contents, and the error goes
          just above Save at the bottom (sm:order-last, as the buttons). */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-bg pb-2 sm:contents">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3" data-testid="entry-top-row">
          {back}
          <button type="submit" data-testid="entry-save-top" disabled={cantSave} aria-disabled={busy || undefined} className={TOP_SAVE}>
            {t("entrySave")}
          </button>
        </div>
        {errorText && (
          <p id="entry-error" role="alert" data-testid="entry-error" className="font-medium text-accent sm:order-last">
            {errorText}
          </p>
        )}
      </div>
      {goodThings && (
        <h1 className={JOURNAL_HEADING} data-testid="good-things-title">
          {goodHeading}
        </h1>
      )}
      {/* The date first, then the text (the mockups, decision 161). */}
      <div className={goodThings ? "hidden" : "flex flex-col gap-1"}>
        <label htmlFor="entry-date" className="text-sm font-medium text-text">
          {t("entryDateLabel")}
        </label>
        <input
          id="entry-date"
          data-testid="entry-date"
          type="date"
          // As the text: a restored date would save the entry on the wrong day.
          autoComplete="off"
          max={today}
          aria-invalid={future || undefined}
          aria-describedby={future ? "entry-error" : undefined}
          value={fields.date}
          onChange={(e) => e.target.value && setFields((f) => ({ ...f, date: e.target.value }))}
          className="min-h-11 w-fit min-w-0 max-w-full rounded-full border border-border bg-bg px-4 text-text"
        />
      </div>
      {!initial && !goodThings && goodThingsHref && (
        <Link href={goodThingsHref} data-testid="write-good-things" className={`w-fit min-h-[44px] inline-flex items-center font-medium text-accent underline underline-offset-4 ${CAPPED}`}>
          {goodHeading}
        </Link>
      )}
      {/* A quiet invitation, never inserted: only while the entry is empty. */}
      {showPrompt && (
        <p className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted ${CAPPED}`} data-testid="entry-prompt">
          <span id="entry-prompt-text" data-testid="entry-prompt-text" className="min-w-0 [overflow-wrap:anywhere]">
            {promptText(promptFor(promptDate!, promptStep), language)}
          </span>
          <button type="button" data-testid="entry-prompt-another" onClick={() => setPromptStep((n) => n + 1)} className="min-h-11 font-medium text-accent underline underline-offset-4">
            {t("promptAnother")}
          </button>
        </p>
      )}
      {goodThings ? (
        <div {...untilLoaded} className="flex flex-col gap-4" data-testid="good-things-fields">
          {([1, 2, 3] as const).map((n) => (
            <div key={n} className="flex flex-col gap-1">
              <label htmlFor={`good-things-${n}`} className={`font-medium text-text ${CAPPED}`}>
                {t(`goodThings${n}`)}
              </label>
              <input
                id={`good-things-${n}`}
                data-testid={`good-things-${n}`}
                type="text"
                autoComplete="off"
                value={goodLines[n - 1]}
                onChange={(e) => setGoodLine(n - 1, e.target.value)}
                aria-invalid={tooLong || undefined}
                aria-describedby={tooLong ? "entry-error" : undefined}
                // 48 px in px and the text capped as the editor's other controls: at 300 % on a 320 px
                // phone the first field ended at 671 px, below the first view (#300's journey).
                className={`min-h-[48px] w-full min-w-0 rounded-2xl border border-border bg-surface px-[12px] text-text ${CAPPED}`}
              />
            </div>
          ))}
        </div>
      ) : (
      <>
      <label className="sr-only" htmlFor="entry-text">
        {t("entryTextLabel")}
      </label>
      <textarea
        id="entry-text"
        data-testid="entry-text"
        // A browser's restored text on reload must not count as typed
        // (lib/journal/typedBeforeLoad.ts): the draft is what's kept.
        autoComplete="off"
        value={fields.body}
        onChange={(e) => setFields((f) => ({ ...f, body: e.target.value }))}
        placeholder={t("entryPlaceholder")}
        // Too long: the message is tied to the text (a11y pass).
        aria-invalid={tooLong || undefined}
        aria-describedby={[tooLong && "entry-error", showPrompt && "entry-prompt-text"].filter(Boolean).join(" ") || undefined}
        className="min-h-[50dvh] w-full flex-1 resize-none rounded-3xl border border-border bg-surface p-[24px] text-lg leading-relaxed text-text placeholder:text-muted"
      />
      </>
      )}

      {/* A switch with its hint under it, as the app (decision 206). */}
      {!goodThings && (
      <Switch
        checked={fields.isMoment}
        onChange={(isMoment) => setFields((f) => ({ ...f, isMoment }))}
        label={t("entryMoment")}
        hint={t("entryMomentHint")}
        hintId="entry-moment-hint"
        testId="entry-moment"
        className="flex max-w-md flex-col gap-1"
      />
      )}

      <div className="flex flex-wrap items-center gap-3 sm:order-last">
        {/* Wider screens only: on a narrow one Save is in the top row. */}
        <span className="hidden sm:contents">
          <button type="submit" data-testid="entry-save" disabled={cantSave} aria-disabled={busy || undefined} className={`${PRIMARY_SAVE} aria-disabled:opacity-50`}>
            {t("entrySave")}
          </button>
        </span>
        <button type="button" data-testid="entry-cancel" onClick={() => (keep ? setDialog("leave") : leave())} className={`${dialogButton()} ${CAPPED}`}>
          {t("cancel")}
        </button>
        {initial && (
          <button
            type="button"
            data-testid="entry-delete"
            onClick={() => setDialog("delete")}
            className={`ml-auto font-medium text-accent underline underline-offset-4 ${CAPPED}`}
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
              // The dialog may have been open when a sign-out in another
              // tab arrived: nothing is kept for that user then (Reviewer).
              if (!signedOut.current) writeDraft(draftKey, current.current);
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
              // The text given up here was written all the same (the app, #171).
              if (flagsCrisis(fields.body, CRISIS_KEYWORDS)) setSafety("open");
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
              // The text given up here was written all the same (the app, #171):
              // the card first, and closing it leaves. The text goes now, so
              // the autosave can't put the draft back behind the card.
              if (flagsCrisis(fields.body, CRISIS_KEYWORDS)) {
                leaveAfterCard.current = true;
                setFields(saved);
                setSafety("open");
                return;
              }
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
