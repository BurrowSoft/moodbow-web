import { describe, expect, it } from "vitest";
import conditions from "../../../content/conditions.json";
import messages from "@/messages/en.json";

describe("Bo's consent text", () => {
  // Vitor's text replaces this. The flag can't go on with the placeholder in.
  it("bo-live stays off while the consent is a placeholder", () => {
    if (messages.bo.consentBody.startsWith("[Placeholder") || messages.bo.journalSwitchNote.startsWith("[Placeholder")) expect(conditions["bo-live"].met).toBe(false);
  });
});
