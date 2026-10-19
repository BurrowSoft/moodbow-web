import { describe, expect, it } from "vitest";
import { lastQuestion, withQuestion } from "./answer";

describe("lastQuestion", () => {
  it("takes the closing question", () => {
    expect(lastQuestion("You had a long day. The walk helped. What made it feel lighter?")).toBe("What made it feel lighter?");
  });

  it("takes the last question when there are several, and ignores a sentence after it", () => {
    expect(lastQuestion("Was it the rain? Maybe. What would help tomorrow? Take care.")).toBe("What would help tomorrow?");
  });

  it("reads questions on their own line and full-width marks", () => {
    expect(lastQuestion("今日は大変でした。\n何が助けになりましたか？")).toBe("何が助けになりましたか？");
  });

  it("falls back to the last sentence when there's no question mark", () => {
    expect(lastQuestion("It was a full day. Think about what you'd keep.")).toBe("Think about what you'd keep.");
  });

  it("is empty for an empty reflection", () => {
    expect(lastQuestion("  ")).toBe("");
  });
});

describe("withQuestion", () => {
  it("quotes the question on a new line after the entry, ready to answer", () => {
    expect(withQuestion("I walked to the river.\n", "What did you notice?")).toBe("I walked to the river.\n\n“What did you notice?”\n");
  });

  it("starts with the question when the entry is blank", () => {
    expect(withQuestion("", "What did you notice?")).toBe("“What did you notice?”\n");
  });
});
