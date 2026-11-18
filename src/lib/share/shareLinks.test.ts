// @vitest-environment node
import { describe, expect, it } from "vitest";
import { activeLinks, activeShareLine, linkState, parseShareLinks, shareNotes, SHARE_LINK_COLUMNS, shareUrl } from "./shareLinks";

const NOW = new Date("2026-11-18T12:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: "a",
  first_name: "Lee",
  include_routine: false,
  routine_item_ids: [],
  created_at: "2026-11-10T10:00:00Z",
  created_on: "2026-11-10",
  expires_at: "2026-12-10T10:00:00Z",
  revoked_at: null,
  view_count: 0,
  last_viewed_at: null,
  created_seen_at: "2026-11-10T10:05:00Z",
  first_view_seen_at: null,
  ...over,
});

describe("share links (1.4 G)", () => {
  it("never selects the token hash", () => {
    expect(SHARE_LINK_COLUMNS).not.toMatch(/token/);
  });

  it("parses rows, newest first; a blank name is no name; junk rows go", () => {
    const links = parseShareLinks([row({ id: "old" }), row({ id: "new", created_at: "2026-11-12T10:00:00Z", first_name: " " }), { id: 5 }, null]);
    expect(links.map((l) => l.id)).toEqual(["new", "old"]);
    expect(links[0].first_name).toBeNull();
  });

  it("active, ended or stopped", () => {
    const [a] = parseShareLinks([row()]);
    expect(linkState(a, NOW)).toBe("active");
    expect(linkState({ ...a, expires_at: "2026-11-18T11:59:59Z" }, NOW)).toBe("ended");
    expect(linkState({ ...a, revoked_at: "2026-11-15T00:00:00Z" }, NOW)).toBe("stopped");
    expect(activeLinks([a, { ...a, id: "b", revoked_at: "2026-11-15T00:00:00Z" }], NOW).map((l) => l.id)).toEqual(["a"]);
  });

  it("Today's notes: created while unseen; first view once opened and unseen; nothing once seen", () => {
    const links = parseShareLinks([
      row({ id: "new", created_at: "2026-11-17T10:00:00Z", created_seen_at: null }),
      row({ id: "opened", view_count: 2, first_view_seen_at: null }),
    ]);
    expect(shareNotes(links)).toEqual([
      { kind: "created", id: "new" },
      { kind: "first_view", id: "opened" },
    ]);
    expect(shareNotes(parseShareLinks([row({ view_count: 0 })]))).toEqual([]);
    expect(shareNotes(parseShareLinks([row({ view_count: 3, first_view_seen_at: "2026-11-12T00:00:00Z" })]))).toEqual([]);
  });

  it("a stopped link still gets its note: the person should know", () => {
    expect(shareNotes(parseShareLinks([row({ created_seen_at: null, revoked_at: "2026-11-11T00:00:00Z" })]))).toEqual([{ kind: "created", id: "a" }]);
  });

  it("Me's line: the active count, or nothing; a failed read never says 0 active (the Reviewer, #364)", () => {
    expect(activeShareLine({ count: 2, error: null })).toBe(2);
    expect(activeShareLine({ count: 0, error: null })).toBeNull();
    expect(activeShareLine({ count: null, error: { message: "boom" } })).toBeNull();
    expect(activeShareLine({ count: 3, error: { message: "boom" } })).toBeNull();
    expect(activeShareLine(null)).toBeNull();
  });

  it("the viewer's address carries the token in the fragment only", () => {
    expect(shareUrl("https://www.moodbow.com", "", "T".repeat(43))).toBe(`https://www.moodbow.com/s#${"T".repeat(43)}`);
    expect(shareUrl("https://www.moodbow.com", "/fr", "x")).toBe("https://www.moodbow.com/fr/s#x");
  });
});
