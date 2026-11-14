// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { canRenderText, cleanBody, exportedWhen, renderExportText, type Translate } from "./exportText";

// The shared contract: rendering export_fixture.json must give
// export_fixture.txt byte for byte, as on the app.
const dir = path.join(process.cwd(), "content", "contracts");
const t = createTranslator({ locale: "en", messages }) as unknown as Translate;

describe("readable export (content/contracts/export-text.md)", () => {
  it("export_fixture.json → export_fixture.txt, byte for byte", () => {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, "export_fixture.json"), "utf8"));
    const expected = fs.readFileSync(path.join(dir, "export_fixture.txt"));
    expect(canRenderText(doc)).toBe(true);
    const actual = Buffer.from(renderExportText(doc, t), "utf8");
    if (!actual.equals(expected)) {
      // A readable diff when it fails.
      expect(actual.toString("utf8")).toBe(expected.toString("utf8"));
    }
    expect(actual.equals(expected)).toBe(true);
  });

  // The contract (decision 216, app #88): an account started without an
  // email has no email in the export; the header says so, never "Account: ".
  it("an account with no email: 'Account: not backed up yet' (null, blank, missing)", () => {
    const base = JSON.parse(fs.readFileSync(path.join(dir, "export_fixture.json"), "utf8"));
    const second = (doc: unknown) => renderExportText(doc as never, t).split("\n").slice(0, 4);
    for (const account of [{ email: null }, { email: "" }, { email: "  " }, {}, undefined, null]) {
      const lines = second({ ...base, account });
      expect(lines[2], JSON.stringify(account)).toBe("Account: not backed up yet");
      expect(lines.some((l) => l === "Account: " || l === "Account:")).toBe(false);
    }
    expect(second(base)[2]).toBe(`Account: ${base.account.email}`);
  });

  it("only moodbow-export v1 is rendered", () => {
    expect(canRenderText({ format: "moodbow-export", format_version: 2 })).toBe(false);
    expect(canRenderText({ format: "other", format_version: 1 })).toBe(false);
    expect(canRenderText(null)).toBe(false);
  });

  it("exported_at in UTC from any offset, seconds truncated", () => {
    expect(exportedWhen("2026-10-20T03:15:59.98+07:00")).toBe("2026-10-19 20:15 UTC");
    expect(exportedWhen("2026-10-19T23:59:59.999Z")).toBe("2026-10-19 23:59 UTC");
  });

  it("bodies: line endings normalised, trailing blank lines dropped, the rest kept", () => {
    expect(cleanBody("\n\nA  \r\nB\r\n \t\n\n")).toBe("\n\nA  \nB");
    expect(cleanBody("one\rtwo")).toBe("one\ntwo");
  });

  it("the fixture files are kept byte-exact (no CRLF conversion)", () => {
    expect(fs.readFileSync(path.join(dir, "export_fixture.txt"), "utf8")).not.toContain("\r");
    expect(fs.readFileSync(path.join(dir, "export_fixture.txt"), "utf8")).toContain("Groceries  \n");
  });
});

describe("export file names (decision 107)", () => {
  it("the fixture's +07:00 exported_at in Asia/Bangkok is 2026-10-20, while the text says the UTC time", async () => {
    const { localDay, exportFileName, journalFileName } = await import("./journal/account");
    const doc = JSON.parse(fs.readFileSync(path.join(dir, "export_fixture.json"), "utf8"));
    const day = localDay(doc.exported_at, doc.profile.time_zone);
    expect(day).toBe("2026-10-20");
    expect(exportFileName(day)).toBe("moodbow-export-2026-10-20.json");
    expect(journalFileName(day)).toBe("moodbow-journal-2026-10-20.txt");
    expect(renderExportText(doc, t)).toContain("Exported: 2026-10-19 20:15 UTC");
  });
});

// export-text.md at the app's 586c90e (025-027, 030): the edge rules the fixture doesn't reach,
// each as the app's renderer (lib/data/export_text.dart) has it.
describe("readable export: the 1.2 sections and Plus", () => {
  const base = () => ({ format: "moodbow-export", format_version: 1, exported_at: "2026-11-12T10:00:00Z", account: { email: "a@example.com" } });
  const render = (extra: Record<string, unknown>) => renderExportText({ ...base(), ...extra } as never, t);

  it("things that help: one line each, a line break shown as a space", () => {
    expect(render({ things_that_help: [{ text: "Walk\nslowly" }, { text: "Tea\r\nnow" }] })).toContain("Things that help me\n- Walk slowly\n- Tea now");
  });

  it("the safety plan: only the parts with something in them; nothing at all for an empty plan", () => {
    const plan = { warning_signs: " \n\t", distractions: null, surroundings: "", people: [] };
    expect(render({ safety_plan: plan })).not.toContain("My safety plan");
    expect(render({ safety_plan: null })).not.toContain("My safety plan");
    const text = render({ safety_plan: { ...plan, surroundings: "Keep the door open", people: [{ section: "professionals", name: "Dr Lee", phone: null }] } });
    expect(text).toContain("My safety plan\nProfessionals and services\n- Dr Lee\n\nMaking my surroundings safer\nKeep the door open");
    expect(text).not.toContain("Warning signs");
    expect(text).not.toContain("People I can ask for help");
  });

  it("a phone is shown whenever it's a string, as the app reads it", () => {
    expect(render({ safety_plan: { people: [{ section: "people", name: "Sam", phone: "" }] } })).toContain("- Sam · \n");
  });

  it("letters: a locked one marked with its opening day, an opened one plain; opened_at missing reads as locked", () => {
    const text = render({
      letters: [
        { body: "Dear me,", written_on: "2026-10-02", opens_on: "2027-10-02", opened_at: null },
        { body: "Hi", written_on: "2026-10-03", opens_on: "2026-11-03", opened_at: "2026-11-03T08:00:00Z" },
        { body: "Later", written_on: "2026-10-04", opens_on: "2026-12-04" },
      ],
    });
    expect(text).toContain("Letters to future me\n2026-10-02 (locked until 2027-10-02)\nDear me,\n\n2026-10-03\nHi\n\n2026-10-04 (locked until 2026-12-04)\nLater");
  });

  it("Plus (030) is JSON only: the text is the same with or without it", () => {
    expect(render({ plus: { source: "stripe", status: "active", current_period_end: "2027-01-01T00:00:00Z" } })).toBe(render({}));
  });

  it("every language has the nine new keys", () => {
    for (const locale of ["en", "fr", "es", "pt-br", "de", "it", "th"]) {
      const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "messages", `${locale}.json`), "utf8"));
      for (const key of ["exportThingsThatHelp", "exportSafetyPlan", "exportPlanWarningSigns", "exportPlanDistractions", "exportPlanPeople", "exportPlanProfessionals", "exportPlanSurroundings", "exportLetters", "exportLetterLocked"]) {
        expect(typeof m.export[key], `${locale}: ${key}`).toBe("string");
      }
      expect(m.export.exportLetterLocked, locale).toContain("{date}");
    }
  });
});
