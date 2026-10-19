// @vitest-environment node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";

// content/contracts is a byte-for-byte copy of the app repo's
// supabase/contracts (decision 99), made by scripts/sync-contracts.mjs,
// which pins each file's SHA-256 in SOURCE.json. The web never edits these
// files; a mismatch means one changed here (an editor stripping the
// fixture's trailing spaces, say): re-sync instead.
const DIR = join(process.cwd(), "content", "contracts");
const source = JSON.parse(readFileSync(join(DIR, "SOURCE.json"), "utf8")) as { repo: string; commit: string; sha256: Record<string, string> };

describe("shared contracts (synced from the app)", () => {
  it("every file matches its pin, and nothing unpinned is there", () => {
    const files = readdirSync(DIR).filter((f) => f !== "SOURCE.json");
    expect(files.sort()).toEqual(Object.keys(source.sha256).sort());
    for (const [name, pin] of Object.entries(source.sha256)) {
      expect(createHash("sha256").update(readFileSync(join(DIR, name))).digest("hex"), name).toBe(pin);
    }
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("the Get help label equals get-help-label.json in every web locale (the reflect function names it)", async () => {
    const contract = JSON.parse(readFileSync(join(DIR, "get-help-label.json"), "utf8")) as { key: string; labels: Record<string, string> };
    expect(contract.key).toBe("meGetHelpNow");
    for (const locale of routing.locales) {
      const messages = (await import(`@/messages/${locale}.json`)).default as { me: Record<string, string> };
      expect(messages.me.meGetHelpNow, locale).toBe(contract.labels[locale]);
    }
  });
});
