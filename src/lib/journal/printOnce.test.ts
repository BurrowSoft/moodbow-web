// @vitest-environment node
import { describe, expect, it } from "vitest";
import { askToPrint, takePrintRequest } from "./printOnce";

describe("printOnce (1.1 N)", () => {
  it("one request, for that month only, taken once", () => {
    expect(takePrintRequest("2026-10")).toBe(false);
    askToPrint("2026-10");
    expect(takePrintRequest("2026-09")).toBe(false);
    expect(takePrintRequest("2026-10")).toBe(false);
    askToPrint("2026-10");
    expect(takePrintRequest("2026-10")).toBe(true);
    expect(takePrintRequest("2026-10")).toBe(false);
  });
});
