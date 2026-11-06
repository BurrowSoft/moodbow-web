import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { policyNoticeDate, policyNoticeToShow } from "@/lib/journal/policyNotice";
import { PolicyNotice } from "./PolicyNotice";

const dismiss = vi.fn(async (_id: string) => ({ ok: true }));
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
      <PolicyNotice id="2026-12-01-bo" date={date} />
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
  it("reads the date an id starts with, and nothing else", () => {
    expect(policyNoticeDate("2026-12-01-bo")).toBe("2026-12-01");
    expect(policyNoticeDate("bo-privacy")).toBeNull();
    expect(policyNoticeDate("2026-13-45-bo")).toBeNull();
  });
});

describe("PolicyNotice", () => {
  it("says what's changing and when, links to the policy, and blocks nothing", () => {
    open();
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(a.policyNoticeTitle);
    expect(screen.getByTestId("policy-notice")).toHaveTextContent("1 December 2026");
    expect(screen.getByTestId("policy-notice-read")).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("without a date, leaves that sentence out", () => {
    open(null);
    expect(screen.getByTestId("policy-notice")).not.toHaveTextContent("{date}");
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(a.policyNoticeBody);
  });
  it("Got it: gone, and said once, with this notice's id", () => {
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    expect(screen.queryByTestId("policy-notice")).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("2026-12-01-bo");
  });
  it("a failed save is quiet: nothing throws, and it comes back next time", async () => {
    dismiss.mockRejectedValueOnce(new Error("offline"));
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    await Promise.resolve();
    expect(screen.queryByTestId("policy-notice")).toBeNull();
  });
});
