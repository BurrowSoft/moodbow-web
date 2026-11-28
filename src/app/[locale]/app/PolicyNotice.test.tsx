import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { knownNotice, policyNoticeDate, policyNoticeSlug, policyNoticeToShow } from "@/lib/journal/policyNotice";
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
      <PolicyNotice id="2026-12-01-ai" slug="ai" date={date} />
    </NextIntlClientProvider>,
  );

// The web reads the v2 notice only (migration 043; UX, 23 Nov): Plus's policy_notice_id is the
// installed apps', and a slug this build has no words for shows nothing.
describe("policyNoticeToShow", () => {
  it("only when there's a current v2 notice this account hasn't seen, with its slug", () => {
    expect(policyNoticeToShow({ policy_notice_v2_id: "2026-12-01-ai", settings: { policy_notice_v2_seen: null } })).toEqual({ id: "2026-12-01-ai", slug: "ai" });
    expect(policyNoticeToShow({ policy_notice_v2_id: "2026-12-01-ai", settings: { policy_notice_v2_seen: "2026-01-01-ai" } })).toEqual({ id: "2026-12-01-ai", slug: "ai" });
    expect(policyNoticeToShow({ policy_notice_v2_id: "2026-12-01-ai", settings: { policy_notice_v2_seen: "2026-12-01-ai" } })).toBeNull();
    expect(policyNoticeToShow({ policy_notice_v2_id: null, settings: {} })).toBeNull();
  });
  it("a slug this build has no words for, or no date in front of it: nothing", () => {
    expect(policyNoticeToShow({ policy_notice_v2_id: "2027-03-01-ads" })).toBeNull();
    expect(policyNoticeToShow({ policy_notice_v2_id: "ai" })).toBeNull();
    expect(policyNoticeToShow({ policy_notice_v2_id: "2026-12-01" })).toBeNull();
    expect(policyNoticeSlug("2026-12-01-ai")).toBe("ai");
    expect(policyNoticeSlug("2026-12-01-ai-2")).toBeNull();
  });
  it("Plus's notice (policy_notice_id, the installed apps') never shows on the web; a server without the field shows nothing", () => {
    expect(policyNoticeToShow({ policy_notice_id: "2026-11-20-plus", settings: { policy_notice_seen: null } } as never)).toBeNull();
    expect(policyNoticeToShow({})).toBeNull();
    expect(policyNoticeToShow({ policy_notice_v2_id: "" })).toBeNull();
  });
});

describe("knownNotice (policy_notice_v2_current: /privacy/next and the What changed date)", () => {
  it("the id only when it's a notice this build has words for", () => {
    expect(knownNotice("2026-12-01-ai")).toBe("2026-12-01-ai");
    for (const value of [null, undefined, "", 42, "2026-11-20-plus", "2027-03-01-ads"]) expect(knownNotice(value), String(value)).toBeNull();
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
  it("the AI notice (UX, 23 Nov): what's changing and when, links to the policy, and blocks nothing", () => {
    open();
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(a.policyNoticeTitle);
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(
      "From 1 December 2026, Moodbow offers optional AI features. They stay off unless you turn them on. If you do, Anthropic (USA) processes what's needed to write a reflection or report.",
    );
    expect(screen.getByTestId("policy-notice")).not.toHaveTextContent("Moodbow Plus");
    expect(screen.getByTestId("policy-notice-read")).toHaveTextContent("See what changes");
    expect(screen.getByTestId("policy-notice-read")).toHaveAttribute("href", "/privacy/next");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("without a date, says Soon instead, and still what it means", () => {
    open(null);
    expect(screen.getByTestId("policy-notice")).not.toHaveTextContent("{date}");
    expect(screen.getByTestId("policy-notice")).toHaveTextContent(`${a.policyNoticeAiSoon} ${a.policyNoticeAiBody}`);
  });
  it("Got it: gone, and said once, with this notice's id", () => {
    open();
    fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
    expect(screen.queryByTestId("policy-notice")).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("2026-12-01-ai");
  });
  it("Got it: focus goes to Today's heading, never to the page (as the Year card's Not now)", () => {
    const title = document.createElement("h1");
    title.id = "today-title";
    title.tabIndex = -1;
    document.body.append(title);
    try {
      open();
      screen.getByTestId("policy-notice-dismiss").focus();
      fireEvent.click(screen.getByTestId("policy-notice-dismiss"));
      expect(document.activeElement).toBe(title);
    } finally {
      title.remove();
    }
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
