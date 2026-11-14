import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STEP_HEX } from "@/lib/journal/valueColours";
import { MoodPair } from "./MoodPair";

afterEach(cleanup);
const one = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

describe("MoodPair: a comparison as colour bars (14 Nov)", () => {
  it("one image named by the full sentence; both values in text; the difference as a signed chip", () => {
    render(<MoodPair sentence="On days with Walk, your mood averaged 4.1 of 5. On days without it, 3.2." a={4.1} b={3.2} format={(v) => one.format(v)} signed={(v) => signed.format(v)} testId="pair" />);
    const pair = screen.getByRole("img", { name: "On days with Walk, your mood averaged 4.1 of 5. On days without it, 3.2." });
    expect(pair).toHaveTextContent("4.1");
    expect(pair).toHaveTextContent("3.2");
    expect(screen.getByTestId("pair-diff")).toHaveTextContent("+0.9");
  });
  it("the chip agrees with the values as shown: 3.86 and 3.54 read 3.9 and 3.5, so +0.4 (the Reviewer)", () => {
    render(<MoodPair sentence="s" a={3.86} b={3.54} format={(v) => one.format(v)} signed={(v) => signed.format(v)} testId="pair" />);
    expect(screen.getByTestId("pair")).toHaveTextContent("3.9");
    expect(screen.getByTestId("pair")).toHaveTextContent("3.5");
    expect(screen.getByTestId("pair-diff")).toHaveTextContent("+0.4");
  });
  it("BOTH bars take their own value's mood colour, rounded to the nearest step, each outlined", () => {
    render(<MoodPair sentence="s" a={4.1} b={2.6} format={(v) => one.format(v)} signed={(v) => signed.format(v)} testId="pair" />);
    const bars = [...screen.getByTestId("pair").querySelectorAll<HTMLElement>("span[style]")];
    expect(bars.map((b) => b.style.backgroundColor)).toEqual([rgb(STEP_HEX[3]), rgb(STEP_HEX[2])]);
    for (const b of bars) expect(b.className).toContain("border");
  });
});
