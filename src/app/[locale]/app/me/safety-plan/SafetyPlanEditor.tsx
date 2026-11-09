"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Dialog, dialogButton } from "@/components/Dialog";
import { HelpNumberText } from "@/components/HelpNumberText";
import { canCall, personProblem, SAFETY_PLAN_RULES, type PlanPeopleSection, type PlanPerson, type PlanText, type SafetyPlan } from "@/lib/journal/safetyPlan";
import { helplinesFor, telHref } from "@/lib/safety/helplines";
import type { ToolboxItem } from "@/lib/journal/toolbox";
import { ToolboxEditor } from "../toolbox/ToolboxEditor";
import { addSafetyPlanPerson, deleteSafetyPlanPerson, saveSafetyPlanText, updateSafetyPlanPerson, type PlanResult } from "./actions";

const FIELD = "w-full min-w-0 rounded-2xl border border-border bg-surface px-[12px] text-text placeholder:text-muted";
const SMALL = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-[12px] font-medium text-accent underline underline-offset-4 disabled:opacity-50";
const SECTION = "rounded-3xl border border-border bg-surface p-[24px] max-sm:px-[max(12px,calc(40px-1rem))]";
const HEADING = "text-lg font-medium text-text max-sm:[font-size:min(1.125rem,max(11.25vw,36px))]";

type Apply = (call: Promise<PlanResult>) => Promise<boolean>;

// My safety plan (1.2; content/safety-plan.json): six parts, every one optional, in the
// standard order. The texts save with their own Save; people save as they're added or
// changed. Leaving with an unsaved text asks first. Section 2 is the toolbox list itself;
// section 5 shows the country's helpline, read live and never stored.
export function SafetyPlanEditor({ initial, toolbox, country }: { initial: SafetyPlan; toolbox: ToolboxItem[]; country: string | null | undefined }) {
  const t = useTranslations("safetyPlan");
  const tb = useTranslations("toolbox");
  const tt = useTranslations("today");
  const [plan, setPlan] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState<Set<PlanText>>(() => new Set());
  const [leaving, setLeaving] = useState<string | null>(null);
  const router = useRouter();

  const apply: Apply = useCallback(async (call) => {
    setFailed(false);
    const result = await call.catch((): PlanResult => ({ status: "error", error: "failed" }));
    if (result.status === "ok") {
      setPlan(result.plan);
      return true;
    }
    setFailed(true);
    return false;
  }, []);
  const markDirty = useCallback((id: PlanText, is: boolean) => {
    setDirty((now) => {
      if (now.has(id) === is) return now;
      const next = new Set(now);
      if (is) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Unsaved text: the browser asks on a reload or close; a link in the page asks here.
  useEffect(() => {
    if (dirty.size === 0) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  return (
    <div className="space-y-6">
      <p data-testid="plan-intro" className="text-text">
        {t("intro")}
      </p>
      <TextSection id="warning_signs" heading={t("warningSigns")} prompt={t("warningSignsPrompt")} saved={plan.warning_signs} apply={apply} onDirty={markDirty} />
      <section aria-labelledby="plan-toolbox" className={SECTION}>
        <h2 id="plan-toolbox" className={HEADING}>
          {tb("meRow")}
        </h2>
        <div className="mt-4">
          <ToolboxEditor initial={toolbox} />
        </div>
      </section>
      <TextSection id="distractions" heading={t("distractions")} saved={plan.distractions} apply={apply} onDirty={markDirty} />
      <PeopleSection section="people" heading={t("people")} people={plan.people.filter((p) => p.section === "people")} apply={apply} />
      <PeopleSection section="professionals" heading={t("professionals")} prompt={t("professionalsPrompt")} people={plan.people.filter((p) => p.section === "professionals")} apply={apply}>
        <Helpline country={country} />
      </PeopleSection>
      <TextSection id="surroundings" heading={t("surroundings")} prompt={t("surroundingsPrompt")} saved={plan.surroundings} apply={apply} onDirty={markDirty} />
      {failed && (
        <p role="alert" data-testid="plan-failed" className="text-text">
          {tt("errGeneric")}
        </p>
      )}
      {leaving && (
        <Dialog title={t("leaveTitle")} onCancel={() => setLeaving(null)} testId="plan-leave">
          <button type="button" data-testid="plan-keep-editing" onClick={() => setLeaving(null)} className={dialogButton(true)}>
            {t("keepEditing")}
          </button>
          <button
            type="button"
            data-testid="plan-leave-anyway"
            onClick={() => {
              const to = leaving;
              setDirty(new Set());
              setLeaving(null);
              router.push(to);
            }}
            className={dialogButton()}
          >
            {t("leave")}
          </button>
        </Dialog>
      )}
    </div>
  );
}

// One text part (1, 3 or 6) with its own Save, and "Saved." after it.
function TextSection({ id, heading, prompt, saved, apply, onDirty }: { id: PlanText; heading: string; prompt?: string; saved: string; apply: Apply; onDirty: (id: PlanText, dirty: boolean) => void }) {
  const t = useTranslations("safetyPlan");
  const tb = useTranslations("toolbox");
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const changed = text !== saved;
  useEffect(() => onDirty(id, changed), [id, changed, onDirty]);
  const fieldId = `plan-${id}`;
  return (
    <section aria-labelledby={`${fieldId}-title`} data-testid={fieldId} className={SECTION}>
      <h2 id={`${fieldId}-title`} className={HEADING}>
        <label htmlFor={fieldId}>{heading}</label>
      </h2>
      {prompt && (
        <p id={`${fieldId}-prompt`} className="mt-1 text-sm text-muted">
          {prompt}
        </p>
      )}
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !changed) return;
          setBusy(true);
          setDone(false);
          const ok = await apply(saveSafetyPlanText(id, text));
          setBusy(false);
          setDone(ok);
        }}
      >
        <textarea
          id={fieldId}
          value={text}
          maxLength={SAFETY_PLAN_RULES.maxTextChars}
          aria-describedby={prompt ? `${fieldId}-prompt` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setDone(false);
          }}
          rows={4}
          data-testid={`${fieldId}-text`}
          className={`${FIELD} py-[12px]`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" data-testid={`${fieldId}-save`} disabled={busy || !changed} className={dialogButton(true)}>
            {tb("save")}
          </button>
          <p role="status" data-testid={`${fieldId}-saved`} className="text-sm text-muted">
            {done ? t("saved") : ""}
          </p>
        </div>
      </form>
    </section>
  );
}

// People (4) or professionals (5): a name, an optional number, and Call only with a number.
function PeopleSection({ section, heading, prompt, people, apply, children }: { section: PlanPeopleSection; heading: string; prompt?: string; people: PlanPerson[]; apply: Apply; children?: React.ReactNode }) {
  const t = useTranslations("safetyPlan");
  const tb = useTranslations("toolbox");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ name: string; phone: string; position: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const full = people.length >= SAFETY_PLAN_RULES.maxPeoplePerSection;
  const run = async (call: Promise<PlanResult>) => {
    setBusy(true);
    const ok = await apply(call);
    setBusy(false);
    return ok;
  };
  return (
    <section aria-labelledby={`plan-${section}-title`} data-testid={`plan-${section}`} className={SECTION}>
      <h2 id={`plan-${section}-title`} className={HEADING}>
        {heading}
      </h2>
      {prompt && <p className="mt-1 text-sm text-muted">{prompt}</p>}
      {children}
      {people.length > 0 && (
        <ul className="mt-3 space-y-3">
          {people.map((person) =>
            editing === person.id ? (
              <li key={person.id} className="rounded-2xl border border-border p-[12px]">
                <PersonForm
                  initial={person}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (name, phone) => {
                    if (await run(updateSafetyPlanPerson(person.id, name, phone))) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={person.id} data-testid={`plan-${section}-person`} className="rounded-2xl border border-border p-[12px]">
                <p id={`plan-person-${person.id}`} className="font-medium text-text [overflow-wrap:break-word]">
                  {person.name}
                </p>
                {person.phone && <p className="text-text [overflow-wrap:anywhere]">{person.phone}</p>}
                <div className="mt-2 flex flex-wrap gap-x-2">
                  {canCall(person.phone) && (
                    <a href={telHref(person.phone!)} data-testid="plan-call" aria-describedby={`plan-person-${person.id}`} className={SMALL}>
                      {t("call")}
                    </a>
                  )}
                  <button type="button" data-testid="plan-edit" aria-describedby={`plan-person-${person.id}`} onClick={() => setEditing(person.id)} className={SMALL}>
                    {tb("edit")}
                  </button>
                  <button
                    type="button"
                    data-testid="plan-delete"
                    aria-describedby={`plan-person-${person.id}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await run(deleteSafetyPlanPerson(person.id))) {
                        setDeleted({ name: person.name, phone: person.phone ?? "", position: person.position });
                        addButton.current?.focus();
                      }
                    }}
                    className={SMALL}
                  >
                    {tb("delete")}
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {deleted && (
        <p role="status" data-testid={`plan-${section}-deleted`} className="mt-3 flex flex-wrap items-center gap-2 text-text">
          {tb("deleted")}
          <button
            type="button"
            data-testid="plan-undo"
            disabled={busy}
            onClick={async () => {
              if (await run(addSafetyPlanPerson(section, deleted.name, deleted.phone, deleted.position))) setDeleted(null);
            }}
            className={SMALL}
          >
            {tb("undo")}
          </button>
        </p>
      )}
      {adding ? (
        <div className="mt-3 rounded-2xl border border-border p-[12px]">
          <PersonForm
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={async (name, phone) => {
              if (await run(addSafetyPlanPerson(section, name, phone))) {
                setAdding(false);
                setDeleted(null);
              }
            }}
          />
        </div>
      ) : (
        !full && (
          <button ref={addButton} type="button" data-testid={`plan-${section}-add`} onClick={() => setAdding(true)} className={`mt-3 ${dialogButton()}`}>
            {t("addPerson")}
          </button>
        )
      )}
    </section>
  );
}

function PersonForm({ initial, busy, onSave, onCancel }: { initial?: PlanPerson; busy: boolean; onSave: (name: string, phone: string) => void; onCancel: () => void }) {
  const t = useTranslations("safetyPlan");
  const tb = useTranslations("toolbox");
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const nameId = `plan-name-${useId()}`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && personProblem(name, phone) === null) onSave(name, phone);
      }}
    >
      <label htmlFor={nameId} className="text-sm font-medium text-text">
        {t("name")}
      </label>
      <input id={nameId} value={name} maxLength={SAFETY_PLAN_RULES.maxNameChars} onChange={(e) => setName(e.target.value)} data-testid="plan-name" autoComplete="off" className={`${FIELD} min-h-11`} />
      <label htmlFor={`${nameId}-phone`} className="text-sm font-medium text-text">
        {t("phone")}
      </label>
      {/* Any format: a person in crisis shouldn't fight a validator (the Reviewer's read). */}
      <input id={`${nameId}-phone`} type="tel" value={phone} maxLength={SAFETY_PLAN_RULES.maxPhoneChars} onChange={(e) => setPhone(e.target.value)} data-testid="plan-phone" autoComplete="off" className={`${FIELD} min-h-11`} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" data-testid="plan-person-save" disabled={busy || name.trim() === ""} className={dialogButton(true)}>
          {tb("save")}
        </button>
        <button type="button" data-testid="plan-person-cancel" onClick={onCancel} className={dialogButton()}>
          {tb("cancel")}
        </button>
      </div>
    </form>
  );
}

// The country's helpline, read live (never stored, never removable), with the help card's
// rule: Me's country; where it isn't listed, the emergency number alone.
function Helpline({ country }: { country: string | null | undefined }) {
  const t = useTranslations("safetyPlan");
  const ts = useTranslations("safety");
  const lines = helplinesFor(country, useLocale());
  const link = "font-medium text-accent underline underline-offset-4";
  if (!lines.helpline && !lines.emergency) return null;
  return (
    <div data-testid="plan-helpline" className="mt-3 rounded-2xl bg-pill p-[12px]">
      <p className="text-sm font-medium text-text">{t("helpline")}</p>
      {lines.helpline ? (
        <a href={telHref(lines.helpline.dial)} data-testid="plan-helpline-call" className={link}>
          <HelpNumberText text={ts("safetyCall", { name: lines.helpline.name, number: lines.helpline.display })} number={lines.helpline.display} />
        </a>
      ) : (
        <a href={telHref(lines.emergency!.dial)} data-testid="plan-emergency-call" className={link}>
          <HelpNumberText text={ts("safetyCallEmergency", { number: lines.emergency!.display })} number={lines.emergency!.display} />
        </a>
      )}
    </div>
  );
}
