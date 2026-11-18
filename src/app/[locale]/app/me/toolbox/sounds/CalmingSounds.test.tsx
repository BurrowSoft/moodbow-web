import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import type { PlayerState } from "@/lib/sounds/player";

// The calming sounds page (1.4 B) against a mocked player: the app's choices and words, Play →
// Pause/Stop, the time left, the neutral media title, and a stop at sign-out.
const calls: string[] = [];
let emit: (s: PlayerState) => void = () => undefined;
let supported = true;
vi.mock("@/lib/sounds/player", async (orig) => {
  const real = await orig<typeof import("@/lib/sounds/player")>();
  class SoundPlayer {
    constructor(onChange: (s: PlayerState) => void) {
      emit = onChange;
    }
    async play(sound: string, minutes: number | null) {
      calls.push(`play ${sound} ${minutes}`);
      emit({ status: "playing", sound: sound as "rain", endsIn: minutes === null ? null : minutes * 60 });
      return true;
    }
    pause() {
      calls.push("pause");
    }
    async resume() {
      calls.push("resume");
    }
    stop() {
      calls.push("stop");
      emit({ status: "idle" });
    }
    dispose() {
      calls.push("dispose");
    }
    state(): PlayerState {
      return { status: "idle" };
    }
  }
  return { ...real, SoundPlayer, soundsSupported: () => supported };
});
let signOutListener: ((m: { uid: string; mode: string }) => void) | null = null;
vi.mock("@/lib/signOutSignal", () => ({
  onSignOut: (fn: (m: { uid: string; mode: string }) => void) => {
    signOutListener = fn;
    return () => undefined;
  },
}));
const { CalmingSounds } = await import("./CalmingSounds");

const m = messages.sounds;
const show = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CalmingSounds uid="u1" />
    </NextIntlClientProvider>,
  );
beforeEach(() => {
  calls.length = 0;
  supported = true;
});
afterEach(cleanup);

describe("Calming sounds", () => {
  it("the four sounds and the app's timers; Rain and 15 min to start", () => {
    show();
    expect(["rain", "waves", "brown", "hum"].map((id) => screen.getByTestId(`sounds-${id}`).textContent)).toEqual([m.rain, m.waves, m.brown, m.hum]);
    expect(screen.getByTestId("sounds-rain")).toHaveAttribute("aria-pressed", "true");
    expect(["15", "30", "45", "60", "until"].map((k) => screen.getByTestId(`sounds-timer-${k}`).textContent)).toEqual(["15 min", "30 min", "45 min", "60 min", m.untilStop]);
    expect(screen.getByTestId("sounds-timer-15")).toHaveAttribute("aria-pressed", "true");
  });

  it("Play with a timer: Pause and Stop, and the time left", async () => {
    show();
    fireEvent.click(screen.getByTestId("sounds-waves"));
    fireEvent.click(screen.getByTestId("sounds-timer-30"));
    await act(async () => fireEvent.click(screen.getByTestId("sounds-play")));
    expect(calls).toEqual(["play waves 30"]);
    expect(screen.getByTestId("sounds-pause")).toBeInTheDocument();
    expect(screen.getByTestId("sounds-status")).toHaveTextContent("30 min left");
    fireEvent.click(screen.getByTestId("sounds-pause"));
    expect(calls).toContain("pause");
    await act(async () => fireEvent.click(screen.getByTestId("sounds-stop")));
    expect(calls).toContain("stop");
    expect(screen.getByTestId("sounds-play")).toBeInTheDocument();
  });

  it("until I stop: the status says so; another sound while playing switches at once", async () => {
    show();
    fireEvent.click(screen.getByTestId("sounds-timer-until"));
    await act(async () => fireEvent.click(screen.getByTestId("sounds-play")));
    expect(screen.getByTestId("sounds-status")).toHaveTextContent(m.untilStopped);
    await act(async () => fireEvent.click(screen.getByTestId("sounds-hum")));
    expect(calls).toEqual(["play rain null", "play hum null"]);
  });

  it("signing out stops it, everything closed", async () => {
    show();
    await act(async () => fireEvent.click(screen.getByTestId("sounds-play")));
    act(() => signOutListener?.({ uid: "u1", mode: "keep" }));
    expect(calls).toContain("dispose");
  });

  it("leaving the page stops it", async () => {
    show();
    await act(async () => fireEvent.click(screen.getByTestId("sounds-play")));
    cleanup();
    expect(calls).toContain("dispose");
  });

  it("a browser without Web Audio: the line instead", () => {
    supported = false;
    show();
    expect(screen.getByTestId("sounds-unavailable")).toHaveTextContent(m.unavailable);
    expect(screen.queryByTestId("sounds-play")).toBeNull();
  });
});
