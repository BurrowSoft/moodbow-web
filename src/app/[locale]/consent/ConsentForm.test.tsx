import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("./actions", () => ({ giveConsent: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { ConsentForm } = await import("./ConsentForm");
afterEach(cleanup);

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentForm askAge={false} showBack={false} />
    </NextIntlClientProvider>,
  );

describe("ConsentForm: the legal pages are in English", () => {
  it("said where they are, not where they aren't", () => {
    const view = renderIt();
    expect(screen.queryByTestId("consent-legal-english")).toBeNull();
    view.unmount();
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <ConsentForm askAge={false} showBack={false} legalInEnglish />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("consent-legal-english")).toHaveTextContent(fr.onboarding.consentLegalEnglish);
  });
});

describe("ConsentForm: no AI box (UX, 23 Nov, the AI go-live: AI consent only in Me → AI, as the app)", () => {
  it("never shown; the two required boxes are enough for Continue", () => {
    renderIt();
    expect(screen.queryByTestId("consent-ai")).toBeNull();
    expect(screen.queryByText(messages.ai.consentAiBody)).toBeNull();
    fireEvent.click(screen.getByTestId("consent-privacy"));
    fireEvent.click(screen.getByTestId("consent-health"));
    expect(screen.getByTestId("consent-continue")).toBeEnabled();
  });
});

// Web Tester batch E: the two links were 20 px tall. min-h-11 is 44 px; the measured height is checked in Chromium.
describe("ConsentForm: the legal links are 44 px tap areas", () => {
  it("Read the Terms and Read the Privacy Policy", () => {
    renderIt();
    for (const id of ["consent-read-terms", "consent-read-privacy"]) {
      expect(screen.getByTestId(id).className.split(" ")).toEqual(expect.arrayContaining(["inline-flex", "min-h-11", "items-center"]));
    }
  });
});

describe("ConsentForm: the boxes", () => {
  it("are 24 px, as Create account's (#350; UX, 19 Nov)", () => {
    renderIt();
    for (const id of ["consent-privacy", "consent-health"]) {
      const box = screen.getByTestId(id);
      expect(box.className, id).toContain("h-[24px]");
      expect(box.className, id).toContain("w-[24px]");
    }
  });
});
