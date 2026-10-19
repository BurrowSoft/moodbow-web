import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

vi.mock("./actions", () => ({ completeSetup: vi.fn() }));
const { SetupForm } = await import("./SetupForm");
afterEach(cleanup);

const o = messages.onboarding;
const ai = messages.ai;
const renderIt = (askAi: boolean) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SetupForm askAi={askAi} />
    </NextIntlClientProvider>,
  );
const sent = () => [...new FormData(document.querySelector("form")!).entries()];

describe("SetupForm (r1 Make it yours)", () => {
  it("AI off at Consent: the reminder only", () => {
    renderIt(false);
    expect(screen.queryByRole("group", { name: o.setupFocusTitle })).toBeNull();
    expect(screen.queryByRole("group", { name: o.setupToneTitle })).toBeNull();
    expect(screen.getByTestId("setup-reminder-time")).toBeInTheDocument();
    expect(sent().map(([k]) => k)).not.toContain("tone");
  });

  it("AI on: focus chips (multi-select) and the Tone radio list with hints, Warm by default", () => {
    renderIt(true);
    const focus = screen.getByRole("group", { name: o.setupFocusTitle });
    expect(focus).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("setup-focus-work"));
    fireEvent.click(screen.getByTestId("setup-focus-sleep"));
    expect(screen.getByTestId("setup-focus-work")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("setup-focus-work"));
    expect(screen.getByTestId("setup-focus-work")).toHaveAttribute("aria-pressed", "false");

    const tone = screen.getByRole("group", { name: o.setupToneTitle });
    expect(tone).toHaveTextContent(ai.toneWarmHint);
    expect(tone).toHaveTextContent(ai.toneDirectHint);
    // Named by the tone, described by its hint.
    const warm = screen.getByRole("radio", { name: ai.toneWarm });
    expect(warm).toBeChecked();
    expect(warm).toHaveAccessibleDescription(ai.toneWarmHint);
    fireEvent.click(screen.getByTestId("setup-tone-brief"));

    expect(sent()).toEqual(expect.arrayContaining([["focus_shown", "1"], ["focus", "sleep"], ["tone", "brief"]]));
    expect(sent().filter(([k]) => k === "focus")).toHaveLength(1);
  });
});
