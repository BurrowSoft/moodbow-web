"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/BackLink";
import { Dialog, dialogButton } from "@/components/Dialog";
import { useRouter } from "@/i18n/navigation";
import { MOOD_COLOURS, MOOD_DOT_OUTLINE, type CheckIn } from "@/lib/journal/checkIn";
import type { Entry } from "@/lib/journal/entry";
import type { Origin } from "@/lib/journal/origin";
import type { Reflection } from "@/lib/journal/reflect";
import { dateLine } from "@/lib/journal/today";
import { checkInChips } from "../../checkInChips";
import { deleteEntry, saveEntry, type DeleteState } from "../actions";
import { EntryEditor, hasDraft, type EditorStart } from "../EntryEditor";
import { ReflectPanel } from "../ReflectPanel";

// The entry view (decision 151, the same layout as the app): a top bar with
// Back, the ★ moment toggle and ⋯ (Edit, Delete); the date; that day's
// check-in strip; the entry as plain, selectable text; the reflection (or
// Reflect) with "Write your answer"; and "Add to this entry…". A pointer
// click on the text opens the editor with the caret there, unless the click
// ended a text selection (copying). The text isn't a button: a button's
// contents are presentational, so screen readers would skip the entry (UX
// agreed); keyboards edit through ⋯ → Edit entry or "Add to this entry…".
// Save and Cancel come back here; Back goes where the entry was opened from.
type Props = {
  entry: Entry;
  checkIn: CheckIn | null;
  from: Origin;
  backLabel: string;
  dateLocaleTag: string;
  uid: string;
  today: string;
  country?: string | null;
  // null: no Reflect (AI off, not consented, or its reflection unreadable).
  reflect: { initial: Reflection | null; balance: number } | null;
};

type Mode = { kind: "view" } | { kind: "edit"; start: EditorStart };

const noSubscribe = () => () => {};
const isRedirect = (e: unknown) => typeof (e as { digest?: unknown })?.digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

// An unsaved draft of this entry lives in this browser only: then the
// editor opens straight away (once in the browser), so it isn't hidden.
export function EntryScreen(props: Props) {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const draft = inBrowser && hasDraft(props.uid, props.entry.id);
  return <Screen key={draft ? "draft" : "view"} {...props} startEditing={draft} />;
}

type CaretDocument = {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

// Where in the entry's text a click landed, as an index into the body (the
// text is rendered as-is, so the two match); the end when the browser can't say.
function caretOffset(el: HTMLElement, x: number, y: number): number | "end" {
  const doc = document as unknown as CaretDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  const range = position ? null : doc.caretRangeFromPoint?.(x, y);
  const node = position ? position.offsetNode : range?.startContainer;
  const offset = position ? position.offset : range?.startOffset;
  if (!node || offset === undefined || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return "end";
  let at = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) at += n.textContent?.length ?? 0;
  return at;
}

function Screen({ entry: initial, checkIn, from, backLabel, dateLocaleTag, uid, today, country, reflect, startEditing }: Props & { startEditing: boolean }) {
  const t = useTranslations("entry");
  const tt = useTranslations("today");
  const ta = useTranslations("app");
  const router = useRouter();
  const [entry, setEntry] = useState(initial);
  const [mode, setMode] = useState<Mode>(startEditing ? { kind: "edit", start: { at: "end" } } : { kind: "view" });
  // Each opening of the editor starts fresh (a new caret, a new question).
  const [opened, setOpened] = useState(0);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [momentFailed, setMomentFailed] = useState(false);
  const savingMoment = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);

  const edit = (start: EditorStart) => {
    setMenu(false);
    setOpened((n) => n + 1);
    setMode({ kind: "edit", start });
  };

  // Back from the editor: its newest saved version (the date may have
  // moved: refresh that day's check-in), and focus on the date heading.
  const onLeave = useCallback(
    (saved: Entry | null) => {
      if (saved) {
        setEntry(saved);
        router.refresh();
      }
      returning.current = true;
      setMode({ kind: "view" });
    },
    [router],
  );
  useEffect(() => {
    if (mode.kind === "view" && returning.current) {
      returning.current = false;
      heading.current?.focus();
    }
  }, [mode]);

  // ★: saved straight away; a failed save puts it back and offers Try
  // again (decision 111). Another device's newer version wins the view.
  const toggleMoment = async () => {
    if (savingMoment.current) return;
    savingMoment.current = true;
    setMomentFailed(false);
    const before = entry;
    setEntry({ ...before, is_moment: !before.is_moment });
    const form = new FormData();
    form.set("id", before.id);
    form.set("entry_date", before.entry_date);
    form.set("body", before.body);
    form.set("is_moment", String(!before.is_moment));
    form.set("expected_updated_at", before.updated_at);
    try {
      const result = await saveEntry({ status: "idle" }, form);
      if (result.status === "saved") setEntry(result.entry);
      else {
        setEntry(result.status === "error" && result.error === "stale" && result.latest ? result.latest : before);
        setMomentFailed(true);
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      setEntry(before);
      setMomentFailed(true);
    } finally {
      savingMoment.current = false;
    }
  };

  const [deleteState, deleteAction, deleting] = useActionState<DeleteState, FormData>(async (prev, form) => {
    try {
      return await deleteEntry(prev, form);
    } catch (e) {
      if (isRedirect(e)) throw e;
      // offline or the request failed: nothing was deleted
      return { status: "error" };
    }
  }, { status: "idle" });
  const closeDelete = useCallback(() => setConfirmDelete(false), []);

  const openAt = (e: React.MouseEvent<HTMLDivElement>) => {
    // The click ended a text selection: copying, not editing.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    edit({ at: caretOffset(e.currentTarget, e.clientX, e.clientY) });
  };

  const chips = checkIn ? checkInChips(checkIn, tt) : [];
  return (
    <>
      <div className="flex items-center gap-1">
        <BackLink href={from} label={backLabel} testId="nav-back" />
        {mode.kind === "view" && (
          <>
            <button
              type="button"
              data-testid="entry-moment-toggle"
              aria-pressed={entry.is_moment}
              aria-label={t("entryMoment")}
              onClick={() => void toggleMoment()}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-pill"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className={entry.is_moment ? "fill-accent" : "fill-none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
              </svg>
            </button>
            <div
              className="relative"
              onKeyDown={(e) => {
                if (e.key === "Escape" && menu) {
                  setMenu(false);
                  more.current?.focus();
                }
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMenu(false);
              }}
            >
              <button
                ref={more}
                type="button"
                data-testid="entry-more"
                aria-label={t("entryMoreActions")}
                aria-expanded={menu}
                aria-controls="entry-menu"
                onClick={() => setMenu((open) => !open)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-pill"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              <ul id="entry-menu" hidden={!menu} className="absolute right-0 top-12 z-10 min-w-44 rounded-2xl border border-border bg-surface p-1 shadow-lg">
                <li>
                  <button type="button" data-testid="entry-menu-edit" onClick={() => edit({ at: "end" })} className="flex min-h-11 w-full items-center rounded-xl px-4 text-left text-text hover:bg-pill">
                    {t("entryEditTitle")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    data-testid="entry-menu-delete"
                    onClick={() => {
                      setMenu(false);
                      setConfirmDelete(true);
                    }}
                    className="flex min-h-11 w-full items-center rounded-xl px-4 text-left text-text hover:bg-pill"
                  >
                    {t("entryDelete")}
                  </button>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
      {/* The editor has its own heading, Edit entry (a11y pass 5). */}
      {mode.kind === "edit" && <EntryEditor key={opened} initial={entry} newId={entry.id} uid={uid} today={today} country={country} backTo={from} start={mode.start} onLeave={onLeave} />}
      {/* Hidden, not unmounted, while editing: a reflection made on this
          visit is still here after (ReflectPanel keeps it). */}
      <article hidden={mode.kind === "edit"} className="mt-6 space-y-6" data-testid="entry-view">
      {momentFailed && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" data-testid="entry-moment-error" className="font-medium text-accent">
            {tt("errGeneric")}
          </p>
          <button type="button" data-testid="entry-moment-retry" onClick={() => void toggleMoment()} className="font-medium text-accent underline underline-offset-4">
            {ta("tryAgain")}
          </button>
        </div>
      )}
      {deleteState.status === "error" && !deleting && (
        <p role="alert" data-testid="entry-delete-error" className="font-medium text-accent">
          {tt("errGeneric")}
        </p>
      )}

      <h1 ref={heading} tabIndex={-1} data-testid="entry-date" className="text-3xl font-medium tracking-tight focus:outline-none">
        {dateLine(entry.entry_date, dateLocaleTag)}
      </h1>

      {checkIn && checkIn.local_date === entry.entry_date && (
        <div data-testid="entry-checkin" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-2 text-sm font-medium text-text">
            <span className={`h-5 w-5 rounded-full ${MOOD_COLOURS[checkIn.mood - 1]} ${MOOD_DOT_OUTLINE}`} aria-hidden="true" />
            {tt(`mood${checkIn.mood}` as "mood1")}
          </span>
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip} className="rounded-full bg-pill px-3 py-0.5 text-xs text-text">
                  {chip}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        data-testid="entry-body"
        onClick={openAt}
        className="-mx-3 cursor-text whitespace-pre-wrap rounded-2xl px-3 py-2 text-lg leading-relaxed text-text [overflow-wrap:anywhere] hover:bg-pill"
      >
        {entry.body}
      </div>

      {reflect && (
        <ReflectPanel entryId={entry.id} initial={reflect.initial} balance={reflect.balance} country={country} onAnswer={(question) => edit({ at: "end", question })} />
      )}

      <button
        type="button"
        data-testid="entry-add-more"
        onClick={() => edit({ at: "end" })}
        className="flex min-h-12 w-full items-center rounded-2xl border border-dashed border-border px-4 text-left text-muted hover:bg-pill"
      >
        {t("entryAddMore")}
      </button>

      {confirmDelete && (
        <Dialog title={t("entryDeleteTitle")} body={t("entryDeleteBody")} onCancel={closeDelete} testId="entry-delete-dialog">
          <button type="button" data-testid="entry-delete-cancel" className={dialogButton()} onClick={closeDelete}>
            {t("cancel")}
          </button>
          <button
            type="button"
            data-testid="entry-delete-confirm"
            className={dialogButton(true)}
            onClick={() => {
              setConfirmDelete(false);
              const form = new FormData();
              form.set("id", entry.id);
              form.set("from", from);
              startTransition(() => deleteAction(form));
            }}
          >
            {t("entryDelete")}
          </button>
        </Dialog>
      )}
      </article>
    </>
  );
}
