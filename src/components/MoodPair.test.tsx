import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STEP_HEX } from "@/lib/journal/valueColours";
import { MoodPair } from "./MoodPair";

afterEach(cleanup);
const one = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const TITLE = "“Walk”";
const pair = (a: number, b: number, sentence = "s") =>
  render(<MoodPair sentence={sentence} title={TITLE} labels={["With Walk", "Other days"]} a={a} b={b} format={(v) => one.format(v)} signed={(v) => signed.format(v)} testId="pair" />);

describe("MoodPair: board 3's layout (UX, 14 Nov)", () => {
  it("one image named by the full sentence; the title and the signed chip in the header; labelled rows with their values; no visible sentence", () => {
    const sentence = "On days with “Walk”, your mood averaged 4.1 of 5; on other days, 3.2.";
    pair(4.1, 3.2, sentence);
    const img = screen.getByRole("img", { name: sentence });
    expect(img).toHaveTextContent("“Walk”");
    expect(img).toHaveTextContent("With Walk");
    expect(img).toHaveTextContent("Other days");
    expect(img).toHaveTextContent("4.1");
    expect(img).toHaveTextContent("3.2");
    expect(img.textContent).not.toContain("averaged");
    const chip = screen.getByTestId("pair-diff");
    expect(chip).toHaveTextContent("+0.9");
    // The warm chip (#FCEBDD, ink #8A4B2E), through its tokens.
    expect(chip.className).toContain("bg-pair-chip");
    expect(chip.className).toContain("text-pair-chip-ink");
  });
  it("the chip agrees with the values as shown: 3.86 and 3.54 read 3.9 and 3.5, so +0.4 (the Reviewer)", () => {
    pair(3.86, 3.54);
    expect(screen.getByTestId("pair")).toHaveTextContent("3.9");
    expect(screen.getByTestId("pair")).toHaveTextContent("3.5");
    expect(screen.getByTestId("pair-diff")).toHaveTextContent("+0.4");
  });
  it("each bar in its track at v/5 of it (4.1 → 82 %, 3.2 → 64 %)", () => {
    pair(4.1, 3.2);
    const tracks = screen.getAllByTestId("pair-track");
    expect(tracks).toHaveLength(2);
    for (const t of tracks) expect(t.className).toContain("bg-pair-track");
    const bars = screen.getAllByTestId("pair-bar");
    expect(bars.map((b) => parseFloat(b.style.width))).toEqual([82, 64]);
    for (const [i, b] of bars.entries()) expect(tracks[i]).toContainElement(b);
  });
  it("BOTH bars take their own value's mood colour, rounded to the nearest step, each outlined", () => {
    pair(4.1, 2.6);
    const bars = screen.getAllByTestId("pair-bar");
    expect(bars.map((b) => b.style.backgroundColor)).toEqual([rgb(STEP_HEX[3]), rgb(STEP_HEX[2])]);
    for (const b of bars) expect(b.className).toContain("border");
  });
});
