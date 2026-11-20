import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findArticle, helpArticles, renderArticle } from "./helpContent";
import { isPendingMet, renderLegal } from "./legalContent";

// legal/app-plus (UX, 20 Nov): the app can sell Moodbow Plus (Google Play, 1.4.0) before the web's own `plus`. Every line
// about Plus itself shows with either, so nobody buys in the app without the Plus Terms on moodbow.com. The web's purchase
// bits (Manage Plus via Stripe, the failed-payment retry) show only with the web's `plus`, the Christmas offer only with
// offer_live. Three states, each page rendered as Production would render it: today, the app's Plus only, and the web's too.
// Since group 5 (app 1.4.0 on Google Play, 20 Nov), today IS the app's Plus only: app_plus met, the web's plus not yet.
const WEB = new Set(["plus", "offer_live"]);
const today = (id: string) => isPendingMet(id);
const appOnly = (id: string) => id === "app_plus" || (!WEB.has(id) && isPendingMet(id));
const web = (id: string) => id === "plus" || isPendingMet(id);
const text = (html: string) => html.replace(/<[^>]+>/g, "").split("&#39;").join("'").split("&quot;").join('"').split("&amp;").join("&");
const legal = (locale: string, slug: string, met: (id: string) => boolean) => text(renderLegal(readFileSync(`content/legal/${locale}/${slug}.md`, "utf8"), met, null).html);

// Help's web-only bullet in Moodbow Plus, per language: how it starts, and the Manage Plus it names (only there).
const HELP_WEB = { en: "Bought on the web", es: "Comprado en la web", fr: "Acheté sur le web", de: "Im Web gekauft", it: "Acquistato sul web", "pt-br": "Comprado na web", th: "ซื้อบนเว็บ" };
// What the 1.4.0 app doesn't have (the Reviewer, #400, checked against moodbow-app 4eb6a58f): the extra daily reminder
// times (reminders.md) and Plus's breathing patterns and extra reminders (Moodbow Plus's "On the web, Plus also adds").
const REMINDERS_WEB = { en: "With Moodbow Plus, you c", es: "Con Moodbow Plus, puedes", fr: "Avec Moodbow Plus, vous", de: "Mit Moodbow Plus kannst", it: "Con Moodbow Plus puoi", "pt-br": "Com o Moodbow Plus, voc", th: "ด้วย Moodbow Plus" };
const ALSO_ON_WEB = { en: " On the web, Plus also adds", es: " En la web, Plus también añade", fr: " Sur le web, Plus ajoute aussi", de: " Im Web gibt Plus außerdem", it: " Sul web, Plus aggiunge anche", "pt-br": " Na web, o Plus também acrescenta", th: " บนเว็บ Plus ยังเพิ่ม" };
const MANAGE_PLUS = { en: "Manage Plus", es: "Gestionar Plus", fr: "Gérer Plus", de: "Plus verwalten", it: "Gestisci Plus", "pt-br": "Gerenciar o Plus", th: "จัดการ Plus" };

describe("Plus in the app before the web's (app_plus alone)", () => {
  it("today: the app's Plus is met (group 5), the web's isn't yet", () => {
    expect(isPendingMet("app_plus")).toBe(true);
    expect(isPendingMet("plus")).toBe(false);
  });

  it("the Terms: the Plus section and the stores' parts, without Manage Plus via Stripe, the failed-payment retry or the offer", () => {
    const CASES = {
      en: { section: "Moodbow Plus is an optional yearly subscription", store: "Bought in the app:", webOnly: ["Bought on moodbow.com:", "A payment that fails."], offer: "The Christmas offer." },
      es: { section: "Moodbow Plus es una suscripción anual opcional", store: "Comprada en la app:", webOnly: ["Comprada en moodbow.com:", "Un pago que falla."], offer: "La oferta de Navidad." },
    };
    for (const [locale, c] of Object.entries(CASES)) {
      const now = legal(locale, "terms", today), app = legal(locale, "terms", appOnly), all = legal(locale, "terms", web);
      expect(now, `${locale} today = the app's Plus only`).toBe(app);
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
      const now = legal(locale, "privacy", today), app = legal(locale, "privacy", appOnly), all = legal(locale, "privacy", web);
      expect(now, `${locale} today = the app's Plus only`).toBe(app);
      for (const line of lines) {
        expect(app, `${locale} app: ${line}`).toContain(line);
        expect(all, `${locale} web: ${line}`).toContain(line);
      }
    }
  });

  it("Help's Moodbow Plus in every language: all of it with app_plus, except the web's Manage Plus bullet", () => {
    for (const [locale, manage] of Object.entries(MANAGE_PLUS)) {
      const article = findArticle(locale, "moodbow-plus");
      expect(article, locale).not.toBeNull();
      const app = text(renderArticle(article!, appOnly)), all = text(renderArticle(article!, web));
      expect(text(renderArticle(article!, today)), `${locale} today = the app's Plus only`).toBe(app);
      expect(app, `${locale} app`).toContain("Google Play");
      expect(app, `${locale} app`).not.toContain(manage);
      expect(all, `${locale} web`).toContain(manage);
    }
  });

  it("with app_plus alone, Help promises nothing the app lacks: no extra reminder times, no Plus breathing", () => {
    const reminders = findArticle("en", "reminders")!, plus = findArticle("en", "moodbow-plus")!;
    expect(text(renderArticle(reminders, appOnly))).not.toContain("Add another time");
    expect(text(renderArticle(reminders, web))).toContain("Add another time");
    expect(text(renderArticle(plus, appOnly))).not.toContain("ways to breathe");
    expect(text(renderArticle(plus, appOnly))).toContain("a designed PDF of your journal and a prompt library to write from.");
    expect(text(renderArticle(plus, web))).toContain("On the web, Plus also adds more ways to breathe in Things that help me, and more reminders.");
    // And in every language, every web-only block of every Help article stays out of the app's render.
    for (const locale of Object.keys(HELP_WEB)) {
      for (const article of helpArticles(locale)) {
        for (const m of article.source.matchAll(/\{pending:plus\}((?:(?!\{pending:)[\s\S])*?)\{\/pending\}/g)) {
          const snippet = m[1].split("**").join("").replace(/^- /, "").trim().slice(0, 24);
          if (snippet.length < 3) continue;
          expect(text(renderArticle(article, appOnly)), `${locale}/${article.slug}: "${snippet}" with app_plus alone`).not.toContain(snippet);
          expect(text(renderArticle(article, web)), `${locale}/${article.slug}: "${snippet}" with the web's plus`).toContain(snippet);
        }
      }
    }
  });

  it("every Plus line in the Terms, the privacy policy and Help shows with app_plus too, except the known web-only parts", () => {
    const WEB_ONLY = [
      "- Bought on moodbow.com: Me → Moodbow Plus → Manage Plus",
      "**A payment that fails.**",
      "- Comprada en moodbow.com: Yo → Moodbow Plus → Gestionar Plus",
      "**Un pago que falla.**",
      // Privacy's "reminder time{s}" (en "time|s", es "hora|s"): several reminder times are the web's only.
      "s{/pending}",
      ...Object.values(HELP_WEB).map((b) => `- ${b}`),
      ...Object.values(REMINDERS_WEB),
      ...Object.values(ALSO_ON_WEB),
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
    // The Terms' two parts and privacy's reminder times in en and es; in 7 languages, Help's Manage Plus bullet, the extra
    // reminder times and Moodbow Plus's "also on the web".
    expect(webOnly).toBe(2 * 3 + 7 * 3);
  });
});
