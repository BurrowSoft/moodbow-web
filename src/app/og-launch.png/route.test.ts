// @vitest-environment node
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

// The launch Open Graph image renders as a 1200 × 630 PNG. OG_OUT=<path>
// also writes it out, for a look before it ships.
describe("/og-launch.png", () => {
  it("is a 1200 × 630 PNG", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("image/png");
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    // IHDR: width and height, big-endian, at bytes 16 and 20.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    if (process.env.OG_OUT) writeFileSync(process.env.OG_OUT, png);
  }, 30_000);
});
