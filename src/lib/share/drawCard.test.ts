import { describe, expect, it, vi } from "vitest";
import { drawCard, wrapLine } from "./drawCard";
import { bands, MOOD_HEX, THEMES } from "./moodbow";

// 10 px per character: easy widths.
const measure = (s: string) => s.length * 10;

describe("wrapLine (the optional line)", () => {
  it("fits on one line when it can", () => {
    expect(wrapLine("A good month", measure, 880, 2)).toEqual(["A good month"]);
  });

  it("breaks between words, at most maxLines, the rest cut with …", () => {
    expect(wrapLine("aaaa bbbb cccc", measure, 90, 2)).toEqual(["aaaa bbbb", "cccc"]);
    expect(wrapLine("aaaa bbbb cccc dddd eeee", measure, 90, 2)).toEqual(["aaaa bbbb", "cccc ddd…"]);
    expect(wrapLine("aaaa bbbb cccc", measure, 90, 1)).toEqual(["aaaa bbb…"]);
  });

  it("a word wider than the line is shortened; empty text gives no line", () => {
    expect(wrapLine("x".repeat(20), measure, 90, 1)).toEqual(["xxxxxxxx…"]);
    expect(wrapLine("   ", measure, 90, 2)).toEqual([]);
  });
});

// A canvas context that records what's drawn.
function recorder() {
  const calls: { op: string; args: unknown[]; state: Record<string, unknown> }[] = [];
  const state: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => calls.push({ op, args, state: { ...state } });
  const ctx = new Proxy(state, {
    get: (target, key: string) => (key in target ? target[key] : key === "measureText" ? (s: string) => ({ width: s.length * 20 }) : record(key)),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("drawCard", () => {
  const content = (over = {}) => ({
    format: "story" as const,
    theme: "dark" as const,
    colours: [MOOD_HEX[0], MOOD_HEX[2], MOOD_HEX[4], MOOD_HEX[1], MOOD_HEX[3]],
    monthLabel: "October 2026",
    daysLabel: "5 days journaled",
    line: "",
    fontFamily: "Poppins, sans-serif",
    logo: null,
    ...over,
  });

  it("the background, one half-circle per check-in at the spec's radii and colours, butt ends", () => {
    const { ctx, calls } = recorder();
    drawCard(ctx, content());
    expect(calls.find((c) => c.op === "fillRect")?.state.fillStyle).toBe(THEMES.dark.background);
    const arcs = calls.filter((c) => c.op === "arc");
    const strokes = calls.filter((c) => c.op === "stroke");
    const { radii, thickness } = bands(5, "story");
    expect(arcs.map((a) => a.args)).toEqual(radii.map((r) => [540, 1100, r, Math.PI, 2 * Math.PI]));
    expect(strokes.map((s) => s.state.strokeStyle)).toEqual(content().colours);
    expect(strokes.every((s) => s.state.lineWidth === thickness && s.state.lineCap === "butt")).toBe(true);
  });

  it("only the month, the count, the optional line and moodbow.com are written", () => {
    const { ctx, calls } = recorder();
    drawCard(ctx, content({ line: "Calmer than September" }));
    expect(calls.filter((c) => c.op === "fillText").map((c) => c.args[0])).toEqual(["October 2026", "5 days journaled", "Calmer than September", "moodbow.com"]);
  });

  it("square: moodbow.com sits beside the logo", () => {
    const { ctx, calls } = recorder();
    const logo = {} as CanvasImageSource;
    drawCard(ctx, content({ format: "square", logo }));
    const image = calls.find((c) => c.op === "drawImage")!;
    const url = calls.filter((c) => c.op === "fillText").at(-1)!;
    const [, left, top, w, h] = image.args as number[];
    expect(h).toBe(48);
    expect(top + h).toBe(1000);
    expect(url.args[1]).toBeCloseTo(left + w + 16, 5);
    vi.restoreAllMocks();
  });
});
