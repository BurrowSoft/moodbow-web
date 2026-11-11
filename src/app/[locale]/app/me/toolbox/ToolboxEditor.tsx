"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { TOOLBOX_RULES, toolboxLength, toolboxProblem, type ToolboxItem } from "@/lib/journal/toolbox";
import { addToolboxItem, deleteToolboxItem, moveToolboxItem, updateToolboxItem, type ToolboxResult } from "./actions";
import { Breathing } from "./Breathing";

const FIELD = "min-h-11 w-full min-w-0 rounded-2xl border border-border bg-surface px-[12px] text-text placeholder:text-muted";
const SMALL = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4 disabled:opacity-50";

// Me → Things that help me (1.2): the person's own list, in their order. Every change
// goes to the server and the list it sends back is what shows, so two tabs can't drift
// far. Delete says "Deleted." with Undo, which puts it back where it was.
// Up or down, as an icon: its name is the button's (Move up, Move down).
function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M19 12l-7 7-7-7"} />
    </svg>
  );
}

// The list couldn't be read: nothing to change, but a minute to breathe needs no data (UX).
export function ToolboxBreatheOnly() {
  const t = useTranslations("toolbox");
  const [breathing, setBreathing] = useState(false);
  return (
    <>
      <button type="button" data-testid="toolbox-breathe" onClick={() => setBreathing(true)} className={dialogButton()}>
        {t("breathe")}
      </button>
      {breathing && <Breathing onClose={() => setBreathing(false)} />}
    </>
  );
}

export function ToolboxEditor({ initial }: { initial: ToolboxItem[] }) {
  const t = useTranslations("toolbox");
  const tt = useTranslations("today");
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"full" | "tooLong" | "failed" | null>(null);
  const [deleted, setDeleted] = useState<{ text: string; position: number } | null>(null);
  const [breathing, setBreathing] = useState(false);
  const addField = useRef<HTMLInputElement>(null);
  const full = items.length >= TOOLBOX_RULES.maxItems;

  const apply = async (call: Promise<ToolboxResult>) => {
    setBusy(true);
    setFailed(null);
    const result = await call.catch((): ToolboxResult => ({ status: "error", error: "failed" }));
    setBusy(false);
    if (result.status === "ok") {
      setItems(result.items);
      return true;
    }
    setFailed(result.error === "empty" ? "failed" : result.error);
    return false;
  };

  const add = async () => {
    const problem = toolboxProblem(draft, items.length, true);
    if (problem === "empty" || busy) return;
    if (problem) return setFailed(problem);
    if (await apply(addToolboxItem(draft))) {
      setDraft("");
      setDeleted(null);
    }
  };
  const save = async () => {
    if (!editing || busy) return;
    const problem = toolboxProblem(editing.text, items.length, false);
    if (problem === "empty") return;
    if (problem) return setFailed(problem);
    if (await apply(updateToolboxItem(editing.id, editing.text))) setEditing(null);
  };
  const remove = async (item: ToolboxItem) => {
    if (busy) return;
    if (await apply(deleteToolboxItem(item.id))) {
      setDeleted({ text: item.text, position: item.position });
      // The row and its buttons are gone: the field to add takes focus, not the page.
      addField.current?.focus();
    }
  };
  const undo = async () => {
    if (!deleted || busy) return;
    if (await apply(addToolboxItem(deleted.text, deleted.position))) setDeleted(null);
  };
  const move = (item: ToolboxItem, step: -1 | 1) => !busy && void apply(moveToolboxItem(item.id, step));

  const tooLong = (text: string) => toolboxLength(text) > TOOLBOX_RULES.maxChars;

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p data-testid="toolbox-empty" className="text-muted">
          {t("empty")}
        </p>
      )}
      {items.length > 0 && (
        <ol data-testid="toolbox-list" className="space-y-3">
          {items.map((item, i) => (
            <li key={item.id} data-testid="toolbox-item" className="rounded-2xl border border-border bg-surface p-[12px]">
              {editing?.id === item.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <input
                    autoFocus
                    value={editing.text}
                    onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                    aria-label={t("edit")}
                    aria-invalid={tooLong(editing.text) || undefined}
                    data-testid="toolbox-edit-text"
                    className={FIELD}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" data-testid="toolbox-save" disabled={busy || editing.text.trim() === ""} className={dialogButton(true)}>
                      {t("save")}
                    </button>
                    <button type="button" data-testid="toolbox-cancel" onClick={() => setEditing(null)} className={dialogButton()}>
                      {t("cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p id={`toolbox-item-${item.id}`} className="text-text [overflow-wrap:break-word]">
                    {item.text}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-2">
                    <button type="button" data-testid="toolbox-edit" aria-describedby={`toolbox-item-${item.id}`} onClick={() => setEditing({ id: item.id, text: item.text })} className={SMALL}>
                      {t("edit")}
                    </button>
                    <button type="button" data-testid="toolbox-delete" aria-describedby={`toolbox-item-${item.id}`} disabled={busy} onClick={() => void remove(item)} className={SMALL}>
                      {t("delete")}
                    </button>
                    {i > 0 && (
                      <button type="button" data-testid="toolbox-up" aria-label={t("moveUp")} aria-describedby={`toolbox-item-${item.id}`} disabled={busy} onClick={() => move(item, -1)} className={SMALL}>
                        <Arrow up />
                      </button>
                    )}
                    {i < items.length - 1 && (
                      <button type="button" data-testid="toolbox-down" aria-label={t("moveDown")} aria-describedby={`toolbox-item-${item.id}`} disabled={busy} onClick={() => move(item, 1)} className={SMALL}>
                        <Arrow up={false} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {deleted && (
        <p role="status" data-testid="toolbox-deleted" className="flex flex-wrap items-center gap-2 text-text">
          {t("deleted")}
          <button type="button" data-testid="toolbox-undo" disabled={busy} onClick={() => void undo()} className={SMALL}>
            {t("undo")}
          </button>
        </p>
      )}

      {full ? (
        <p data-testid="toolbox-full" className="text-sm text-muted">
          {t("limitCount")}
        </p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            ref={addField}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (failed === "tooLong") setFailed(null);
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            aria-invalid={tooLong(draft) || undefined}
            aria-describedby={tooLong(draft) ? "toolbox-too-long" : undefined}
            data-testid="toolbox-new"
            className={FIELD}
          />
          <div>
            <button type="submit" data-testid="toolbox-add" disabled={busy || draft.trim() === "" || tooLong(draft)} className={dialogButton(true)}>
              {t("add")}
            </button>
          </div>
        </form>
      )}
      {(tooLong(draft) || (editing && tooLong(editing.text)) || failed === "tooLong") && (
        <p id="toolbox-too-long" role="alert" data-testid="toolbox-too-long" className="text-sm text-text">
          {t("limitLength")}
        </p>
      )}
      {failed === "full" && !full && (
        <p role="alert" data-testid="toolbox-full-error" className="text-sm text-text">
          {t("limitCount")}
        </p>
      )}
      {failed === "failed" && (
        <p role="alert" data-testid="toolbox-failed" className="text-sm text-text">
          {tt("errGeneric")}
        </p>
      )}

      <button type="button" data-testid="toolbox-breathe" onClick={() => setBreathing(true)} className={dialogButton()}>
        {t("breathe")}
      </button>
      {breathing && <Breathing onClose={() => setBreathing(false)} />}
    </div>
  );
}
