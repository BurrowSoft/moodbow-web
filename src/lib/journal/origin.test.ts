// @vitest-environment node
import { describe, expect, it } from "vitest";
import { entryOriginOf, originDay, originOf, originTab, withOrigin } from "./origin";

describe("entry origins (decision 152)", () => {
  it("only Today, the Timeline and a day are origins; anything else is Today", () => {
    expect(originOf("/app/timeline")).toBe("/app/timeline");
    expect(originOf("/app/timeline/2026-10-02")).toBe("/app/timeline/2026-10-02");
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/app/me", "/app/timeline/2026-10-02/x", "/app/timeline/x"]) expect(originOf(bad), String(bad)).toBe("/app");
  });
  it("the tab and day of an origin", () => {
    expect(originTab("/app")).toBe("/app");
    expect(originTab("/app/timeline/2026-10-02")).toBe("/app/timeline");
    expect(originDay("/app/timeline/2026-10-02")).toBe("2026-10-02");
    expect(originDay("/app/timeline")).toBeNull();
  });
  it("links always carry it, Today included (an entry with none is the Timeline's, audit B)", () => {
    expect(withOrigin("/app/entries/e1", "/app")).toBe("/app/entries/e1?from=%2Fapp");
    expect(withOrigin("/app/entries/e1", "/app/timeline")).toBe("/app/entries/e1?from=%2Fapp%2Ftimeline");
    expect(withOrigin("/app/write?date=2026-10-02", "/app/timeline/2026-10-02")).toBe("/app/write?date=2026-10-02&from=%2Fapp%2Ftimeline%2F2026-10-02");
  });
  it("an entry with no origin at all is the Timeline's; a given one is kept; a bad one is Today's", () => {
    for (const none of [undefined, null, ""]) expect(entryOriginOf(none), String(none)).toBe("/app/timeline");
    expect(entryOriginOf("/app")).toBe("/app");
    expect(entryOriginOf("/app/timeline/2026-10-02")).toBe("/app/timeline/2026-10-02");
    expect(entryOriginOf("https://evil.example")).toBe("/app");
  });
});
