import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { boCardMayOpen, type BoMessage } from "@/lib/journal/bo";
import { BoConversation } from "./BoConversation";

let keyboard = false;
vi.mock("@/lib/ui/keyboardOpen", () => ({ useKeyboardOpen: () => keyboard }));

const give = vi.fn(async () => ({ ok: true }));
const report = vi.fn(async (_reply: object) => ({ ok: true }));
const clear = vi.fn(async () => ({ ok: true }));
vi.mock("./actions", () => ({ giveBoConsent: () => give(), reportBoReply: (reply: object) => report(reply), clearBoConversation: () => clear() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Bo's screen against a stubbed /api/bo: the function's real contract isn't deployed
// yet (#182), so these prove the screen's side of supabase/contracts/bo.md only.
const b = messages.bo;
const ok = { status: "ok", available: true, pictures: false, maxChars: 2000 };
const reply = (over: object = {}) => ({ status: "ok", reply: "A reply", showHelp: false, openCard: false, showNotice: false, conversationFull: false, ...over });
const flagged = CRISIS_KEYWORDS?.languages.en.phrases[0] as string;

let answers: unknown[];
let statusAnswer: unknown;
let calls: { action: string; client_key?: string; text?: string }[];

beforeEach(() => {
  keyboard = false;
  answers = [];
  calls = [];
  statusAnswer = ok;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as (typeof calls)[number];
      calls.push(body);
      if (body.action === "status") return { json: async () => statusAnswer };
      if (body.action === "notice_shown") return { json: async () => ({ ok: true }) };
      const next = answers.shift();
      if (next === "throw") throw new Error("offline");
      return { json: async () => next };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function open(initial: BoMessage[] = [], consented = true) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoConversation initial={initial} country="NZ" healthData consented={consented} />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(calls.some((c) => c.action === "status")).toBe(true));
  await act(async () => {});
}

const type = (text: string) => fireEvent.change(screen.getByTestId("bo-text"), { target: { value: text } });
const send = async () => {
  fireEvent.click(screen.getByTestId("bo-send"));
  await act(async () => {});
};
const sends = () => calls.filter((c) => c.action === "send");

describe("BoConversation", () => {
  it("empty: the first line, the small line and the help button; a kept conversation instead of the first line", async () => {
    await open();
    expect(screen.getByText(b.firstLine)).toBeInTheDocument();
    expect(screen.getByTestId("bo-help")).toHaveAttribute("href", "/help/bo");
    expect(screen.getByTestId("bo-get-help")).toHaveTextContent(messages.me.meGetHelpNow);
    cleanup();
    await open([{ id: "1", author: "person", body: "Hello" }]);
    expect(screen.queryByText(b.firstLine)).toBeNull();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("the line and help stay in the header; the page marks itself and carries the health data link, as the footer goes", async () => {
    await open();
    const header = screen.getByTestId("bo-header");
    expect(header).toHaveTextContent(b.screenLine);
    expect(header).toContainElement(screen.getByTestId("bo-get-help"));
    expect(document.documentElement.dataset.boScreen).toBe("");
    expect(screen.getByTestId("bo-health-data")).toHaveTextContent(messages.common.consumerHealthData);
    cleanup();
    expect(document.documentElement.dataset.boScreen).toBeUndefined();
  });

  it("a header past a quarter of the window stops being pinned, and a row holds the line and help", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);
    await open();
    expect(screen.getByTestId("bo-header")).not.toHaveClass("sticky");
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    expect(screen.getByTestId("bo-get-help-end")).toBeInTheDocument();
    expect(screen.getByTestId("bo-end-row")).toHaveClass("sticky");
    expect(screen.getByTestId("bo-end-line")).toHaveTextContent(b.screenLine);
    cleanup();
    height.mockReturnValue(60);
    await open();
    expect(screen.getByTestId("bo-header")).toHaveClass("sticky");
    expect(screen.queryByTestId("bo-get-help-end")).toBeNull();
    height.mockRestore();
  });

  it("with the phone's keyboard up: the line and help sit just above the box, and nothing's pinned", async () => {
    keyboard = true;
    await open();
    const row = screen.getByTestId("bo-typing-row");
    expect(row).toHaveTextContent(b.screenLine);
    expect(row).toContainElement(screen.getByTestId("bo-get-help-typing"));
    expect(row.compareDocumentPosition(screen.getByTestId("bo-text")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("bo-header")).not.toHaveClass("sticky");
    expect(screen.queryByTestId("bo-end-row")).toBeNull();
    fireEvent.click(screen.getByTestId("bo-get-help-typing"));
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
  });

  it("with the keyboard up: two rows, a shorter box, and Send beside it", async () => {
    keyboard = true;
    await open();
    const box = screen.getByTestId("bo-text");
    expect(box).toHaveAttribute("rows", "2");
    expect(box).toHaveClass("max-h-[96px]");
    expect(box.closest("form")).toHaveClass("flex-row");
  });

  it("a failed send: the line is announced, the text stays, and focus returns to the box", async () => {
    await open();
    answers.push({ status: "error", code: "bo_failed" });
    type("Hello");
    await send();
    await new Promise((done) => requestAnimationFrame(done));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent(b.failed);
    expect(screen.getByTestId("bo-text")).toHaveValue("Hello");
    expect(screen.getByTestId("bo-text")).toHaveFocus();
  });

  it("a reply: both messages show, the box empties, and a reply's markup stays text", async () => {
    await open();
    answers.push(reply({ reply: "<b>bold</b> https://example.com" }));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-message-person")).toHaveTextContent("Hello");
    const shown = screen.getByTestId("bo-message-ai");
    expect(shown).toHaveTextContent("<b>bold</b> https://example.com");
    expect(shown.querySelector("a, b")).toBeNull();
    expect(screen.getByTestId("bo-text")).toHaveValue("");
  });

  it("a failure keeps the message and Try again resends it with the same key; a changed message gets a new one", async () => {
    await open();
    answers.push({ status: "error", code: "bo_failed" }, reply());
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.failed);
    expect(screen.getByTestId("bo-text")).toHaveValue("Hello");
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bo-retry"));
    await act(async () => {});
    expect(sends()[1].client_key).toBe(sends()[0].client_key);

    answers.push({ status: "error", code: "bo_failed" }, reply());
    type("One");
    await send();
    type("Two");
    await send();
    expect(sends()[3].client_key).not.toBe(sends()[2].client_key);
  });

  it("no answer: the client's own text, with Try again and help", async () => {
    await open();
    answers.push("throw");
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.failed);
    expect(screen.getByTestId("bo-retry")).toBeInTheDocument();
  });

  it.each([
    ["region_off", b.regionOff],
    ["bo_not_available", b.notAvailableNow],
    ["language_off", b.languageOff],
    ["age_off", b.ageOff],
    ["bo_off", b.boOff],
    ["bo_unavailable", b.notAvailableNow],
    ["needs_email", b.notAvailableNow],
  ])("%s closes the box and keeps help", async (code, line) => {
    await open();
    answers.push({ status: "error", code });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(line);
    expect(screen.queryByTestId("bo-text")).toBeNull();
    expect(screen.queryByTestId("bo-retry")).toBeNull();
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
  });

  it("region_unknown: the line and help, and Try again looks again, with the text still there", async () => {
    await open();
    answers.push({ status: "error", code: "region_unknown" });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.regionUnknown);
    expect(screen.queryByTestId("bo-text")).toBeNull();
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bo-retry"));
    await act(async () => {});
    expect(screen.queryByTestId("bo-problem")).toBeNull();
    expect(screen.getByTestId("bo-text")).toHaveValue("Hello");
  });

  it("the status call finds Bo off or unanswered, on opening: its line and help, no box", async () => {
    statusAnswer = { status: "error", code: "region_off" };
    await open();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.regionOff);
    expect(screen.queryByTestId("bo-text")).toBeNull();
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    cleanup();
    statusAnswer = { status: "no_answer" };
    await open();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.regionUnknown);
  });

  it("known offline: no request, its line, help, and crisis words still open the card; Try again sends once back", async () => {
    await open();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    type(flagged);
    await send();
    expect(sends()).toHaveLength(0);
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.offline);
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    expect(screen.getByTestId("bo-text")).toHaveValue(flagged);
    online.mockReturnValue(true);
    answers.push(reply());
    fireEvent.click(screen.getByTestId("bo-retry"));
    await act(async () => {});
    expect(sends()).toHaveLength(1);
    online.mockRestore();
  });

  it("offline on opening: Try again looks again rather than sending nothing", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    statusAnswer = { status: "no_answer" };
    await open();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.offline);
    online.mockReturnValue(true);
    statusAnswer = ok;
    fireEvent.click(screen.getByTestId("bo-retry"));
    await act(async () => {});
    expect(screen.queryByTestId("bo-problem")).toBeNull();
    online.mockRestore();
  });

  it("changing the text clears a line about the last send", async () => {
    await open();
    answers.push({ status: "error", code: "bo_failed" });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toBeInTheDocument();
    type("Hello there");
    expect(screen.queryByTestId("bo-problem")).toBeNull();
  });

  it("the day's limit: the kind line, with help", async () => {
    await open();
    answers.push({ status: "error", code: "daily_limit" });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.dailyLimit);
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
  });

  it("too long: says so and Send is off, with nothing sent", async () => {
    await open();
    type("x".repeat(2001));
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.tooLong);
    expect(screen.getByTestId("bo-send")).toBeDisabled();
    expect(sends()).toHaveLength(0);
  });

  it("crossing the limit with crisis words: the card opens, the text stays, nothing is sent", async () => {
    await open();
    const long = `${flagged} ${"x".repeat(2001)}`;
    type(long);
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.tooLong);
    expect(screen.getByTestId("bo-text")).toHaveValue(long);
    expect(sends()).toHaveLength(0);
  });

  it("open_card opens the card; the message still sent", async () => {
    await open();
    answers.push(reply({ openCard: true }));
    type("Hello");
    await send();
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(sends()).toHaveLength(1);
  });

  it("a flagged message opens the card and still sends", async () => {
    await open();
    answers.push(reply());
    type(flagged);
    await send();
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(sends()).toHaveLength(1);
  });

  it("a full conversation says so, with help, and crisis words still open the card", async () => {
    await open();
    answers.push(reply({ conversationFull: true }));
    type(flagged);
    await send();
    expect(screen.getByTestId("bo-full")).toHaveTextContent(b.conversationFull);
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
  });

  it("no consent yet: the consent instead of the box, with the line and help, and Not now goes back", async () => {
    await open([], false);
    expect(screen.getByTestId("bo-consent")).toBeInTheDocument();
    expect(screen.queryByTestId("bo-text")).toBeNull();
    expect(screen.getByTestId("bo-header")).toHaveTextContent(b.screenLine);
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    expect(screen.getByTestId("bo-consent-decline")).toHaveAttribute("href", "/app");
  });

  it("a yes opens the box; a failed save says so and stays", async () => {
    await open([], false);
    give.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByTestId("bo-consent-accept"));
    await act(async () => {});
    expect(screen.getByTestId("bo-consent-failed")).toHaveTextContent(b.consentFailed);
    fireEvent.click(screen.getByTestId("bo-consent-accept"));
    await act(async () => {});
    expect(screen.queryByTestId("bo-consent")).toBeNull();
    expect(screen.getByTestId("bo-text")).toBeInTheDocument();
  });

  it("a yes asks the function for status again, as the status before consent can say less (app #228); a failed save doesn't", async () => {
    await open([], false);
    const statuses = () => calls.filter((c) => c.action === "status").length;
    expect(statuses()).toBe(1);
    give.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByTestId("bo-consent-accept"));
    await act(async () => {});
    expect(statuses()).toBe(1);
    fireEvent.click(screen.getByTestId("bo-consent-accept"));
    await act(async () => {});
    await waitFor(() => expect(statuses()).toBe(2));
  });

  it("help_country: status's verified country first on the card, Me's below; a reply's, none included, wins (app #228)", async () => {
    statusAnswer = { ...ok, helpCountry: "TH" };
    await open();
    fireEvent.click(screen.getByTestId("bo-get-help"));
    expect(screen.getByTestId("safety-country")).toHaveTextContent("Thailand");
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1323");
    expect(screen.getByTestId("safety-also-country")).toHaveTextContent("New Zealand");
    fireEvent.click(screen.getByTestId("safety-close"));
    // This message was checked with no verified country: the server's line used Me's, so the card does.
    answers.push(reply());
    type("Hello");
    await send();
    fireEvent.click(screen.getByTestId("bo-get-help"));
    expect(screen.queryByTestId("safety-also")).toBeNull();
    expect(screen.getByTestId("safety-call-helpline")).toHaveAttribute("href", "tel:1737");
  });

  it("a card opened by a reply names the reply's country first", async () => {
    await open();
    answers.push(reply({ openCard: true, helpCountry: "TH" }));
    type("Hello");
    await send();
    expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    expect(screen.getByTestId("safety-country")).toHaveTextContent("Thailand");
    expect(screen.getByTestId("safety-also-country")).toHaveTextContent("New Zealand");
  });

  it("ai_consent_required on a send: the consent, and after a yes the text is still there", async () => {
    await open();
    answers.push({ status: "error", code: "ai_consent_required" });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-consent")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bo-consent-accept"));
    await act(async () => {});
    expect(screen.getByTestId("bo-text")).toHaveValue("Hello");
  });

  it("Report on a kept reply sends its id, on this visit's reply its send's key, and says no one reads it right away", async () => {
    await open([{ id: "11111111-1111-4111-8111-111111111111", author: "ai", body: "Kept" }]);
    fireEvent.click(screen.getByTestId("bo-report"));
    await act(async () => {});
    expect(report).toHaveBeenLastCalledWith({ id: "11111111-1111-4111-8111-111111111111" });
    expect(screen.getByTestId("bo-report-done")).toHaveTextContent(b.reportScreen);
    expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    answers.push(reply());
    type("Hello");
    await send();
    fireEvent.click(screen.getByTestId("bo-report"));
    await act(async () => {});
    expect(report).toHaveBeenLastCalledWith({ clientKey: sends()[0].client_key });
  });

  it("a failed report says so and can be tried again", async () => {
    await open([{ id: "1", author: "ai", body: "Kept" }]);
    report.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByTestId("bo-report"));
    await act(async () => {});
    expect(screen.getByTestId("bo-report-failed")).toBeInTheDocument();
    expect(screen.getByTestId("bo-report")).toBeEnabled();
  });

  it("full: the reply shows, with no Report as it wasn't kept, then Export and Clear; Clear starts again", async () => {
    await open([{ id: "1", author: "person", body: "Earlier" }]);
    answers.push(reply({ conversationFull: true }));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-message-ai")).toHaveTextContent("A reply");
    expect(screen.queryByTestId("bo-report")).toBeNull();
    expect(screen.getByTestId("bo-full-export")).toHaveAttribute("href", "/app/me#me-your-data");
    fireEvent.click(screen.getByTestId("bo-full-clear"));
    fireEvent.click(screen.getByTestId("bo-clear-confirm"));
    await act(async () => {});
    expect(clear).toHaveBeenCalled();
    expect(screen.queryByTestId("bo-full")).toBeNull();
    expect(screen.queryByText("Earlier")).toBeNull();
    expect(screen.getByText(b.firstLine)).toBeInTheDocument();
  });

  it("closing the card puts focus back in the box", async () => {
    await open();
    answers.push(reply({ openCard: true }));
    type("Hello");
    await send();
    fireEvent.click(screen.getByTestId("safety-close"));
    await new Promise((done) => requestAnimationFrame(done));
    await act(async () => {});
    expect(screen.getByTestId("bo-text")).toHaveFocus();
  });

  it("the card doesn't reopen within ten minutes, and does after", () => {
    expect(boCardMayOpen(null, 1000)).toBe(true);
    expect(boCardMayOpen(0, 10 * 60_000 - 1)).toBe(false);
    expect(boCardMayOpen(0, 10 * 60_000)).toBe(true);
  });

  it("show_notice shows the notice, then says it was shown", async () => {
    await open();
    answers.push(reply({ showNotice: true }));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-notice")).toHaveTextContent(b.notice);
    expect(calls.filter((c) => c.action === "notice_shown")).toHaveLength(1);
    // Three hours on, in the same visit: asked again, said again.
    answers.push(reply({ showNotice: true }));
    type("Hello again");
    await send();
    expect(calls.filter((c) => c.action === "notice_shown")).toHaveLength(2);
  });

  it("the notice is only said to be shown once it's in view", async () => {
    let inView: ((entries: { isIntersecting: boolean }[], observer: { disconnect: () => void }) => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof inView) {
          inView = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    await open();
    answers.push(reply({ showNotice: true }));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-notice")).toBeInTheDocument();
    inView?.([{ isIntersecting: false }], { disconnect() {} });
    expect(calls.filter((c) => c.action === "notice_shown")).toHaveLength(0);
    inView?.([{ isIntersecting: true }], { disconnect() {} });
    expect(calls.filter((c) => c.action === "notice_shown")).toHaveLength(1);
  });

  it("nothing about the text or a flag reaches browser storage", async () => {
    await open();
    answers.push(reply({ openCard: true, showHelp: true }));
    type("A marker in the box");
    expect(localStorage.length + sessionStorage.length).toBe(0);
    await send();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});

describe("BoConversation: where a send leaves the page (UX, #205)", () => {
  let moves: { to: string | undefined; block: ScrollLogicalPosition | undefined }[];
  let above: string[];
  const realRect = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    moves = [];
    above = [];
    Element.prototype.scrollIntoView = function (this: Element, options?: boolean | ScrollIntoViewOptions) {
      moves.push({ to: (this as HTMLElement).dataset.testid, block: (options as ScrollIntoViewOptions)?.block });
    };
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return { top: above.includes((this as HTMLElement).dataset.testid ?? "") ? -139 : 200 } as DOMRect;
    };
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
    Element.prototype.getBoundingClientRect = realRect;
  });
  const startOf = (id: string) => moves.filter((m) => m.block === "start" && m.to === id);
  // A reply whose reading runs this, as it comes, once Send has moved the page. Plain events:
  // fireEvent's act here ends the send's own act early, before the reply has landed.
  const whileItComes = (event: () => void) => ({
    ...reply(),
    get status() {
      event();
      moves = [];
      return "ok";
    },
  });

  it.each([
    ["a failed Send", "bo-problem", { status: "error", code: "bo_failed" }],
    ["the notice", "bo-notice", reply({ showNotice: true })],
    ["a full conversation", "bo-full", reply({ conversationFull: true })],
  ])("%s starting above the window: the page goes to its start", async (_name, id, answer) => {
    above = [id];
    await open();
    answers.push(answer);
    type("Hello");
    await send();
    expect(startOf(id).length).toBeGreaterThan(0);
    expect(moves.at(-1)).toMatchObject({ to: id, block: "start" });
  });

  it("all of it in view: the page stays at its end", async () => {
    await open();
    answers.push({ status: "error", code: "bo_failed" });
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-problem")).toBeInTheDocument();
    expect(moves.filter((m) => m.block === "start")).toEqual([]);
  });

  it("a new reply that doesn't fit: the page goes to its start", async () => {
    above = ["bo-message-ai"];
    await open();
    answers.push(reply());
    type("Hello");
    await send();
    expect(moves.at(-1)).toMatchObject({ to: "bo-message-ai", block: "start" });
  });

  it("a reply that fits: the page stays at its end", async () => {
    await open();
    answers.push(reply());
    type("Hello");
    await send();
    expect(moves.filter((m) => m.block === "start")).toEqual([]);
  });

  it("scrolled away while the reply came: the page stays where they went", async () => {
    above = ["bo-message-ai"];
    await open();
    answers.push(whileItComes(() => window.dispatchEvent(new Event("wheel"))));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-message-ai")).toBeInTheDocument();
    expect(moves).toEqual([]);
  });

  it.each([
    ["a finger", () => window.dispatchEvent(new Event("touchmove"))],
    ["a key", () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }))],
  ])("scrolled away by %s: the same", async (_name, scroll) => {
    above = ["bo-message-ai"];
    await open();
    answers.push(whileItComes(scroll));
    type("Hello");
    await send();
    expect(screen.getByTestId("bo-message-ai")).toBeInTheDocument();
    expect(moves).toEqual([]);
  });

  it("the page moving by itself, as when a phone's keyboard closes, isn't the person: it goes to the reply", async () => {
    above = ["bo-message-ai"];
    await open();
    answers.push(whileItComes(() => window.dispatchEvent(new Event("scroll"))));
    type("Hello");
    await send();
    expect(moves.at(-1)).toMatchObject({ to: "bo-message-ai", block: "start" });
  });

  it("an arrow key in the box isn't scrolling, and the next send starts afresh", async () => {
    above = ["bo-message-ai"];
    await open();
    answers.push(whileItComes(() => screen.getByTestId("bo-text").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }))));
    type("Hello");
    await send();
    expect(moves.at(-1)).toMatchObject({ to: "bo-message-ai", block: "start" });
    answers.push(whileItComes(() => window.dispatchEvent(new Event("wheel"))), reply());
    type("Again");
    await send();
    expect(screen.getAllByTestId("bo-message-ai")).toHaveLength(2);
    expect(moves).toEqual([]);
    type("Once more");
    await send();
    expect(moves.at(-1)).toMatchObject({ to: "bo-message-ai", block: "start" });
  });

  it("a kept conversation on opening isn't a new reply", async () => {
    above = ["bo-message-ai"];
    await open([{ id: "1", author: "ai", body: "Hello" }]);
    expect(startOf("bo-message-ai")).toEqual([]);
  });

  it("a notice with a reply: above that reply, and the page goes to the notice's start (UX)", async () => {
    above = ["bo-notice", "bo-message-ai"];
    await open();
    answers.push(reply({ showNotice: true }));
    type("Hello");
    await send();
    const notice = screen.getByTestId("bo-notice");
    expect(screen.getByTestId("bo-message-person").compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(screen.getByTestId("bo-message-ai")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(moves.at(-1)).toMatchObject({ to: "bo-notice", block: "start" });
  });

  it("a later notice moves to its own reply: one notice, above the newest", async () => {
    await open();
    answers.push(reply({ showNotice: true }), reply({ showNotice: true }));
    type("Hello");
    await send();
    type("Hello again");
    await send();
    const replies = screen.getAllByTestId("bo-message-ai");
    expect(replies).toHaveLength(2);
    const notice = screen.getByTestId("bo-notice");
    expect(replies[0].compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(replies[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an earlier send's notice doesn't pull the page back", async () => {
    above = ["bo-notice"];
    await open();
    answers.push(reply({ showNotice: true }), reply());
    type("Hello");
    await send();
    moves = [];
    type("Hello again");
    await send();
    expect(startOf("bo-notice")).toEqual([]);
  });
});

describe("BoConversation: focus from Bo's button (UX, from A4)", () => {
  it("opened by the button: the heading has focus; leaving marks the way back", async () => {
    const boFocus = await import("./boFocus");
    boFocus.markOpenedByButton();
    await open();
    expect(screen.getByRole("heading", { level: 1, name: b.screenLine })).toHaveFocus();
    cleanup();
    expect(boFocus.takeLeftBo()).toBe(true);
  });

  it("opened any other way: focus isn't moved", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1, name: b.screenLine })).not.toHaveFocus();
  });
});

describe("BoConversation: what's typed while a send waits is kept (B5, on paper)", () => {
  const held = () => {
    let answer: (value: unknown) => void = () => {};
    answers.push(new Promise((done) => (answer = done)));
    return (value: unknown) => answer(value);
  };

  it("more typed after what went: only what went leaves the box", async () => {
    await open();
    const answer = held();
    type("Hello");
    fireEvent.click(screen.getByTestId("bo-send"));
    type("Hello and one more thing");
    await act(async () => answer(reply()));
    expect(screen.getByTestId("bo-text")).toHaveValue("and one more thing");
  });

  it("something else typed instead: it's all kept", async () => {
    await open();
    const answer = held();
    type("Hello");
    fireEvent.click(screen.getByTestId("bo-send"));
    type("Something else");
    await act(async () => answer(reply()));
    expect(screen.getByTestId("bo-text")).toHaveValue("Something else");
  });

  it("nothing typed meanwhile: the box empties, as before", async () => {
    await open();
    const answer = held();
    type("Hello");
    fireEvent.click(screen.getByTestId("bo-send"));
    await act(async () => answer(reply()));
    expect(screen.getByTestId("bo-text")).toHaveValue("");
  });
});
