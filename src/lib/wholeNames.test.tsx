import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KEEP_TOGETHER_CLASS, wholeNames, wholeNamesHtml, WHOLE_NAME_CLASS, WHOLE_NAMES } from "./wholeNames";

// The global large-text rule (globals.css) only hyphenates words of `hyphenate-limit-chars`' first number of letters or
// more. Every word of every name is shorter, so a name can never hyphenate anywhere, wrapped or not (UX, 20 Nov: "MOOD- /
// BOW" on Me's Plus banner). A longer name would need that number raised, or the name wrapped wherever it shows.
describe("no name is long enough for the large-text hyphen rule", () => {
  it("every word of every name, and of the products' names, is shorter than the rule's minimum", () => {
    const min = Number(readFileSync("src/app/globals.css", "utf8").match(/hyphenate-limit-chars:\s*(\d+)\s+\d+\s+\d+/)?.[1]);
    expect(min).toBeGreaterThan(0);
    for (const name of [...WHOLE_NAMES, "Moodbow Plus", "Moodbow AI Lite"]) {
      for (const word of name.split(/\s+/)) expect(word.length, `${word} (in "${name}") against ${min}`).toBeLessThan(min);
    }
  });
});

describe("names never hyphenate", () => {
  it("wraps each name in text, and leaves the words around it as they were", () => {
    const { container } = render(<p>{wholeNames("Moodbow is run by Vitor Carvalho, trading as BurrowSoft, Thailand.")}</p>);
    expect(container.textContent).toBe("Moodbow is run by Vitor Carvalho, trading as BurrowSoft, Thailand.");
    expect([...container.querySelectorAll("span")].map((s) => [s.textContent, s.className])).toEqual([
      ["Moodbow", WHOLE_NAME_CLASS],
      ["Vitor Carvalho", WHOLE_NAME_CLASS],
      ["BurrowSoft", WHOLE_NAME_CLASS],
    ]);
  });
  it("leaves text without a name as plain text, and lowercase addresses alone", () => {
    expect(wholeNames("Email support@moodbow.com.")).toBe("Email support@moodbow.com.");
  });
  it("in HTML, only between tags: an address or attribute keeps its words", () => {
    const html = '<p>Vitor Carvalho at <a href="https://www.moodbow.com/Moodbow">Moodbow</a></p>';
    expect(wholeNamesHtml(html)).toBe(
      `<p><span class="${WHOLE_NAME_CLASS}">Vitor Carvalho</span> at <a href="https://www.moodbow.com/Moodbow"><span class="${WHOLE_NAME_CLASS}">Moodbow</span></a></p>`,
    );
  });
});

describe("a suspended compound stays on one line (German: 'und -Berichte')", () => {
  it("wraps the word that starts with a hyphen, and only that one; the text is unchanged", () => {
    const { container } = render(<p>{wholeNames("KI-Reflexionen und -Berichte (optional)")}</p>);
    expect(container.textContent).toBe("KI-Reflexionen und -Berichte (optional)");
    expect([...container.querySelectorAll("span")].map((s) => [s.textContent, s.className])).toEqual([["-Berichte", KEEP_TOGETHER_CLASS]]);
  });
  it("leaves a hyphen inside a word, a dash between words, and other languages alone", () => {
    expect(wholeNames("A 10-second check-in")).toBe("A 10-second check-in");
    expect(wholeNames("Today - a quiet day")).toBe("Today - a quiet day");
    expect(wholeNames("AI reflections and reports (optional)")).toBe("AI reflections and reports (optional)");
  });
  it("works beside a name", () => {
    const { container } = render(<p>{wholeNames("Moodbow-Tipps und -Berichte")}</p>);
    expect([...container.querySelectorAll("span")].map((s) => s.textContent)).toEqual(["Moodbow", "-Berichte"]);
  });
});
