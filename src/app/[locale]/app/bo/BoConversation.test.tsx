import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { CRISIS_KEYWORDS } from "@/lib/safety/keywords";
import { boCardMayOpen, type BoMessage } from "@/lib/journal/bo";
import { BoConversation } from "./BoConversation";

const prepare = vi.fn(async (_file: File): Promise<unknown> => ({ ok: true, blob: new Blob(["jpeg"]), base64: "QUJD", width: 10, height: 10 }));
vi.mock("@/lib/journal/boPicture", () => ({ BO_PICTURE_ACCEPT: "image/jpeg", preparePicture: (file: File) => prepare(file) }));

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

async function open(initial: BoMessage[] = [], consented = true, picturesAllowed = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BoConversation initial={initial} country="NZ" healthData consented={consented} picturesAllowed={picturesAllowed} />
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

  describe("pictures", () => {
    const offered = { ...ok, pictures: true };
    const fileIn = (name = "x.jpg") => fireEvent.change(screen.getByTestId("bo-picture-input"), { target: { files: [new File(["x"], name, { type: "image/jpeg" })] } });
    const choose = async () => {
      fireEvent.click(screen.getByTestId("bo-picture-add"));
      fireEvent.click(screen.getByTestId("bo-picture-consent-accept"));
      fileIn();
      await act(async () => {});
    };
    beforeEach(() => {
      statusAnswer = offered;
      URL.createObjectURL = vi.fn(() => "blob:made-here");
      URL.revokeObjectURL = vi.fn();
    });

    it("not offered unless both the flag and the function say so", async () => {
      await open([], true, true);
      expect(screen.getByTestId("bo-picture-add")).toBeInTheDocument();
      cleanup();
      await open([], true, false);
      expect(screen.queryByTestId("bo-picture-add")).toBeNull();
      cleanup();
      statusAnswer = ok;
      await open([], true, true);
      expect(screen.queryByTestId("bo-picture-add")).toBeNull();
    });

    it("a file input with no capture, so no camera", async () => {
      await open([], true, true);
      expect(screen.getByTestId("bo-picture-input")).not.toHaveAttribute("capture");
      expect(screen.getByTestId("bo-picture-input")).toHaveAttribute("type", "file");
    });

    it("the first picture has its own moment; declining sends nothing, and text still works", async () => {
      await open([], true, true);
      fireEvent.click(screen.getByTestId("bo-picture-add"));
      expect(screen.getByTestId("bo-picture-consent-body")).toHaveTextContent("Anthropic");
      fireEvent.click(screen.getByTestId("bo-picture-consent-decline"));
      expect(screen.queryByTestId("bo-picture-consent")).toBeNull();
      expect(screen.queryByTestId("bo-picture-preview")).toBeNull();
      expect(sends()).toHaveLength(0);
      answers.push(reply());
      type("Hello");
      await send();
      expect(sends()[0]).not.toHaveProperty("picture");
    });

    it("sends only the re-encoded bytes, with no file name; shown for the visit; text is optional", async () => {
      await open([], true, true);
      await choose();
      expect(screen.getByTestId("bo-picture-preview")).toHaveAttribute("src", "blob:made-here");
      answers.push(reply());
      await send();
      expect(sends()[0]).toMatchObject({ text: "", picture: { media_type: "image/jpeg", data: "QUJD" } });
      expect(JSON.stringify(sends()[0])).not.toContain("x.jpg");
      expect(screen.getByTestId("bo-message-picture")).toHaveAttribute("src", "blob:made-here");
      expect(screen.queryByTestId("bo-picture-preview")).toBeNull();
    });

    it("what can't be decoded gets the kind line, and nothing goes out", async () => {
      prepare.mockResolvedValueOnce({ ok: false });
      await open([], true, true);
      await choose();
      expect(screen.getByTestId("bo-picture-unreadable")).toHaveTextContent(b.pictureUnreadable);
      expect(screen.getByTestId("bo-send")).toBeDisabled();
      expect(sends()).toHaveLength(0);
    });

    it("a retry sends the same key and the picture again", async () => {
      await open([], true, true);
      await choose();
      answers.push({ status: "error", code: "bo_failed" }, reply());
      await send();
      fireEvent.click(screen.getByTestId("bo-retry"));
      await act(async () => {});
      expect(sends()[1].client_key).toBe(sends()[0].client_key);
      expect(sends()[1]).toHaveProperty("picture");
    });

    it("the day's pictures used, or pictures off: the line, help, and the text can still go", async () => {
      await open([], true, true);
      await choose();
      answers.push({ status: "error", code: "picture_limit" });
      type("Hello");
      await send();
      expect(screen.getByTestId("bo-problem")).toHaveTextContent(b.pictureLimit);
      expect(screen.queryByTestId("bo-picture-preview")).toBeNull();
      expect(screen.getByTestId("bo-text")).toHaveValue("Hello");
      expect(screen.getByTestId("bo-get-help")).toBeInTheDocument();
    });

    it("crisis words with a picture still open the card", async () => {
      await open([], true, true);
      await choose();
      answers.push(reply());
      type(flagged);
      await send();
      expect(screen.getByTestId("safety-card")).toBeInTheDocument();
    });

    it("after a reload: the placeholder, never a picture", async () => {
      await open([{ id: "1", author: "person", body: "", hasPicture: true }], true, true);
      expect(screen.getByTestId("bo-message-photo")).toHaveTextContent(b.pictureStored);
      expect(screen.queryByTestId("bo-message-picture")).toBeNull();
    });

    it("the object URLs go with the screen, and nothing reaches browser storage", async () => {
      await open([], true, true);
      await choose();
      expect(localStorage.length + sessionStorage.length).toBe(0);
      cleanup();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:made-here");
    });
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
