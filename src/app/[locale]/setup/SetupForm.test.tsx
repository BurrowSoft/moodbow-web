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

describe("SetupForm starts from what's saved (1.3 §6; the Reviewer, #314)", () => {
  const withInitial = (initial: { reminderOn: boolean; reminderTime: string; tone: string; focus: string[] }) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SetupForm askAi initial={initial} />
      </NextIntlClientProvider>,
    );
  it("after first use (the protective default, reminder off): saving without a change keeps it off", () => {
    withInitial({ reminderOn: false, reminderTime: "21:00", tone: "warm", focus: [] });
    expect(screen.getByTestId("setup-reminder-off")).toBeChecked();
    expect(screen.getByTestId("setup-reminder-time")).toBeDisabled();
    expect(sent()).toEqual(expect.arrayContaining([["reminder_off", "on"]]));
  });
  it("a chosen reminder, tone and focus come back as they were", () => {
    withInitial({ reminderOn: true, reminderTime: "07:30", tone: "direct", focus: ["sleep"] });
    expect(screen.getByTestId("setup-reminder-off")).not.toBeChecked();
    expect(screen.getByTestId("setup-reminder-time")).toHaveValue("07:30");
    expect(screen.getByTestId("setup-tone-direct")).toBeChecked();
    expect(screen.getByTestId("setup-focus-sleep")).toHaveAttribute("aria-pressed", "true");
  });
});
