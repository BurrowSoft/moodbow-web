import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { PROMPTS } from "@/lib/journal/prompts";
import { LIBRARY, LIBRARY_PLACE_KEY } from "@/lib/journal/promptLibrary";

// Prompts that follow your mood (1.4 E) in the editor: the rule is lib/journal/moodPrompts (its
// contract cases); here, what the line shows and does.
vi.mock("./actions", () => ({ saveEntry: vi.fn(), deleteEntry: vi.fn(), getEntry: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/SafetyCard", () => ({
  GetHelpNow: ({ testId, counted }: { testId: string; counted?: boolean }) => <button data-testid={testId} data-counted={String(!!counted)} />,
  SafetyCard: () => null,
}));
const { EntryEditor } = await import("./EntryEditor");

// 2026-11-18: dayNumber 20775, so the daily list's prompt16 and each group's 4th prompt.
const DAY = "2026-11-18";
const group = (id: string) => LIBRARY.find((g) => g.id === id)!;
const daily = (id: string) => PROMPTS.find((p) => p.id === id)!.en;
const lib = (g: string, n: number) => group(g).prompts[n].en;

const renderIt = (moodPrompt: { mood: number | null; plus: boolean } | undefined) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EntryEditor initial={null} newId="11111111-1111-4111-8111-111111111111" uid="u1" today={DAY} promptDate={DAY} moodPrompt={moodPrompt} />
    </NextIntlClientProvider>,
  );
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("the editor's mood prompt", () => {
  it("Free, a low mood: the hard-days prompt of the day, with its own uncounted help; Another goes back to the daily list", () => {
    renderIt({ mood: 2, plus: false });
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(lib("hard-days", 3));
    expect(screen.getByTestId("entry-prompt-help").dataset.counted).toBe("false");
    fireEvent.click(screen.getByTestId("entry-prompt-another"));
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(daily("prompt16"));
    expect(screen.queryByTestId("entry-prompt-help")).toBeNull();
    fireEvent.click(screen.getByTestId("entry-prompt-another"));
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(daily("prompt17"));
  });

  it("Free, an okay or good mood: noticing or gratitude, and no help", () => {
    renderIt({ mood: 3, plus: false });
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(lib("noticing", 3));
    expect(screen.queryByTestId("entry-prompt-help")).toBeNull();
    cleanup();
    renderIt({ mood: 5, plus: false });
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(lib("gratitude", 3));
  });

  it("no check-in today: the day's prompt, as before", () => {
    renderIt({ mood: null, plus: false });
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(daily("prompt16"));
  });

  it("Plus: from the saved place in the group; Another steps on and saves it, wrapping", () => {
    window.localStorage.setItem(LIBRARY_PLACE_KEY, JSON.stringify({ u1: { gratitude: 5 } }));
    renderIt({ mood: 4, plus: true });
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(lib("gratitude", 5));
    fireEvent.click(screen.getByTestId("entry-prompt-another"));
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(lib("gratitude", 0));
    expect(JSON.parse(window.localStorage.getItem(LIBRARY_PLACE_KEY)!).u1.gratitude).toBe(0);
  });

  it("off (no moodPrompt): the day's prompt even with a check-in", () => {
    renderIt(undefined);
    expect(screen.getByTestId("entry-prompt-text")).toHaveTextContent(daily("prompt16"));
    expect(screen.queryByTestId("entry-prompt-help")).toBeNull();
  });
});
