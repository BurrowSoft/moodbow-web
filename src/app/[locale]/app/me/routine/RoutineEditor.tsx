"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, dialogButton } from "@/components/Dialog";
import { SafetyCard } from "@/components/SafetyCard";
import { Switch } from "@/components/Switch";
import { ROUTINE_RULES, routineNameLength, routineNameProblem, type RoutineItemRow } from "@/lib/journal/routine";
import { flagsCrisis } from "@/lib/safety/crisis";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { addRoutineItem, moveRoutineItem, removeRoutineItem, renameRoutineItem, setRoutineInAppointment, type RoutineError, type RoutineResult } from "./actions";

const FIELD = "min-h-11 w-full min-w-0 rounded-2xl border border-border bg-surface px-[12px] text-text placeholder:text-muted";
const SMALL = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4 disabled:opacity-50";

// At most 40 as the server counts (code points, so an emoji is one): the field stops there, as the
// app's maxLength does, and a counter says how many (no error text: UX, 19 Nov).
const capped = (value: string) => [...value].slice(0, ROUTINE_RULES.maxChars).join("");
// "12/40", as the app's counter: numbers only, the same in every language.
const counter = (value: string) => [routineNameLength(value), ROUTINE_RULES.maxChars].join("/");

function More() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function NameField({ value, onChange, label, placeholder, testId, countId }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; testId: string; countId: string }) {
  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus={!placeholder}
        value={value}
        onChange={(e) => onChange(capped(e.target.value))}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={countId}
        autoComplete="off"
        data-testid={testId}
        className={FIELD}
      />
      <p id={countId} data-testid={`${testId}-count`} className="self-end text-xs text-muted">
        {counter(value)}
      </p>
    </div>
  );
}

// Me → Routine (1.4 F, board 29, the app's strings): the person's up to 3 items, in their order,
// in one card. Each row's ⋯ opens its actions in place (Edit, Move up, Move down, Remove); Remove
// asks first, since the days ticked go with it. Where For my appointment is on, each item has its
// own switch. Every change goes to the server and the list it sends back is what shows. A name
// that matches the crisis list offers help and never blocks (as tags, Q3); nothing is stored
// about it.
export function RoutineEditor({ initial, appointment, country = null }: { initial: RoutineItemRow[]; appointment: boolean; country?: string | null }) {
  const t = useTranslations("routine");
  const tb = useTranslations("toolbox");
  const tt = useTranslations("today");
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<RoutineItemRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<RoutineError | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const full = items.length >= ROUTINE_RULES.maxItems;

  const apply = async (call: Promise<RoutineResult>) => {
    setBusy(true);
    setFailed(null);
    const result = await call.catch((): RoutineResult => ({ status: "error", error: "failed" }));
    setBusy(false);
    if (result.status === "ok") {
      setItems(result.items);
      return true;
    }
    setFailed(result.error);
    return false;
  };
  const offerHelp = (name: string) => {
    if (flagsCrisis(name, CRISIS_KEYWORDS)) setHelpOpen(true);
  };

  const add = async () => {
    if (busy) return;
    const problem = routineNameProblem(draft, items.map((i) => i.name), true);
    if (problem === "empty") return;
    if (problem) return setFailed(problem);
    offerHelp(draft);
    if (await apply(addRoutineItem(draft))) setDraft("");
  };
  const save = async () => {
    if (!editing || busy) return;
    const problem = routineNameProblem(editing.name, items.filter((i) => i.id !== editing.id).map((i) => i.name), false);
    if (problem === "empty") return;
    if (problem) return setFailed(problem);
    offerHelp(editing.name);
    if (await apply(renameRoutineItem(editing.id, editing.name))) {
      setEditing(null);
      setOpen(null);
    }
  };
  const remove = async () => {
    if (!removing || busy) return;
    const item = removing;
    setRemoving(null);
    if (await apply(removeRoutineItem(item.id))) setOpen(null);
  };
  const move = (item: RoutineItemRow, step: -1 | 1) => !busy && void apply(moveRoutineItem(item.id, step));

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ol data-testid="routine-list" className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {items.map((item, i) => (
            <li key={item.id} data-testid="routine-item" className="p-[12px]">
              {editing?.id === item.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <NameField value={editing.name} onChange={(name) => setEditing({ id: item.id, name })} label={tb("edit")} testId="routine-edit-name" countId={`routine-edit-count-${item.id}`} />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" data-testid="routine-save" disabled={busy || editing.name.trim() === ""} className={dialogButton(true)}>
                      {tb("save")}
                    </button>
                    <button type="button" data-testid="routine-cancel" onClick={() => setEditing(null)} className={dialogButton()}>
                      {tb("cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p id={`routine-item-${item.id}`} data-testid="routine-name" className="min-w-0 text-text [overflow-wrap:anywhere]">
                      {item.name}
                    </p>
                    <button
                      type="button"
                      data-testid="routine-more"
                      aria-label={t("options", { item: item.name })}
                      aria-expanded={open === item.id}
                      aria-controls={open === item.id ? `routine-actions-${item.id}` : undefined}
                      onClick={() => setOpen(open === item.id ? null : item.id)}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted"
                    >
                      <More />
                    </button>
                  </div>
                  {open === item.id && (
                    <div id={`routine-actions-${item.id}`} data-testid="routine-actions" className="flex flex-wrap gap-x-2">
                      <button type="button" data-testid="routine-edit" aria-describedby={`routine-item-${item.id}`} onClick={() => setEditing({ id: item.id, name: item.name })} className={SMALL}>
                        {tb("edit")}
                      </button>
                      {i > 0 && (
                        <button type="button" data-testid="routine-up" aria-describedby={`routine-item-${item.id}`} disabled={busy} onClick={() => move(item, -1)} className={SMALL}>
                          {tb("moveUp")}
                        </button>
                      )}
                      {i < items.length - 1 && (
                        <button type="button" data-testid="routine-down" aria-describedby={`routine-item-${item.id}`} disabled={busy} onClick={() => move(item, 1)} className={SMALL}>
                          {tb("moveDown")}
                        </button>
                      )}
                      <button type="button" data-testid="routine-remove" aria-describedby={`routine-item-${item.id}`} disabled={busy} onClick={() => setRemoving(item)} className={SMALL}>
                        {t("deleteConfirm")}
                      </button>
                    </div>
                  )}
                  {appointment && (
                    <Switch
                      checked={item.in_appointment}
                      onChange={(on) => void apply(setRoutineInAppointment(item.id, on))}
                      label={t("inAppointment")}
                      hint={item.name}
                      hintId={`routine-item-${item.id}`}
                      busy={busy}
                      testId="routine-in-appointment"
                      className="mt-1 text-sm"
                    />
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <p data-testid="routine-full" className="text-sm text-muted">
          {t("full")}
        </p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <NameField
            value={draft}
            onChange={(v) => {
              setDraft(v);
              if (failed === "duplicate") setFailed(null);
            }}
            label={t("addHint")}
            placeholder={t("addHint")}
            testId="routine-new"
            countId="routine-new-count"
          />
          <div>
            <button type="submit" data-testid="routine-add" disabled={busy || draft.trim() === ""} className={dialogButton(true)}>
              {t("add")}
            </button>
          </div>
        </form>
      )}
      {failed === "duplicate" && (
        <p role="alert" data-testid="routine-duplicate" className="text-sm text-text">
          {t("duplicate")}
        </p>
      )}
      {failed === "full" && !full && (
        <p role="alert" data-testid="routine-full-error" className="text-sm text-text">
          {t("full")}
        </p>
      )}
      {(failed === "failed" || failed === "consent" || failed === "tooLong") && (
        <p role="alert" data-testid="routine-failed" className="text-sm text-text">
          {tt("errGeneric")}
        </p>
      )}

      {removing && (
        <Dialog title={t("deleteTitle", { name: removing.name })} body={t("deleteBody")} onCancel={() => setRemoving(null)} testId="routine-remove-dialog" initialFocus="first">
          <button type="button" data-testid="routine-remove-cancel" className={dialogButton()} onClick={() => setRemoving(null)}>
            {tb("cancel")}
          </button>
          <button type="button" data-testid="routine-remove-confirm" className={dialogButton(true)} onClick={() => void remove()}>
            {t("deleteConfirm")}
          </button>
        </Dialog>
      )}
      {helpOpen && <SafetyCard country={country} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
