import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { compoundBreak, HelpNumberText } from "./HelpNumberText";
import { WHOLE_NAME_CLASS } from "@/lib/wholeNames";

afterEach(cleanup);
const SOFT = "­";
const line = (text: string, number: string, name?: string) => render(<p>{name ? <HelpNumberText text={text} number={number} name={name} /> : <HelpNumberText text={text} number={number} />}</p>).container;

describe("HelpNumberText: a call line as someone has to read and dial it", () => {
  it("the number is one block, and splits only between its digit groups", () => {
    const c = line("Call 116 123 (116 123)", "116 123");
    const groups = [...c.querySelectorAll("[data-help-number] .whitespace-nowrap")].map((s) => s.textContent);
    expect(groups).toEqual(["116", "123"]);
  });

  it("a brand name: its own block, whole, breaking only at its compound boundary (UX, 20 Nov: 'Telefon- / Seelsorge')", () => {
    const c = line("TelefonSeelsorge anrufen (0800 111 0 111)", "0800 111 0 111", "TelefonSeelsorge");
    const block = c.querySelector("[data-help-name]")!;
    expect(block).toHaveClass("inline-block");
    const brand = block.querySelector(`.${WHOLE_NAME_CLASS}`)!;
    expect(brand.textContent).toBe(`Telefon${SOFT}Seelsorge`);
    // The only change to the text is that one soft hyphen; the number stays its own block.
    expect(c.textContent).toBe(`Telefon${SOFT}Seelsorge anrufen (0800 111 0 111)`);
    expect(c.querySelector("[data-help-number]")!.textContent).toBe("0800 111 0 111");
  });

  it("an ordinary name: its own block, as written (it may hyphenate at large text, by CSS)", () => {
    const c = line("Call Samaritans (116 123)", "116 123", "Samaritans");
    const block = c.querySelector("[data-help-name]")!;
    expect(block.textContent).toBe("Samaritans");
    expect(block.querySelector(`.${WHOLE_NAME_CLASS}`)).toBeNull();
    expect(c.textContent).toBe("Call Samaritans (116 123)");
  });

  it("no name given, or not in the text: the line as before", () => {
    expect(line("Call 112 (112)", "112").querySelector("[data-help-name]")).toBeNull();
    expect(line("Call 112 (112)", "112", "Somewhere").querySelector("[data-help-name]")).toBeNull();
  });

  it("the compound boundary only: lowercase then a capital", () => {
    expect(compoundBreak("TelefonSeelsorge")).toBe(`Telefon${SOFT}Seelsorge`);
    expect(compoundBreak("SOS Amitié")).toBe("SOS Amitié");
    expect(compoundBreak("Samaritans")).toBe("Samaritans");
  });
});
