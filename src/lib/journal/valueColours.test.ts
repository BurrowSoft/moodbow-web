// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import colourMap from "../../../content/contracts/colour-map.json";
import { MOOD_COLOURS, STEP_HEX, valueHex, valueStep, type ValueKey } from "./valueColours";

describe("value colours (colour-map.json, decision 150)", () => {
  it("map every row of the contract's fixture to its step", () => {
    for (const [key, value, step] of colourMap.fixture as [ValueKey, number, number | null][]) {
      expect(valueStep(key, value), `${key} ${value}`).toBe(step);
    }
  });

  it("read numeric columns that come back as strings", () => {
    expect(valueStep("sleep_hours", "7.5")).toBe(5);
    expect(valueHex("exercise_minutes", "0")).toBeNull();
  });

  it("the steps are the contract's five, and mood's classes match them", () => {
    expect(STEP_HEX).toEqual(["#7F8CB8", "#A99BD1", "#E6C7D3", "#F4A77A", "#F3C24F"]);
    expect(MOOD_COLOURS.map((c) => c.match(/#[0-9a-f]{6}/i)![0].toUpperCase())).toEqual(STEP_HEX);
    expect(valueHex("stress", 1)).toBe(STEP_HEX[4]);
  });

  it("no Sunrise colour is written anywhere else in src (tests aside)", () => {
    const src = join(__dirname, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(src);
    const hexes = STEP_HEX.map((h) => h.slice(1).toLowerCase());
    const offenders = files.filter((f) => !f.endsWith("valueColours.ts") && hexes.some((h) => readFileSync(f, "utf8").toLowerCase().includes(`#${h}`)));
    expect(offenders.map((f) => relative(src, f))).toEqual([]);
  });
});
