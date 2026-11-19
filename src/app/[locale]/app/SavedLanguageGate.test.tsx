import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let path = "/app";
let search = "";
let may = true;
const goToLanguage = vi.fn();
const saveRegion = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({ usePathname: () => path, useRouter: () => ({ refresh }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/lib/savedLanguage", () => ({ mayMoveTo: () => may, goToLanguage: (...a: unknown[]) => goToLanguage(...a) }));
vi.mock("@/components/SafetyCard", () => ({ GetHelpNow: ({ testId }: { testId: string }) => <span data-testid={testId} /> }));
vi.mock("@/components/SignedInMark", () => ({ SignedInMark: () => <span data-testid="signed-in-mark" /> }));
vi.mock("./me/actions", () => ({ saveRegion: (...a: unknown[]) => saveRegion(...a) }));
const { SavedLanguageGate, MOVE_WAIT_MS } = await import("./SavedLanguageGate");

// English saved, a Portuguese address (the CI case of #401, the other way round).
const COPY = { lang: "en", setTo: "Your journal is set to English.", continueIn: "Continue in English", switchTo: "Switch to English", stay: "Ficar em Português", close: "Fechar" };
const PAGE = "Hoje";
const gate = (props: { standalone?: boolean } = {}) =>
  render(
    <SavedLanguageGate target="en" here="pt-br" copy={COPY} country="BR" {...props}>
      <p data-testid="page">{PAGE}</p>
    </SavedLanguageGate>,
  );

beforeEach(() => {
  path = "/app";
  search = "";
  may = true;
  goToLanguage.mockReset();
  saveRegion.mockReset();
  refresh.mockReset();
  window.stop = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SavedLanguageGate: never a bare link (#401)", () => {
  it("moving: Get help at once, their language's words with the link to it, a way to stay; the page waits", () => {
    gate();
    expect(goToLanguage).toHaveBeenCalledWith("en", "/app");
    expect(screen.getByTestId("saved-language-help")).toBeTruthy();
    expect(screen.getByTestId("saved-language-help")).not.toHaveAttribute("data-after-wait");
    const link = screen.getByTestId("saved-language-link");
    expect(link).toHaveAttribute("href", "/en/app");
    const words = link.closest("p")!;
    expect(words).toHaveAttribute("lang", "en");
    expect(words.textContent).toBe("Your journal is set to English. Continue in English");
    // Held back 2 s, so a move that goes at once doesn't flash them.
    expect(words).toHaveAttribute("data-after-wait");
    expect(screen.getByTestId("saved-language-stay")).toHaveAttribute("data-after-wait");
    expect(screen.getByTestId("saved-language-stay").textContent).toBe("Ficar em Português");
    // Not mounted while the move is pending: nothing on it happens for a page nobody saw.
    expect(screen.queryByTestId("page")).toBeNull();
  });

  it("no move after 3 s: the page in this language, with the notice offering theirs; not before", () => {
    vi.useFakeTimers();
    gate();
    act(() => void vi.advanceTimersByTime(MOVE_WAIT_MS - 1));
    expect(screen.queryByTestId("page")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByTestId("page")).toBeTruthy();
    const notice = screen.getByTestId("saved-language-notice");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice.querySelector("p")).toHaveAttribute("lang", "en");
    expect(notice.querySelector("p")!.textContent).toBe("Your journal is set to English. Switch to English");
    expect(screen.getByTestId("saved-language-switch")).toHaveAttribute("href", "/en/app");
    expect(screen.queryByTestId("saved-language-redirect")).toBeNull();
  });

  it("the guard holds (it tried moments ago, the cookie didn't stick): the page and the notice at once, no move", async () => {
    may = false;
    gate();
    expect(goToLanguage).not.toHaveBeenCalled();
    expect(await screen.findByTestId("saved-language-notice")).toBeTruthy();
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByTestId("saved-language-redirect")).toBeNull();
  });

  it("the notice closes in this page's language, and the page stays", async () => {
    may = false;
    gate();
    const close = await screen.findByTestId("saved-language-close");
    expect(close).toHaveAttribute("aria-label", "Fechar");
    fireEvent.click(close);
    expect(screen.queryByTestId("saved-language-notice")).toBeNull();
    expect(screen.getByTestId("page")).toBeTruthy();
  });

  it("stay: the move stops, this language becomes theirs (Me's save) and the page refreshes", async () => {
    saveRegion.mockResolvedValue({ ok: true });
    gate();
    await act(async () => void fireEvent.click(screen.getByTestId("saved-language-stay")));
    expect(window.stop).toHaveBeenCalled();
    expect(saveRegion).toHaveBeenCalledWith("locale", "pt-br");
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.queryByTestId("saved-language-notice")).toBeNull();
  });

  it("stay that can't save: the page with the notice, nothing refreshed", async () => {
    saveRegion.mockResolvedValue({ ok: false });
    gate();
    await act(async () => void fireEvent.click(screen.getByTestId("saved-language-stay")));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("page")).toBeTruthy();
    expect(screen.getByTestId("saved-language-notice")).toBeTruthy();
  });

  it("keeps the query, or an expired link would read as confirmed (Reviewer, #196)", () => {
    path = "/email-confirmed";
    search = "result=expired";
    gate();
    expect(screen.getByTestId("saved-language-link")).toHaveAttribute("href", "/en/email-confirmed?result=expired");
  });

  it("standalone (outside the journal): its own main and the signed-in mark while moving", () => {
    gate({ standalone: true });
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(screen.getByTestId("signed-in-mark")).toBeTruthy();
    expect(screen.getByTestId("saved-language-help")).toBeTruthy();
  });
});
