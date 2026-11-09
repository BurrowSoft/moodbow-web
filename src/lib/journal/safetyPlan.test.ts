import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import contract from "../../../content/safety-plan.json";
import yourWeek from "../../../content/your-week.json";
import { canCall, EMPTY_PLAN, parsePlan, personProblem, planHasContent, planTextTooLong, SAFETY_PLAN_RULES } from "./safetyPlan";

const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
const messages = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as Record<string, Record<string, string>>;

describe("safety plan rules (content/safety-plan.json)", () => {
  it("are the contract's, as UX set them", () => {
    expect(SAFETY_PLAN_RULES).toEqual({ maxTextChars: 2000, maxPeoplePerSection: 10, maxNameChars: 100, maxPhoneChars: 40, callMinDigits: 3 });
    expect(contract.sections.map((s) => s.id)).toEqual(["warning_signs", "toolbox", "distractions", "people", "professionals", "surroundings"]);
  });

  it("a name is needed; a phone is any text, never refused for its format", () => {
    expect(personProblem("  ", "")).toBe("noName");
    expect(personProblem("Sam", "")).toBeNull();
    expect(personProblem("Sam", "ask for Jo, ext 12 (evenings)")).toBeNull();
    expect(personProblem("a".repeat(101), "")).toBe("nameTooLong");
    expect(personProblem("Sam", "1".repeat(41))).toBe("phoneTooLong");
    expect(planTextTooLong("a".repeat(2000))).toBe(false);
    expect(planTextTooLong("a".repeat(2001))).toBe(true);
  });

  it("Call only with at least 3 digits", () => {
    expect([null, "", "Jo", "12", "1 2 3", "+64 21 555 0100", "*4141"].map(canCall)).toEqual([false, false, false, false, true, true, true]);
  });

  it("content: a text that isn't blank, a person, or a thing that helps; otherwise none", () => {
    expect(planHasContent(EMPTY_PLAN, 0)).toBe(false);
    expect(planHasContent({ ...EMPTY_PLAN, warning_signs: "   " }, 0)).toBe(false);
    expect(planHasContent({ ...EMPTY_PLAN, surroundings: "Keep it out of the house" }, 0)).toBe(true);
    expect(planHasContent({ ...EMPTY_PLAN, people: [{ id: "a", section: "people", name: "Sam", phone: null, position: 0 }] }, 0)).toBe(true);
    expect(planHasContent(EMPTY_PLAN, 1)).toBe(true);
  });

  it("people before professionals, each in its order, as the export (026)", () => {
    const plan = parsePlan({ warning_signs: "x" }, [
      { id: "d", section: "professionals", name: "Dr Lee", phone: "09", position: 0 },
      { id: "b", section: "people", name: "Alex", phone: " ", position: 1 },
      { id: "a", section: "people", name: "Sam", phone: "021", position: 0 },
      { id: "z", section: "elsewhere", name: "?", phone: null, position: 0 },
    ]);
    expect(plan.people.map((p) => p.id)).toEqual(["a", "b", "d"]);
    expect(plan.people[1].phone).toBeNull();
    expect(plan.distractions).toBe("");
  });
});

// specs/1.2-features.md, "Safety plan headings, all languages" (UX, 2026-11-09): the web's
// headings are these words exactly, so they match the app's export.
const HEADINGS: Record<(typeof LANGUAGES)[number], [string, string, string, string, string, string]> = {
  en: ["My safety plan", "Warning signs", "People and places that take my mind off things", "People I can ask for help", "Professionals and services", "Making my surroundings safer"],
  fr: ["Mon plan de sécurité", "Signes d'alerte", "Personnes et lieux qui me changent les idées", "Personnes à qui je peux demander de l'aide", "Professionnels et services", "Rendre mon environnement plus sûr"],
  es: ["Mi plan de seguridad", "Señales de alerta", "Personas y lugares que me distraen", "Personas a las que puedo pedir ayuda", "Profesionales y servicios", "Hacer mi entorno más seguro"],
  "pt-br": ["Meu plano de segurança", "Sinais de alerta", "Pessoas e lugares que me distraem", "Pessoas a quem posso pedir ajuda", "Profissionais e serviços", "Deixar meu ambiente mais seguro"],
  de: ["Mein Sicherheitsplan", "Warnzeichen", "Menschen und Orte, die mich ablenken", "Menschen, die ich um Hilfe bitten kann", "Fachleute und Hilfsangebote", "Meine Umgebung sicherer machen"],
  it: ["Il mio piano di sicurezza", "Segnali di allarme", "Persone e luoghi che mi distraggono", "Persone a cui posso chiedere aiuto", "Professionisti e servizi", "Rendere più sicuro il mio ambiente"],
  th: ["แผนความปลอดภัยของฉัน", "สัญญาณเตือน", "ผู้คนและสถานที่ที่ช่วยให้ฉันคิดเรื่องอื่น", "คนที่ฉันขอความช่วยเหลือได้", "ผู้เชี่ยวชาญและบริการ", "ทำให้สิ่งรอบตัวปลอดภัยขึ้น"],
};

// Words that name a means: never on screen in the plan (the Reviewer's read, section 6).
const MEANS: Record<(typeof LANGUAGES)[number], string[]> = {
  en: ["pill", "medication", "weapon", "gun", "knife", "rope", "height", "bridge", "poison"],
  fr: ["médicament", "pilule", "arme", "couteau", "corde", "hauteur", "pont", "poison"],
  es: ["pastilla", "medicamento", "arma", "cuchillo", "cuerda", "altura", "puente", "veneno"],
  "pt-br": ["comprimido", "remédio", "arma", "faca", "corda", "altura", "ponte", "veneno"],
  de: ["tablette", "medikament", "waffe", "messer", "seil", "höhe", "brücke", "gift"],
  it: ["pillola", "farmac", "arma", "coltello", "corda", "altezza", "ponte", "veleno"],
  // Not "ยา" alone: Thai has no spaces, and it's inside "ยาก" (hard).
  th: ["ยาเม็ด", "อาวุธ", "ปืน", "มีด", "เชือก", "สะพาน"],
};

describe("safety plan words, in every language", () => {
  it("the headings are the table's, exactly; section 2 is the toolbox's own name", () => {
    for (const l of LANGUAGES) {
      const p = messages(l).safetyPlan;
      expect([p.title, p.warningSigns, p.distractions, p.people, p.professionals, p.surroundings], l).toEqual(HEADINGS[l]);
      expect(messages(l).safety.safetyPlanButton, `${l} card button`).toBe(HEADINGS[l][0]);
    }
  });

  it("every language has en's keys, none empty; each clinician draft is a real key", () => {
    const en = messages("en").safetyPlan;
    for (const l of LANGUAGES) {
      const p = messages(l).safetyPlan;
      expect(Object.keys(p).sort(), l).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(p)) expect(v.trim(), `${l} ${k}`).not.toBe("");
    }
    for (const key of contract.clinicianDraft) {
      const [ns, k] = key.includes(".") ? key.split(".") : ["safetyPlan", key];
      expect(messages("en")[ns]?.[k], key).toBeTruthy();
    }
  });

  it("no word names a means, and no diagnosis word, anywhere in the plan", () => {
    for (const l of LANGUAGES) {
      const words = [...MEANS[l], ...(yourWeek.diagnosisWords as Record<string, string[]>)[l]];
      for (const [k, v] of Object.entries(messages(l).safetyPlan)) {
        const text = v.toLocaleLowerCase(l);
        for (const w of words) expect(text.includes(w), `${l} ${k}: "${w}"`).toBe(false);
      }
    }
  });
});
