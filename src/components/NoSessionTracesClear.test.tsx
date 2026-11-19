import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lateNoteKey } from "@/lib/journal/lateNote";
import { localKey } from "@/lib/localData";
import { NoSessionTracesClear } from "./NoSessionTracesClear";

// Every way out (UX, #366): Me → Sign out (SignOutButton.test), Delete account and a gone account
// (wipeLocalData: CheckInCard.lateNote.test), and here a session the server ended: the
// late-night note's mark goes for every user, and nothing else does.
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("NoSessionTracesClear (SessionEnded, the sign-in page)", () => {
  it("removes every user's late-night mark; drafts and other traces stay", () => {
    window.localStorage.setItem(lateNoteKey("u1"), "2026-11-19");
    window.localStorage.setItem(lateNoteKey("u2"), "2026-11-18");
    window.localStorage.setItem(localKey("draft-entry", "u1", "x"), "text");
    window.localStorage.setItem(localKey("on-this-day-hidden", "u1", "2026-11-19"), "1");
    window.localStorage.setItem("NEXT_LOCALE", "en");
    render(<NoSessionTracesClear />);
    expect(window.localStorage.getItem(lateNoteKey("u1"))).toBeNull();
    expect(window.localStorage.getItem(lateNoteKey("u2"))).toBeNull();
    expect(window.localStorage.getItem(localKey("draft-entry", "u1", "x"))).toBe("text");
    expect(window.localStorage.getItem(localKey("on-this-day-hidden", "u1", "2026-11-19"))).toBe("1");
    expect(window.localStorage.getItem("NEXT_LOCALE")).toBe("en");
  });
});
