// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGION_TOKEN_SECONDS, signRegionToken } from "@/lib/regionToken";

let gate = "draft";
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
const { GET } = await import("./route");

const SECRET = "test-secret-not-real";
const get = (headers: Record<string, string> = {}) => GET(new Request("https://www.moodbow.com/api/region", { headers }));
const tokenOf = async (res: Response) => ((await res.json()) as { token: string | null }).token;

beforeEach(() => {
  gate = "draft";
  vi.stubEnv("REGION_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signRegionToken: the format the function checks", () => {
  it("a fixed vector, byte for byte (the function's tests use the same one)", () => {
    expect(signRegionToken("MX", SECRET, 1_800_000_000_000)).toBe("eyJjIjoiTVgiLCJleHAiOjE4MDAwMDA5MDB9.AQ9Lat55AkySotf03gvSKkGBilIKsQSG5dfq6hPQVMo");
  });

  it("payload { c, exp }, 15 minutes; the signature is over the prefix and the payload, so this secret signs nothing else", () => {
    const [payload, signature] = signRegionToken("NZ", SECRET, 1_800_000_000_000)!.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({ c: "NZ", exp: 1_800_000_000 + REGION_TOKEN_SECONDS });
    expect(REGION_TOKEN_SECONDS).toBe(900);
    expect(signature).toBe(createHmac("sha256", SECRET).update(`region.v1.${payload}`).digest("base64url"));
    expect(signature).not.toBe(createHmac("sha256", SECRET).update(payload).digest("base64url"));
  });

  it.each([null, undefined, "", "mx", "M", "MXX", "M1", "T1", "M X"])("%s isn't a country: no token", (country) => {
    expect(signRegionToken(country, SECRET)).toBeNull();
  });

  it("no secret: no token, never a throw", () => {
    expect(signRegionToken("MX", "")).toBeNull();
    vi.stubEnv("REGION_SECRET", "");
    expect(signRegionToken("MX")).toBeNull();
  });
});

describe("GET /api/region", () => {
  it("with Vercel's country: a token for it, and never cached", async () => {
    const res = await get({ "x-vercel-ip-country": "MX" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [payload] = (await tokenOf(res))!.split(".");
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).c).toBe("MX");
  });

  it("no country, a malformed one, or no secret: { token: null } with a 200, never an error", async () => {
    expect(await tokenOf(await get())).toBeNull();
    const malformed = await get({ "x-vercel-ip-country": "nope" });
    expect(malformed.status).toBe(200);
    expect(await tokenOf(malformed)).toBeNull();
    vi.stubEnv("REGION_SECRET", "");
    const noSecret = await get({ "x-vercel-ip-country": "MX" });
    expect(noSecret.status).toBe(200);
    expect(await tokenOf(noSecret)).toBeNull();
  });

  it("the IP isn't what decides: it reads only the country header", async () => {
    expect(await tokenOf(await get({ "x-forwarded-for": "203.0.113.7" }))).toBeNull();
  });

  it("behind its flag: 404 on Production until it's met", async () => {
    gate = "hidden";
    expect((await get({ "x-vercel-ip-country": "MX" })).status).toBe(404);
  });
});
