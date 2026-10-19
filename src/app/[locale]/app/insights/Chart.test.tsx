import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STEP_HEX } from "@/lib/journal/valueColours";
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
