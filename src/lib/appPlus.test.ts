import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findArticle, renderArticle } from "./helpContent";
import { isPendingMet, renderLegal } from "./legalContent";

// legal/app-plus (UX, 20 Nov): the app can sell Moodbow Plus (Google Play, 1.4.0) before the web's own `plus`. Every line
// about Plus itself shows with either, so nobody buys in the app without the Plus Terms on moodbow.com. The web's purchase
// bits (Manage Plus via Stripe, the failed-payment retry) show only with the web's `plus`, the Christmas offer only with
// offer_live. Three states, each page rendered as Production would render it: today, the app's Plus only, and the web's too.
const WEB = new Set(["plus", "offer_live"]);
const today = (id: string) => isPendingMet(id);
const appOnly = (id: string) => id === "app_plus" || (!WEB.has(id) && isPendingMet(id));
const web = (id: string) => id === "plus" || isPendingMet(id);
const text = (html: string) => html.replace(/<[^>]+>/g, "");
const legal = (locale: string, slug: string, met: (id: string) => boolean) => text(renderLegal(readFileSync(`content/legal/${locale}/${slug}.md`, "utf8"), met, null).html);

// Help's web-only bullet in Moodbow Plus, per language: how it starts, and the Manage Plus it names (only there).
const HELP_WEB = { en: "Bought on the web", es: "Comprado en la web", fr: "Acheté sur le web", de: "Im Web gekauft", it: "Acquistato sul web", "pt-br": "Comprado na web", th: "ซื้อบนเว็บ" };
const MANAGE_PLUS = { en: "Manage Plus", es: "Gestionar Plus", fr: "Gérer Plus", de: "Plus verwalten", it: "Gestisci Plus", "pt-br": "Gerenciar o Plus", th: "จัดการ Plus" };

describe("Plus in the app before the web's (app_plus alone)", () => {
  it("neither is met today", () => {
    expect(isPendingMet("app_plus")).toBe(false);
    expect(isPendingMet("plus")).toBe(false);
  });

  it("the Terms: the Plus section and the stores' parts, without Manage Plus via Stripe, the failed-payment retry or the offer", () => {
    const CASES = {
      en: { section: "Moodbow Plus is an optional yearly subscription", store: "Bought in the app:", webOnly: ["Bought on moodbow.com:", "A payment that fails."], offer: "The Christmas offer." },
      es: { section: "Moodbow Plus es una suscripción anual opcional", store: "Comprada en la app:", webOnly: ["Comprada en moodbow.com:", "Un pago que falla."], offer: "La oferta de Navidad." },
    };
    for (const [locale, c] of Object.entries(CASES)) {
      const none = legal(locale, "terms", today), app = legal(locale, "terms", appOnly), all = legal(locale, "terms", web);
      expect(none, `${locale} today`).not.toContain(c.section);
      expect(app, `${locale} app`).toContain(c.section);
      expect(app, `${locale} app`).toContain(c.store);
      for (const w of [...c.webOnly, c.offer]) expect(app, `${locale} app: ${w}`).not.toContain(w);
      for (const w of [c.section, c.store, ...c.webOnly]) expect(all, `${locale} web: ${w}`).toContain(w);
      expect(all, `${locale} web: the offer is its own flip`).not.toContain(c.offer);
    }
  });

  it("the privacy policy: What changed, the purchases, Stripe's row, the Google Play services line and the payment records", () => {
    const CASES = {
      en: ["What changed:", "Moodbow Plus purchases:", "Payments and receipts for Moodbow Plus", "Google Play services runs under", "Payment records kept by Stripe"],
      es: ["Qué ha cambiado:", "Compras de Moodbow Plus:", "Pagos y recibos de Moodbow Plus", "Los servicios de Google Play se rigen", "Los registros de pago que guardan Stripe"],
    };
    for (const [locale, lines] of Object.entries(CASES)) {
      const none = legal(locale, "privacy", today), app = legal(locale, "privacy", appOnly), all = legal(locale, "privacy", web);
      for (const line of lines) {
        expect(none, `${locale} today: ${line}`).not.toContain(line);
        expect(app, `${locale} app: ${line}`).toContain(line);
        expect(all, `${locale} web: ${line}`).toContain(line);
      }
    }
  });

  it("Help's Moodbow Plus in every language: all of it with app_plus, except the web's Manage Plus bullet", () => {
    for (const [locale, manage] of Object.entries(MANAGE_PLUS)) {
      const article = findArticle(locale, "moodbow-plus");
      expect(article, locale).not.toBeNull();
      expect(renderArticle(article!, today), `${locale} today`).toBe("");
      const app = text(renderArticle(article!, appOnly)), all = text(renderArticle(article!, web));
      expect(app, `${locale} app`).toContain("Google Play");
      expect(app, `${locale} app`).not.toContain(manage);
      expect(all, `${locale} web`).toContain(manage);
    }
  });

  it("every Plus line in the Terms, the privacy policy and Help shows with app_plus too, except the known web-only parts", () => {
    const WEB_ONLY = [
      "- Bought on moodbow.com: Me → Moodbow Plus → Manage Plus",
      "**A payment that fails.**",
      "- Comprada en moodbow.com: Yo → Moodbow Plus → Gestionar Plus",
      "**Un pago que falla.**",
      ...Object.values(HELP_WEB).map((b) => `- ${b}`),
    ];
    let webOnly = 0;
    for (const kind of ["legal", "help"]) {
      for (const locale of readdirSync(`content/${kind}`)) {
        for (const file of readdirSync(`content/${kind}/${locale}`).filter((f) => f.endsWith(".md"))) {
          const source = readFileSync(`content/${kind}/${locale}/${file}`, "utf8");
          for (const m of source.matchAll(/\{pending:([a-z_|]+)\}/g)) {
            const ids = m[1].split("|");
            if (!ids.includes("plus") || ids.includes("app_plus")) continue;
            const after = source.slice(m.index + m[0].length, m.index + m[0].length + 80);
            expect(WEB_ONLY.some((w) => after.startsWith(w)), `${kind}/${locale}/${file}: web plus only, "${after.slice(0, 50)}…"`).toBe(true);
            webOnly++;
          }
        }
      }
    }
    // The Terms' two parts in en and es, and Help's bullet in 7 languages.
    expect(webOnly).toBe(11);
  });
});
