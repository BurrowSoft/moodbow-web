import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readShortcutsOn, shortcutFor, SHORTCUTS_KEY, writeShortcutsOn } from "./shortcuts";

const press = (key: string, over: Partial<KeyboardEvent> = {}, target: EventTarget | null = document.body) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, isComposing: false, target, ...over }) as KeyboardEvent;
const on = { search: true };

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("shortcutFor (1.1 O)", () => {
  it("n c t i / and ?", () => {
    expect(shortcutFor(press("n"), on)).toBe("new");
    expect(shortcutFor(press("c"), on)).toBe("checkIn");
    expect(shortcutFor(press("t"), on)).toBe("timeline");
    expect(shortcutFor(press("i"), on)).toBe("insights");
    expect(shortcutFor(press("/"), on)).toBe("search");
    expect(shortcutFor(press("?", { shiftKey: true }), on)).toBe("help");
    expect(shortcutFor(press("x"), on)).toBeNull();
  });

  it("/ only when search is live", () => {
    expect(shortcutFor(press("/"), { search: false })).toBeNull();
  });

  it("never with Ctrl, Cmd or Alt (browser and screen-reader keys), or while composing", () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
      expect(shortcutFor(press("t", mod), on)).toBeNull();
    }
  });

  it("never while typing: fields, selects, editable areas", () => {
    document.body.innerHTML = `<input id="a"><textarea id="b"></textarea><select id="c"></select><div contenteditable="true"><span id="d"></span></div><button id="e"></button>`;
    for (const id of ["a", "b", "c", "d"]) expect(shortcutFor(press("t", {}, document.getElementById(id)), on), id).toBeNull();
    expect(shortcutFor(press("t", {}, document.getElementById("e")), on)).toBe("timeline");
  });

  it("never inside a dialog, or while one is open anywhere", () => {
    document.body.innerHTML = `<div role="dialog"><button id="in"></button></div>`;
    expect(shortcutFor(press("t", {}, document.getElementById("in")), on)).toBeNull();
    document.body.innerHTML = `<div role="dialog" aria-modal="true"></div><button id="out"></button>`;
    expect(shortcutFor(press("t", {}, document.getElementById("out")), on)).toBeNull();
  });
});

describe("the switch, on this device (WCAG 2.1.4)", () => {
  it("on by default; off is remembered; on again clears it", () => {
    expect(readShortcutsOn()).toBe(true);
    writeShortcutsOn(false);
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBe("off");
    expect(readShortcutsOn()).toBe(false);
    writeShortcutsOn(true);
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBeNull();
    expect(readShortcutsOn()).toBe(true);
  });
});

describe("ARIA text and option widgets count as typing (reviewer #97)", () => {
  it("textbox, searchbox, combobox, spinbutton, menu, listbox", () => {
    for (const role of ["textbox", "searchbox", "combobox", "spinbutton", "menu", "listbox"]) {
      document.body.innerHTML = `<div role="${role}"><span id="x"></span></div>`;
      expect(shortcutFor(press("t", {}, document.getElementById("x")), on), role).toBeNull();
    }
  });
});
