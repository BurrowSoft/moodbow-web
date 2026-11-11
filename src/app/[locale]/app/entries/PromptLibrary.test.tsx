import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import ptBr from "@/messages/pt-br.json";
import { LIBRARY, readPlace } from "@/lib/journal/promptLibrary";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...rest }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
const { PromptLibrary } = await import("./PromptLibrary");

const e = messages.entry;
const hard = LIBRARY.find((g) => g.id === "hard-days")!;
const noticing = LIBRARY.find((g) => g.id === "noticing")!;
const show = (hasPlus: boolean, onUse = vi.fn(), locale = "en", m: object = messages) => {
  render(
    <NextIntlClientProvider locale={locale} messages={m}>
      <PromptLibrary uid="u1" country="NZ" hasPlus={hasPlus} onUse={onUse} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByTestId("entry-library-open"));
  return onUse;
};
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("the prompt library on Write (UX, 12 Nov)", () => {
  it("closed: one quiet link, Need a prompt?", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PromptLibrary uid="u1" country="NZ" hasPlus={false} onUse={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("entry-library-open")).toHaveTextContent(e.libraryOpen);
    expect(screen.queryByTestId("entry-library")).toBeNull();
  });

  // Plus never appears while writing (UX, 12 Nov): no lock, no sheet, no Plus word on Write.
  it("without Plus (or Plus unreadable): Hard days only, with no lock, no sheet and nothing about Plus", () => {
    show(false);
    const library = screen.getByTestId("entry-library");
    expect(within(library).getAllByRole("button").map((b) => b.getAttribute("data-testid"))).toEqual(["entry-library-group-hard-days"]);
    for (const id of ["noticing", "gratitude", "relationships", "ahead"]) expect(screen.queryByTestId(`entry-library-group-${id}`)).toBeNull();
    expect(library.querySelector("[data-locked]")).toBeNull();
    expect(screen.queryByTestId("plus-sheet")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(library).not.toHaveTextContent(messages.plus.lock);
    fireEvent.click(screen.getByTestId("entry-library-group-hard-days"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("entry-library")).not.toHaveTextContent(messages.plus.lock);
  });

  it("Hard days: its line and Get help now, then its first prompt", () => {
    show(false);
    fireEvent.click(screen.getByTestId("entry-library-group-hard-days"));
    expect(screen.getByTestId("entry-library-intro")).toHaveTextContent(e.libraryHardDaysIntro);
    expect(screen.getByTestId("entry-library-help")).toHaveTextContent(messages.me.meGetHelpNow);
    expect(screen.getByTestId("entry-library-prompt")).toHaveTextContent(hard.prompts[0].en);
  });

  it("with Plus: all five groups in list order; Another steps in list order and is remembered; Back goes to the groups", () => {
    show(true);
    const groups = within(screen.getByTestId("entry-library")).getAllByRole("button");
    expect(groups.map((b) => b.getAttribute("data-testid"))).toEqual(LIBRARY.map((g) => `entry-library-group-${g.id}`));
    fireEvent.click(screen.getByTestId("entry-library-group-noticing"));
    expect(screen.queryByTestId("entry-library-help")).toBeNull();
    expect(screen.getByTestId("entry-library-prompt")).toHaveAttribute("data-prompt-id", "lib-noticing-1");
    fireEvent.click(screen.getByTestId("entry-library-another"));
    expect(screen.getByTestId("entry-library-prompt")).toHaveAttribute("data-prompt-id", "lib-noticing-2");
    expect(readPlace("u1", "noticing")).toBe(1);
    fireEvent.click(screen.getByTestId("entry-library-back"));
    fireEvent.click(screen.getByTestId("entry-library-group-noticing"));
    expect(screen.getByTestId("entry-library-prompt")).toHaveAttribute("data-prompt-id", "lib-noticing-2");
  });

  it("Use this: the prompt goes above the box (the editor's), and the next one is where it starts next time", () => {
    const onUse = show(true);
    fireEvent.click(screen.getByTestId("entry-library-group-noticing"));
    fireEvent.click(screen.getByTestId("entry-library-use"));
    expect(onUse).toHaveBeenCalledWith(noticing.prompts[0].en);
    expect(screen.queryByTestId("entry-library")).toBeNull();
    expect(readPlace("u1", "noticing")).toBe(1);
  });

  it("in the UI language: /pt-br reads pt", () => {
    const onUse = show(true, vi.fn(), "pt-br", ptBr);
    expect(screen.getByTestId("entry-library-group-hard-days")).toHaveTextContent(ptBr.entry.libraryHardDays);
    fireEvent.click(screen.getByTestId("entry-library-group-hard-days"));
    expect(screen.getByTestId("entry-library-prompt")).toHaveTextContent(hard.prompts[0].pt!);
    fireEvent.click(screen.getByTestId("entry-library-use"));
    expect(onUse).toHaveBeenCalledWith(hard.prompts[0].pt);
  });
});
