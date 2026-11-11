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
const OFFER = { offer: { trial: true, price: "US$59.99" } };
const show = (plus: React.ComponentProps<typeof PromptLibrary>["plus"], onUse = vi.fn(), locale = "en", m: object = messages) => {
  render(
    <NextIntlClientProvider locale={locale} messages={m}>
      <PromptLibrary uid="u1" country="NZ" plus={plus} onUse={onUse} />
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
        <PromptLibrary uid="u1" country="NZ" plus={OFFER} onUse={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("entry-library-open")).toHaveTextContent(e.libraryOpen);
    expect(screen.queryByTestId("entry-library")).toBeNull();
  });

  it("without Plus: the five groups in list order, Hard days open, the other four locked with the sheet", () => {
    show(OFFER);
    const groups = within(screen.getByTestId("entry-library")).getAllByRole("button");
    expect(groups.map((b) => b.getAttribute("data-testid"))).toEqual(LIBRARY.map((g) => `entry-library-group-${g.id}`));
    expect(screen.getByTestId("entry-library-group-hard-days")).not.toHaveAttribute("data-locked");
    for (const id of ["noticing", "gratitude", "relationships", "ahead"]) expect(screen.getByTestId(`entry-library-group-${id}`)).toHaveAttribute("data-locked", "");
    fireEvent.click(screen.getByTestId("entry-library-group-noticing"));
    expect(screen.getByText(messages.plus.sheetPrompts)).toBeInTheDocument();
  });

  it("Hard days: its line and Get help now, then its first prompt", () => {
    show(OFFER);
    fireEvent.click(screen.getByTestId("entry-library-group-hard-days"));
    expect(screen.getByTestId("entry-library-intro")).toHaveTextContent(e.libraryHardDaysIntro);
    expect(screen.getByTestId("entry-library-help")).toHaveTextContent(messages.me.meGetHelpNow);
    expect(screen.getByTestId("entry-library-prompt")).toHaveTextContent(hard.prompts[0].en);
  });

  it("with Plus: every group open; Another steps in list order and is remembered; Back goes to the groups", () => {
    show({ has: true });
    for (const g of LIBRARY) expect(screen.getByTestId(`entry-library-group-${g.id}`)).not.toHaveAttribute("data-locked");
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
    const onUse = show({ has: true });
    fireEvent.click(screen.getByTestId("entry-library-group-noticing"));
    fireEvent.click(screen.getByTestId("entry-library-use"));
    expect(onUse).toHaveBeenCalledWith(noticing.prompts[0].en);
    expect(screen.queryByTestId("entry-library")).toBeNull();
    expect(readPlace("u1", "noticing")).toBe(1);
  });

  it("Plus unreadable: the free group only, never an offer", () => {
    show(null);
    const groups = within(screen.getByTestId("entry-library")).getAllByRole("button");
    expect(groups.map((b) => b.getAttribute("data-testid"))).toEqual(["entry-library-group-hard-days"]);
  });

  it("in the UI language: /pt-br reads pt", () => {
    const onUse = show({ has: true }, vi.fn(), "pt-br", ptBr);
    expect(screen.getByTestId("entry-library-group-hard-days")).toHaveTextContent(ptBr.entry.libraryHardDays);
    fireEvent.click(screen.getByTestId("entry-library-group-hard-days"));
    expect(screen.getByTestId("entry-library-prompt")).toHaveTextContent(hard.prompts[0].pt!);
    fireEvent.click(screen.getByTestId("entry-library-use"));
    expect(onUse).toHaveBeenCalledWith(hard.prompts[0].pt);
  });
});
