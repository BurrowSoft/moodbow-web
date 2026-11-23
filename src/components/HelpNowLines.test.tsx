// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

// The help page's numbers with no script running (#248), as its server HTML: a number with * or # (Chile's
// *4141) has no call link on any device (S14, UX 23 Nov): the name, the number, how to call it. Copy number
// needs a script, so it isn't in this HTML.
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: "safety" | "common") => createTranslator({ locale: "en", messages, namespace }),
}));
const { HelpNowNumbers } = await import("./HelpNowLines");
const s = messages.safety;

const html = async (country: string) => renderToStaticMarkup((await HelpNowNumbers({ country }))!);

describe("HelpNowNumbers (no script)", () => {
  it("Chile's *4141: no link, the name, the number, how to call it; no Copy button without a script", async () => {
    const out = await html("CL");
    expect(out).not.toMatch(/href="tel:\*/);
    expect(out).not.toContain('data-testid="help-now-call-helpline"');
    expect(out).toContain('data-testid="help-now-helpline-byhand"');
    expect(out).toContain("The Suicide Prevention Line");
    expect(out).toContain("*4141");
    expect(out).toContain(s.planDialByHand);
    expect(out).not.toContain(s.planCopyNumber);
    expect(out).not.toMatch(/keypad/i);
    // The emergency number is still a link.
    expect(out).toMatch(/href="tel:\d+"/);
  });

  it("an all-digit number is a link, unchanged", async () => {
    const out = await html("FR");
    expect(out).toContain('href="tel:3114"');
    expect(out).not.toContain("help-now-helpline-byhand");
  });
});
