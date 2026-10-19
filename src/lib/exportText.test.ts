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
