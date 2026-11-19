import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { policyNoticeDate, policyNoticeToShow } from "@/lib/journal/policyNotice";
import { dateInSentence } from "@/lib/journal/today";
import { PolicyNotice } from "./PolicyNotice";

const dismiss = vi.fn(async (_id: string): Promise<{ ok: boolean; changed?: boolean }> => ({ ok: true }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ dismissPolicyNotice: (id: string) => dismiss(id) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const a = messages.app;
const open = (date: string | null = "1 December 2026") =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PolicyNotice id="2026-12-01-plus" date={date} />
    </NextIntlClientProvider>,
  );

describe("policyNoticeToShow", () => {
  it("only when there's a current notice this account hasn't seen", () => {
    expect(policyNoticeToShow({ policy_notice_id: "n1", settings: { policy_notice_seen: null } })).toBe("n1");
    expect(policyNoticeToShow({ policy_notice_id: "n2", settings: { policy_notice_seen: "n1" } })).toBe("n2");
    expect(policyNoticeToShow({ policy_notice_id: "n1", settings: { policy_notice_seen: "n1" } })).toBeNull();
    expect(policyNoticeToShow({ policy_notice_id: null, settings: {} })).toBeNull();
  });
  it("a server without the field shows nothing", () => {
    expect(policyNoticeToShow({})).toBeNull();
    expect(policyNoticeToShow({ policy_notice_id: "" })).toBeNull();
  });
});

describe("policyNoticeDate", () => {
  it("reads the date an id starts with, as the app's #195 does, and nothing else", () => {
    expect(policyNoticeDate("2026-12-01-plus")).toBe("2026-12-01");
    expect(policyNoticeDate("2026-12-01")).toBe("2026-12-01");
    expect(policyNoticeDate("plus-2026-12-01")).toBeNull();
    expect(policyNoticeDate("2026-12-01plus")).toBeNull();
    expect(policyNoticeDate("2026-13-45-plus")).toBeNull();
    // A real calendar day only: no rolling 30 February over into March.
    expect(policyNoticeDate("2026-02-30-plus")).toBeNull();
    expect(policyNoticeDate("2028-02-29-plus")).toBe("2028-02-29");
  });
});

describe("the date in the sentence", () => {
  it("has no weekday, and each language's first of the month", () => {
    expect(dateInSentence("2026-12-01", "en-NZ")).toBe("1 December 2026");
    expect(dateInSentence("2026-12-01", "fr-FR")).toBe("1er décembre 2026");
    expect(dateInSentence("2026-12-01", "es-MX")).toBe("1 de diciembre de 2026");
    expect(dateInSentence("2026-12-01", "pt-BR")).toBe("1º de dezembro de 2026");
  });
});

describe("PolicyNotice", () => {
  it("says what's changing and when, links to the policy, and blocks nothing", () => {
    open();
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(a.policyNoticeTitle);
    expect(screen.getByTestId("policy-notice")).toHaveTextContent("From 1 December 2026, you can subscribe to Moodbow Plus. If you do, Stripe, Google Play or the App Store handles the payment.");
    expect(screen.getByTestId("policy-notice-read")).toHaveTextContent("See what changes");
    expect(screen.getByTestId("policy-notice-read")).toHaveAttribute("href", "/privacy/next");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("without a date, says Soon instead, and still who handles the payment", () => {
    open(null);
    expect(screen.getByTestId("policy-notice")).not.toHaveTextContent("{date}");
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(`${a.policyNoticeSoon} ${a.policyNoticeBody}`);
  });
  it("Got it: gone, and said once, with this notice's id", () => {
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    expect(screen.queryByTestId("policy-notice")).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("2026-12-01-plus");
  });
  it("the notice changed underneath: the page reads it again, once, with no error", async () => {
    dismiss.mockResolvedValueOnce({ ok: false, changed: true });
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    await new Promise((done) => setTimeout(done));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("any other failure doesn't reload", async () => {
    dismiss.mockResolvedValueOnce({ ok: false });
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    await new Promise((done) => setTimeout(done));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("a failed save is quiet: nothing throws, and it comes back next time", async () => {
    dismiss.mockRejectedValueOnce(new Error("offline"));
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    await Promise.resolve();
    expect(screen.queryByTestId("policy-notice")).toBeNull();
  });
});
