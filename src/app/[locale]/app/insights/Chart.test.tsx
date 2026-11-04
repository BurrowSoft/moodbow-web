import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STEP_HEX, valueHex } from "@/lib/journal/valueColours";
import { Chart } from "./Chart";

// The chart colours (decision 150): stored values only, from colour-map.json.
afterEach(cleanup);

const colours = (container: HTMLElement, selector: string) => [...container.querySelectorAll(selector)].map((el) => el.getAttribute("data-value-colour"));

describe("Chart colours", () => {
  it("sleep bars: each in its value's colour, with the outline", () => {
    const { container } = render(<Chart kind="bars" points={[4, 7.5, null, 10, 6]} min={0} max={12} labelledBy="t" colourKey="sleep_hours" gradientId="g" />);
    expect(colours(container, "rect")).toEqual([STEP_HEX[0], STEP_HEX[4], STEP_HEX[3], STEP_HEX[2]]);
    const bar = container.querySelector("rect")!;
    expect(bar).toHaveAttribute("fill", STEP_HEX[0]);
    expect(bar).toHaveAttribute("stroke-width", "1");
  });

  it("movement 0 is a neutral bar: no colour, no guilt", () => {
    const { container } = render(<Chart kind="bars" points={[0, 15, 30]} min={0} max={90} labelledBy="t" colourKey="exercise_minutes" gradientId="g" />);
    expect(colours(container, "rect")).toEqual(["neutral", STEP_HEX[3], STEP_HEX[4]]);
    expect(container.querySelector("rect")).toHaveAttribute("fill", "currentColor");
  });

  it("a stress line: a vertical gradient along the value axis (low stress gold), each point in its own colour", () => {
    const { container } = render(<Chart kind="line" points={[1, 3, null, 5]} min={1} max={5} labelledBy="t" colourKey="stress" gradientId="chart-stress-gradient" />);
    const gradient = container.querySelector("linearGradient#chart-stress-gradient")!;
    expect(gradient).toHaveAttribute("gradientUnits", "userSpaceOnUse");
    expect([...gradient.querySelectorAll("stop")].map((s) => [s.getAttribute("offset"), s.getAttribute("stop-color")])).toEqual([
      ["0", STEP_HEX[4]],
      ["0.25", STEP_HEX[3]],
      ["0.5", STEP_HEX[2]],
      ["0.75", STEP_HEX[1]],
      ["1", STEP_HEX[0]],
    ]);
    expect(container.querySelector("polyline")).toHaveAttribute("stroke", "url(#chart-stress-gradient)");
    expect(colours(container, "g[data-value-colour]")).toEqual([STEP_HEX[4], STEP_HEX[2], STEP_HEX[0]]);
  });
});

// 3 months (app parity, UX 2026-11-04): dots only on isolated days, the
// line carries the rest; Week and Month keep a dot on every day.
describe("Chart dots", () => {
  const dots = (container: HTMLElement) => container.querySelectorAll("g[data-value-colour]").length;
  const line = (points: (number | null)[], mode?: "all" | "isolated") =>
    render(<Chart kind="line" points={points} min={1} max={5} labelledBy="t" colourKey="mood" gradientId="g" dots={mode} />).container;

  it("isolated: a dot only on a day with no value on either side (the ends count as empty)", () => {
    // Day 0 (an end, empty after it) and day 5 (empty both sides) are
    // isolated; days 2–3 and 7–8 each have a neighbour.
    const c = line([3, null, 4, 4, null, 5, null, 2, 2], "isolated");
    expect(colours(c, "g[data-value-colour]")).toEqual([valueHex("mood", 3), valueHex("mood", 5)]);
    // The lines: one per run (days 2–3, 7–8); the isolated days are dots alone.
    expect([...c.querySelectorAll("polyline")].map((p) => p.getAttribute("points")!.split(" ").length)).toEqual([2, 2]);
  });

  it("isolated: a run of days has no dots; a single day alone has its dot", () => {
    expect(dots(line([1, 2, 3, 4, 5], "isolated"))).toBe(0);
    expect(dots(line([null, null, 4, null], "isolated"))).toBe(1);
  });

  it("all (the default, Week and Month): a dot on every day with a value", () => {
    expect(dots(line([3, null, 4, 4, null, 5]))).toBe(4);
    expect(dots(line([3, null, 4, 4, null, 5], "all"))).toBe(4);
  });

  // The line breaks at empty days (app parity, UX 2026-11-04): a line
  // across a gap would invent a value.
  it("a gap splits the line in two; a lone day gets no line, only its dot", () => {
    const lines = (c: HTMLElement) => [...c.querySelectorAll("polyline")].map((p) => p.getAttribute("points"));
    const run = line([2, 3, null, 4, 5]);
    expect(lines(run)).toHaveLength(2);
    // The two lines share no point: nothing is drawn across day 2.
    const [a, b] = lines(run).map((p) => p!.split(" "));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a.some((pt) => b.includes(pt))).toBe(false);
    const lone = line([null, 4, null, null]);
    expect(lines(lone)).toHaveLength(0);
    expect(dots(lone)).toBe(1);
    // The same on 3 months: the lone day's dot is its only mark.
    const lone3 = line([4, 4, null, 3, null], "isolated");
    expect(lines(lone3)).toHaveLength(1);
    expect(colours(lone3, "g[data-value-colour]")).toEqual([valueHex("mood", 3)]);
  });

  it("bars keep their ring whatever the dots", () => {
    const { container } = render(<Chart kind="bars" points={[7, 8, null, 6]} min={0} max={12} labelledBy="t" colourKey="sleep_hours" gradientId="g" dots="isolated" />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    for (const r of container.querySelectorAll("rect")) expect(r).toHaveAttribute("stroke-width", "1");
  });
});
