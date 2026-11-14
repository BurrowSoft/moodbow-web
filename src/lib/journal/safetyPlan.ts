import contract from "../../../content/safety-plan.json";

// My safety plan (1.2; content/safety-plan.json, the rules both clients run).
export const SAFETY_PLAN_RULES = contract.rules;

export type PlanText = "warning_signs" | "distractions" | "surroundings";
export type PlanPeopleSection = "people" | "professionals";
export const PLAN_TEXTS: PlanText[] = ["warning_signs", "distractions", "surroundings"];

export type PlanPerson = { id: string; section: PlanPeopleSection; name: string; phone: string | null; position: number };
export type SafetyPlan = Record<PlanText, string> & { people: PlanPerson[] };

export const EMPTY_PLAN: SafetyPlan = { warning_signs: "", distractions: "", surroundings: "", people: [] };

// As the server counts it (char_length): code points.
const length = (text: string) => [...text].length;

export const planTextTooLong = (text: string) => length(text) > SAFETY_PLAN_RULES.maxTextChars;

export type PersonProblem = "noName" | "nameTooLong" | "phoneTooLong";
export function personProblem(name: string, phone: string): PersonProblem | null {
  if (name.trim() === "") return "noName";
  if (length(name) > SAFETY_PLAN_RULES.maxNameChars) return "nameTooLong";
  if (length(phone.trim()) > SAFETY_PLAN_RULES.maxPhoneChars) return "phoneTooLong";
  return null;
}

// Call only with a number to call: at least callMinDigits digits. The dialer gets digits,
// a leading +, and * or # (the help card's telHref); anything else typed is left out.
export const canCall = (phone: string | null | undefined) => (phone?.replace(/\D/g, "").length ?? 0) >= SAFETY_PLAN_RULES.callMinDigits;

// Content: a text that isn't blank, a person, or a thing that helps (section 2 is the toolbox).
export const planHasContent = (plan: SafetyPlan, toolboxItems: number) =>
  PLAN_TEXTS.some((k) => plan[k].trim() !== "") || plan.people.length > 0 || toolboxItems > 0;

export function parsePlan(row: unknown, people: unknown): SafetyPlan {
  const r = (row ?? {}) as Partial<Record<PlanText, unknown>>;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    warning_signs: text(r.warning_signs),
    distractions: text(r.distractions),
    surroundings: text(r.surroundings),
    people: (Array.isArray(people) ? people : [])
      .filter((p): p is PlanPerson => typeof p?.id === "string" && (p?.section === "people" || p?.section === "professionals") && typeof p?.name === "string" && Number.isInteger(p?.position))
      .map(({ id, section, name, phone, position }) => ({ id, section, name, phone: typeof phone === "string" && phone.trim() !== "" ? phone : null, position }))
      .sort((a, b) => (a.section === b.section ? a.position - b.position : a.section === "people" ? -1 : 1)),
  };
}
