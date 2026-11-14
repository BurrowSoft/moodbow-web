// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import conditions from "../../../content/conditions.json";
import { findArticle, renderArticle } from "../helpContent";
import { isPendingMet } from "../legalContent";
import { goodThingsBody, goodThingsLines } from "./goodThings";

// Three good things (1.3; specs/1.3-grounding-and-good-things.md with its Rulings).
const LANGUAGES = ["en", "fr", "es", "pt-br", "de", "it", "th"] as const;
type Messages = { app: { tabMe: string }; entry: Record<string, string>; toolbox: Record<string, string> };
const messages = (l: string) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) as Messages;
const H = "Three good things";

describe("the entry's text", () => {
  it("the heading, then each filled line as a list item, trimmed; blanks left out", () => {
    expect(goodThingsBody(H, ["Tea with Ana", "", " The sun came out "])).toBe("Three good things\n- Tea with Ana\n- The sun came out");
    expect(goodThingsBody(H, ["a", "b", "c"])).toBe("Three good things\n- a\n- b\n- c");
  });

  it("nothing filled: no text at all, so Save waits as for an empty entry", () => {
    expect(goodThingsBody(H, ["", "  ", "\t"])).toBe("");
  });

  it("a kept draft comes back into the fields, in order; any other text gives empty fields", () => {
    expect(goodThingsLines(H, "Three good things\n- a\n- b")).toEqual(["a", "b", ""]);
    expect(goodThingsLines(H, "Three good things\r\n- a\r\n- b\r\n- c")).toEqual(["a", "b", "c"]);
    expect(goodThingsLines(H, "Dear diary")).toEqual(["", "", ""]);
    expect(goodThingsLines(H, "")).toEqual(["", "", ""]);
  });

  it("round trip: what's saved reads back the same", () => {
    const lines = ["One", "Two", "Three"] as const;
    expect(goodThingsLines(H, goodThingsBody(H, lines))).toEqual([...lines]);
  });
});

describe("strings", () => {
  it("en is the spec's copy", () => {
    const e = messages("en").entry;
    expect([e.goodThingsTitle, e.goodThings1, e.goodThings2, e.goodThings3]).toEqual(["Three good things", "One good thing", "Another", "And one more"]);
  });

  it("every language has all four, and no streak or count words in en", () => {
    for (const l of LANGUAGES) {
      const e = messages(l).entry;
      for (const k of ["goodThingsTitle", "goodThings1", "goodThings2", "goodThings3"]) expect(e[k]?.trim(), `${l} ${k}`).toBeTruthy();
    }
    expect(Object.values(messages("en").entry).filter((v) => /streak|in a row|badge/i.test(v))).toEqual([]);
  });
});

// The Help paragraph: shown by either side; the evening reminder only by the app's (Ruling 9).
describe("Help → Things that help me: Three good things", () => {
  const render = (l: string, app: boolean, web: boolean) =>
    renderArticle(findArticle(l, "things-that-help")!, (id) => (id === "app_good_things" ? app : id === "good_things_live" ? web : id === "app_toolbox" || id === "toolbox_live" ? true : isPendingMet(id)))
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  for (const l of LANGUAGES) {
    it(`${l}: bold names are the screen's own; the reminder sentence only with the app`, () => {
      const m = messages(l);
      const names = [m.entry.goodThingsTitle, m.entry.goodThings1, m.entry.goodThings2, m.entry.goodThings3, m.entry.writeButton, m.entry.entrySave, `${m.app.tabMe} → ${m.toolbox.meRow}`];
      const app = render(l, true, false);
      const web = render(l, false, true);
      for (const name of names) {
        expect(app, `${l} app: ${name}`).toContain(`<strong>${name}</strong>`);
        expect(web, `${l} web: ${name}`).toContain(`<strong>${name}</strong>`);
      }
      // The reminder is the paragraph's last sentence, the app's only: the web's is shorter.
      expect(app.length).toBeGreaterThan(web.length);
      expect(render(l, false, false)).not.toContain(`<strong>${m.entry.goodThingsTitle}</strong>`);
    });
  }

  it("not met on either side yet (ships after 1.2)", () => {
    expect(conditions["good-things-live"].met).toBe(false);
    expect(conditions["app-good-things"].met).toBe(false);
  });
});
