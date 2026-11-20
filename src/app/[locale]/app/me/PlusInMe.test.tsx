import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SAVE_WAIT_MS } from "@/lib/ui/withTimeout";
import type { PlusView } from "@/lib/plus/view";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const { PlusInMe, endsOnLabel } = await import("./PlusInMe");
const m = messages.plus;

const show = (view: PlusView) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlusInMe view={view} price="US$59.99" />
    </NextIntlClientProvider>,
  );
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlusInMe: the banner", () => {
  it("free: See the bigger picture, Try 7 days free to the Plus screen, then the price", () => {
    show({ kind: "free", trial: true });
    const banner = screen.getByTestId("me-plus-banner");
    expect(banner).toHaveTextContent(m.bannerTitle);
    expect(screen.getByTestId("me-plus-try")).toHaveAttribute("href", "/app/me/plus");
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.tryFree);
    expect(banner).toHaveTextContent("Then US$59.99 a year");
  });

  it("the free week used: See Plus and the yearly price", () => {
    show({ kind: "free", trial: false });
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.seePlus);
    expect(screen.getByTestId("me-plus-banner")).toHaveTextContent("US$59.99 a year");
  });

  it("closed: gone for the rest of that day only; back the next day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
    show({ kind: "free", trial: true });
    act(() => fireEvent.click(screen.getByRole("button", { name: m.bannerClose })));
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 11, 23, 0));
    show({ kind: "free", trial: true });
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 12, 8, 0));
    show({ kind: "free", trial: true });
    expect(screen.getByTestId("me-plus-banner")).toBeInTheDocument();
  });
});

describe("PlusInMe: the trial counter and a failed renewal", () => {
  it("the free week: Plus trial, n days left, 7 segments named by the day", () => {
    show({ kind: "plus", source: "stripe", daysLeft: 5 });
    expect(screen.getByTestId("me-plus-days-left")).toHaveTextContent("5 days left");
    expect(screen.getByRole("img", { name: "Day 3 of 7" })).toBeInTheDocument();
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
  });
  it("one day left: singular", () => {
    show({ kind: "plus", source: "play", daysLeft: 1 });
    expect(screen.getByTestId("me-plus-days-left")).toHaveTextContent("1 day left");
  });
  it("Plus with no trial running: nothing here", () => {
    const { container } = show({ kind: "plus", source: "stripe", daysLeft: null });
    expect(container).toBeEmptyDOMElement();
  });
  it("past_due, a dead connection: Update card gives up at SAVE_WAIT_MS with the error line and works again (audit D)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));
    vi.stubGlobal("fetch", fetchMock);
    show({ kind: "past_due" });
    await act(async () => fireEvent.click(screen.getByTestId("me-plus-update-card")));
    expect(fetchMock).toHaveBeenCalledWith("/api/billing/portal", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(timeout).toHaveBeenCalledWith(SAVE_WAIT_MS);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("me-plus-update-card")).not.toBeDisabled();
    timeout.mockRestore();
    vi.unstubAllGlobals();
  });

  it("past_due after the grace: Plus is off, so the line says get it back, never keep it (UX, sw14 6b); Update card, no offer", () => {
    show({ kind: "past_due" });
    expect(screen.getByTestId("me-plus-past-due-line")).toHaveTextContent("Your last payment didn't go through. Update your card to get Plus back.");
    expect(screen.getByTestId("me-plus-past-due")).not.toHaveTextContent("keep Plus");
    expect(screen.getByTestId("me-plus-update-card")).toHaveTextContent(m.updateCard);
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
  });
  it("inside the 7-day grace (041): Plus still on, the same line and Update card (UX, 19 Nov)", () => {
    show({ kind: "plus", source: "stripe", daysLeft: null, paymentFailed: true });
    expect(screen.getByTestId("me-plus-past-due")).toHaveTextContent("Your last payment didn't go through. Update your card to keep Plus.");
    expect(screen.getByTestId("me-plus-update-card")).toHaveTextContent(m.updateCard);
    expect(screen.queryByTestId("me-plus-trial")).toBeNull();
    expect(screen.queryByTestId("me-plus-banner")).toBeNull();
  });
});

// 042, UX 20 Nov (sw14): after a cancel in the portal, Me says when Plus ends and that it won't renew, so the
// cancel visibly worked. The date is in the person's own format and zone.
describe("PlusInMe: a pending cancel (cancel_at)", () => {
  const NOW = new Date("2026-11-20T09:00:00Z");
  const showIn = (view: PlusView, dateLocaleTag = "en-GB", timeZone = "Asia/Bangkok") =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlusInMe view={view} price="US$59.99" dateLocaleTag={dateLocaleTag} timeZone={timeZone} />
      </NextIntlClientProvider>,
    );
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  // What a reader sees at one size: the date's other form is display: none there (globals.css, [data-date-form]),
  // which jsdom doesn't load, so it's taken out here.
  const seen = (el: HTMLElement, form: "long" | "short") => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(`[data-date-form]:not([data-date-form="${form}"])`).forEach((n) => n.remove());
    return copy.textContent;
  };

  it("a trial that won't renew: when it ends, in place of the counter; the 7 segments stay", () => {
    showIn({ kind: "plus", source: "stripe", daysLeft: 6, endsAt: "2026-11-26T16:44:00Z" });
    expect(seen(screen.getByTestId("me-plus-trial-ends"), "long")).toBe("Plus trial · ends 26 November · won't renew");
    expect(seen(screen.getByTestId("me-plus-trial-ends"), "short")).toBe("Plus trial · ends 26 Nov · won't renew");
    expect(screen.queryByTestId("me-plus-days-left")).toBeNull();
    expect(screen.getByRole("img", { name: "Day 2 of 7" })).toBeInTheDocument();
  });

  it("paid Plus that won't renew: its own line, with the year when it isn't this one", () => {
    // 08:00 UTC is 15:00 in Bangkok, the same day.
    showIn({ kind: "plus", source: "stripe", daysLeft: null, endsAt: "2027-11-19T08:00:00Z" });
    expect(seen(screen.getByTestId("me-plus-ends"), "long")).toBe("Plus · ends 19 November 2027 · won't renew");
    expect(seen(screen.getByTestId("me-plus-ends"), "short")).toBe("Plus · ends 19 Nov 2027 · won't renew");
    expect(screen.queryByTestId("me-plus-trial")).toBeNull();
  });

  it("the day is the person's: late in UTC is the next day in Bangkok, the same day in New York", () => {
    const view: PlusView = { kind: "plus", source: "stripe", daysLeft: null, endsAt: "2026-11-26T20:00:00Z" };
    showIn(view, "en-GB", "Asia/Bangkok");
    expect(screen.getByTestId("me-plus-ends")).toHaveTextContent("ends 27 November");
    cleanup();
    showIn(view, "en-GB", "America/New_York");
    expect(screen.getByTestId("me-plus-ends")).toHaveTextContent("ends 26 November");
  });

  it("each language's own date (the strings say the rest): de 26. November, fr 26 novembre, es and pt-BR with de", () => {
    const iso = "2026-11-26T16:44:00Z";
    const now = NOW.getTime();
    expect(endsOnLabel(iso, "de-DE", "Europe/Berlin", now)).toBe("26. November");
    expect(endsOnLabel(iso, "fr-FR", "Europe/Paris", now)).toBe("26 novembre");
    expect(endsOnLabel(iso, "es-ES", "Europe/Madrid", now)).toBe("26 de noviembre");
    expect(endsOnLabel(iso, "pt-BR", "America/Sao_Paulo", now)).toBe("26 de novembro");
    expect(endsOnLabel("2027-01-02T10:00:00Z", "en-GB", "UTC", now)).toBe("2 January 2027");
  });

  it("the short month, for large text: UX's own examples, en Nov 19, 2027, de 19. Nov. 2027, es 19 nov 2027", () => {
    const now = NOW.getTime();
    const next = "2027-11-19T08:00:00Z";
    expect(endsOnLabel(next, "en-US", "UTC", now, "short")).toBe("Nov 19, 2027");
    expect(endsOnLabel(next, "de-DE", "Europe/Berlin", now, "short")).toBe("19. Nov. 2027");
    expect(endsOnLabel(next, "es-ES", "Europe/Madrid", now, "short")).toBe("19 nov 2027");
    // This year's: no year, as with the long month.
    const iso = "2026-11-26T16:44:00Z";
    expect(endsOnLabel(iso, "en-GB", "Asia/Bangkok", now, "short")).toBe("26 Nov");
    expect(endsOnLabel(iso, "fr-FR", "Europe/Paris", now, "short")).toBe("26 nov.");
    expect(endsOnLabel(iso, "pt-BR", "America/Sao_Paulo", now, "short")).toBe("26 de nov.");
  });

  // UX, 20 Nov (the Web Tester, de 360/200 and 320/300): the date is one inline-block with plain spaces. It moves to
  // the next line whole when it fits there and wraps only at its own spaces when it can't, never inside a word.
  // (No-break spaces made it one unbreakable run that the browser cut mid-word.)
  // The span sets no hyphens of its own: hyphens: manual made "noviembre" run past the card at 320 px / 300 % (the Web
  // Tester, 20 Nov). At that size the short month shows anyway (the next test).
  it("the date sits whole in its own inline-block, plain spaces, no cut words, hyphens inherited; the sentence reads as before", () => {
    showIn({ kind: "plus", source: "stripe", daysLeft: null, endsAt: "2027-11-19T08:00:00Z" }, "de-DE", "Europe/Berlin");
    const date = screen.getByTestId("me-plus-date");
    expect(screen.getByTestId("me-plus-date-long").textContent).toBe("19. November 2027");
    expect(screen.getByTestId("me-plus-date-short").textContent).toBe("19. Nov. 2027");
    expect(date.textContent).not.toContain(String.fromCharCode(0xa0));
    expect(date.className).toContain("inline-block");
    expect(date.className).toContain("[overflow-wrap:normal]");
    expect(date.className).not.toMatch(/hyphens/);
    expect(seen(screen.getByTestId("me-plus-ends"), "long")).toBe("Plus · ends 19. November 2027 · won't renew");
    expect(seen(screen.getByTestId("me-plus-ends"), "short")).toBe("Plus · ends 19. Nov. 2027 · won't renew");
    cleanup();
    showIn({ kind: "plus", source: "stripe", daysLeft: 6, endsAt: "2026-11-26T16:44:00Z" });
    expect(seen(screen.getByTestId("me-plus-trial-ends"), "long")).toBe("Plus trial · ends 26 November · won't renew");
    expect(screen.getByTestId("me-plus-date-long").textContent).toBe("26 November");
    expect(screen.getByTestId("me-plus-date-short").textContent).toBe("26 Nov");
  });

  // UX's ruling, 20 Nov (the Web Tester at en 320/300: Chrome never hyphenates "November", so it ran past the card):
  // the date is there twice, and the short month shows only where large text makes the page a 13em column or
  // narrower, the hyphen rule's own query. The other form is display: none, so a screen reader hears only one.
  it("the long month at normal sizes, the short one only under the hyphen rule's query; one form at a time", () => {
    showIn({ kind: "plus", source: "stripe", daysLeft: null, endsAt: "2027-11-19T08:00:00Z" }, "en-US", "UTC");
    const forms = Array.from(screen.getByTestId("me-plus-date").children).map((el) => [el.getAttribute("data-date-form"), el.textContent]);
    expect(forms).toEqual([
      ["long", "November 19, 2027"],
      ["short", "Nov 19, 2027"],
    ]);
    const css = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ");
    expect(css).toContain("@media (max-width: 13em) { body { hyphens: auto;");
    expect(css).toContain('[data-date-form="short"] { display: none; } @media (max-width: 13em) { [data-date-form="long"] { display: none; } [data-date-form="short"] { display: inline; } }');
  });

  // The span goes in where the message's {date} is: every locale's two lines must have it exactly once, or the
  // split would drop or repeat part of the sentence (the Reviewer, 20 Nov). This fails before any such translation ships.
  it("every locale's won't-renew lines have {date} exactly once", async () => {
    const { IntlMessageFormat } = await import("intl-messageformat");
    const TOKEN = "@@date@@";
    for (const locale of ["en", "fr", "es", "pt-br", "de", "it", "th"]) {
      const plus = ((await import(`@/messages/${locale}.json`)) as { default: { plus: Record<string, string> } }).default.plus;
      for (const key of ["trialEndsWontRenew", "endsWontRenew"]) {
        const text = new IntlMessageFormat(plus[key], locale).format({ date: TOKEN }) as string;
        expect(text.split(TOKEN).length - 1, `${locale} plus.${key}`).toBe(1);
      }
    }
  });

  it("a zone this runtime doesn't know: UTC, never a crash", () => {
    expect(endsOnLabel("2026-11-26T23:30:00Z", "en-GB", "Mars/Olympus", NOW.getTime())).toBe("26 November");
  });

  it("a failed payment comes first: the card line, not the won't-renew line", () => {
    showIn({ kind: "plus", source: "stripe", daysLeft: null, paymentFailed: true, endsAt: "2026-11-26T16:44:00Z" });
    expect(screen.getByTestId("me-plus-past-due")).toHaveTextContent(m.pastDue);
    expect(screen.queryByTestId("me-plus-ends")).toBeNull();
  });
});

describe("PlusInMe: the Christmas offer's banner (1.3)", () => {
  it("its label, the first year, See the offer, and the renewal in the small print", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlusInMe view={{ kind: "free", trial: true }} price="€49.99" offer={{ firstYear: "€24.99", price: "€49.99" }} />
      </NextIntlClientProvider>,
    );
    const banner = screen.getByTestId("me-plus-banner");
    expect(banner).toHaveAttribute("data-offer", "");
    expect(banner).toHaveTextContent(m.offerLabel);
    expect(banner).toHaveTextContent("Your first year for €24.99");
    expect(screen.getByTestId("me-plus-try")).toHaveTextContent(m.offerSee);
    expect(banner).toHaveTextContent("Christmas special, until 31 December. Then €49.99 a year. Cancel anytime in Me → Moodbow Plus.");
    expect(banner.textContent).not.toMatch(/%|half|7 days/i);
  });
});
