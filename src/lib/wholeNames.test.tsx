import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { wholeNames, wholeNamesHtml, WHOLE_NAME_CLASS } from "./wholeNames";

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
