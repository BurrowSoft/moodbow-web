// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasSecurityUpdate, securityUpdate } from "./securityUpdate";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const write = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), text);

describe("securityUpdate", () => {
  it("no file: nothing, which is the page's 404", () => {
    expect(hasSecurityUpdate(dir)).toBe(false);
    expect(securityUpdate("en", dir)).toBeNull();
  });
  it("this repo has no notice out: only the README is there", () => {
    expect(hasSecurityUpdate()).toBe(false);
    expect(securityUpdate("en")).toBeNull();
    expect(securityUpdate("es")).toBeNull();
  });
  it("a language's own file when it has one, else the English, saying so", () => {
    write("en.md", "## What happened\nThe English.");
    write("es.md", "## Qué pasó\nEl español.");
    expect(securityUpdate("es", dir)).toMatchObject({ title: "Qué pasó", english: false });
    expect(securityUpdate("fr", dir)).toMatchObject({ title: "What happened", english: true });
    expect(securityUpdate("en", dir)?.html).toContain("The English.");
  });
  it("a translation with no English isn't out yet", () => {
    write("es.md", "## Qué pasó\nEl español.");
    expect(securityUpdate("es", dir)).toBeNull();
  });
});
