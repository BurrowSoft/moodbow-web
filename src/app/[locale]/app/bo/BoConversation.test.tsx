import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { boCardMayOpen, type BoMessage } from "@/lib/journal/bo";
import { BoConversation } from "./BoConversation";

// Bo's screen against a stubbed /api/bo: the function's real contract isn't deployed
// yet (#182), so these prove the screen's side of supabase/contracts/bo.md only.
const b = messages.bo;
const ok = { status: "ok", available: true, pictures: false, maxChars: 2000 };
const reply = (over: object = {}) => ({ status: "ok", reply: "A reply", showHelp: false, openCard: false, showNotice: false, conversationFull: false, ...over });
const flagged = CRISIS_KEYWORDS?.languages.en.phrases[0] as string;

let answers: unknown[];
let calls: { action: string; client_key?: string; text?: string }[];

beforeEach(() => {
  answers = [];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as (typeof calls)[number];
      calls.push(body);
      if (body.action === "status") return { json: async () => ok };
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

async function open(initial: BoMessage[] = []) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoConversation initial={initial} country="NZ" healthData />
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
    expect(screen.getByText(b.smallLine)).toBeInTheDocument();
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
    ["region_unknown", b.regionUnknown],
    ["bo_resting", b.resting],
    ["bo_unavailable", b.unavailable],
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
