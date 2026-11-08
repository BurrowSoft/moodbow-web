import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { BO_STATUS_FRESH_MS, useBoStatus } from "./useBoStatus";

let answer: unknown;
const calls: Record<string, unknown>[] = [];
beforeEach(() => {
  sessionStorage.clear();
  calls.length = 0;
  answer = { status: "ok", available: true, reason: null, pictures: false, maxChars: 2000 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body) as Record<string, unknown>);
      return { json: async () => answer };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Probe({ uid }: { uid: string }) {
  const status = useBoStatus(uid);
  return <p data-testid="probe">{status === null ? "none" : status.status === "ok" ? `${status.available}:${status.reason}` : status.status}</p>;
}
const show = (uid = "u1", locale = "en") =>
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Probe uid={uid} />
    </NextIntlClientProvider>,
  );

describe("useBoStatus: asked once the page is on screen, kept for a few minutes", () => {
  it("nothing until the status answers, then its answer; it asks in the page's language", async () => {
    show("u1", "fr");
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true:null"));
    expect(calls).toEqual([{ action: "status", language: "fr" }]);
  });

  it("a no with its reason", async () => {
    answer = { status: "ok", available: false, reason: "budget", pictures: false, maxChars: 2000 };
    show();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false:budget"));
  });

  it("no answer, or an error: nothing, as if Bo were off, and nothing kept", async () => {
    answer = { status: "no_answer" };
    show();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.getByTestId("probe")).toHaveTextContent("none");
    expect(sessionStorage.length).toBe(0);
  });

  it("the next page in this tab uses the kept answer, without asking again", async () => {
    show();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true:null"));
    cleanup();
    show();
    expect(await screen.findByText("true:null")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("another account, another language, or an old answer: asked again", async () => {
    show("u1");
    await waitFor(() => expect(calls).toHaveLength(1));
    cleanup();
    show("u2");
    await waitFor(() => expect(calls).toHaveLength(2));
    cleanup();
    show("u2", "es");
    await waitFor(() => expect(calls).toHaveLength(3));
    cleanup();
    const kept = JSON.parse(sessionStorage.getItem("moodbow.bo-status")!) as { at: number };
    sessionStorage.setItem("moodbow.bo-status", JSON.stringify({ ...JSON.parse(sessionStorage.getItem("moodbow.bo-status")!), at: kept.at - BO_STATUS_FRESH_MS }));
    show("u2", "es");
    await waitFor(() => expect(calls).toHaveLength(4));
  });

  it("storage that throws is only a lost convenience", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true:null"));
    vi.restoreAllMocks();
  });
});
