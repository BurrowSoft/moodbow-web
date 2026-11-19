// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { standaloneLinkClass, textLinkClass } from "@/components/AuthField";

// UX, 20 Nov (the Web Tester at 100 %): a text link on its own line, not inside a sentence, is at least 24 px tall, the
// target size WCAG 2.5.8 asks of it. Me's FAQ, Privacy, Terms and Contact, Help's back link, Support's link to account
// deletion and Create account's "Already have an account?" were 23 px. The public ones are measured in a real browser
// (e2e/smoke.spec.ts); Me's need a session, so this pins the class they use.
describe("standalone text links: 24 px targets", () => {
  it("at least 24 px tall, with a text link's look; one more px at the normal size, nothing at large text", () => {
    expect(standaloneLinkClass).toContain("inline-flex");
    expect(standaloneLinkClass).toContain("min-h-[24px]");
    expect(standaloneLinkClass).toContain(textLinkClass);
  });
  it("the links the Web Tester measured use it", () => {
    const uses: Record<string, string> = {
      "src/app/[locale]/app/me/page.tsx": "const link = standaloneLinkClass;",
      "src/app/[locale]/help/[slug]/page.tsx": 'data-testid="help-back" className={standaloneLinkClass}',
      "src/app/[locale]/support/page.tsx": 'data-testid="support-account-deletion" className={standaloneLinkClass}',
      "src/app/[locale]/sign-up/SignUpForm.tsx": 'data-testid="signup-to-signin" className={standaloneLinkClass}',
    };
    for (const [file, snippet] of Object.entries(uses)) expect(readFileSync(file, "utf8"), file).toContain(snippet);
  });
});
