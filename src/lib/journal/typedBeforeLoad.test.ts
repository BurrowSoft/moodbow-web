// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readServerBox, withTyped, type ServerBox } from "./typedBeforeLoad";

const box = (over: Partial<ServerBox>): ServerBox => ({ body: null, serverBody: "", date: null, focused: true, start: 0, end: 0, ...over });

describe("withTyped", () => {
  it("nothing typed: the text as it was, with the caret kept inside it", () => {
    expect(withTyped("A draft", box({ start: 0, end: 0 }), true)).toEqual({ body: "A draft", start: 0, end: 0 });
    expect(withTyped("Hi", box({ start: 9, end: 9 }), false)).toEqual({ body: "Hi", start: 2, end: 2 });
    expect(withTyped("Hi", null, false)).toEqual({ body: "Hi", start: 0, end: 0 });
  });
  it("no draft: exactly what was typed, caret and all", () => {
    expect(withTyped("", box({ body: "abc", start: 1, end: 2 }), false)).toEqual({ body: "abc", start: 1, end: 2 });
  });
  it("an edit with no draft: what's in the box", () => {
    expect(withTyped("Old", box({ body: "Old and new", serverBody: "Old", start: 11, end: 11 }), false)).toEqual({ body: "Old and new", start: 11, end: 11 });
  });
  it("a draft: both are kept, the draft first; the caret stays in what was typed", () => {
    expect(withTyped("The draft", box({ body: "typed", start: 3, end: 3 }), true)).toEqual({ body: "The draft\n\ntyped", start: 14, end: 14 });
  });
  it("a draft on an edit: only what was added goes under it", () => {
    const r = withTyped("Old, drafted", box({ body: "Old plus", serverBody: "Old", start: 8, end: 8 }), true);
    expect(r.body).toBe("Old, drafted\n\nplus");
    expect(r.start).toBe(r.body.length);
  });
  it("a draft and the same text typed: not doubled", () => {
    expect(withTyped("same", box({ body: "same", start: 4, end: 4 }), true).body).toBe("same");
  });
  it("a draft, and only spaces typed: the draft alone", () => {
    expect(withTyped("The draft", box({ body: "  ", start: 2, end: 2 }), true).body).toBe("The draft");
  });
});

describe("readServerBox", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const page = (html: string) => {
    document.body.innerHTML = html;
    return document.getElementById("entry-text") as HTMLTextAreaElement;
  };

  it("no box: nothing to carry over", () => {
    expect(readServerBox()).toBeNull();
  });
  it("as the server sent it: nothing typed", () => {
    page('<textarea id="entry-text">From the server</textarea>');
    expect(readServerBox()).toMatchObject({ body: null, serverBody: "From the server", focused: false });
  });
  it("typed, focused, with the caret", () => {
    const el = page('<textarea id="entry-text"></textarea>');
    el.value = "typed";
    el.focus();
    el.setSelectionRange(2, 3);
    expect(readServerBox()).toMatchObject({ body: "typed", focused: true, start: 2, end: 3 });
  });
  it("clicked in, nothing typed: the focus still counts", () => {
    page('<textarea id="entry-text"></textarea>').focus();
    expect(readServerBox()).toMatchObject({ body: null, focused: true });
  });
  it("a changed date comes too; an unchanged one doesn't", () => {
    page('<textarea id="entry-text"></textarea><input id="entry-date" type="date" value="2026-11-05" />');
    expect(readServerBox()?.date).toBeNull();
    (document.getElementById("entry-date") as HTMLInputElement).value = "2026-11-01";
    expect(readServerBox()?.date).toBe("2026-11-01");
  });
});
