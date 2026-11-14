// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Adding a picture (035): reserve, upload both re-encoded files, confirm; as the signed-in person.
let gate = "live";
vi.mock("@/lib/conditions", () => ({ pageGate: () => gate }));
let origin = true;
vi.mock("@/lib/http/sameOrigin", () => ({ sameOrigin: () => origin }));
const rpc = vi.fn();
const upload = vi.fn(async (_p: string, _f: unknown, _o: unknown) => ({ error: null as unknown }));
const remove = vi.fn(async (_p: string[]) => ({ error: null }));
const sign = vi.fn(async (paths: string[], _s: number) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}` })), error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc, storage: { from: () => ({ upload, remove, createSignedUrls: sign }) } }),
}));
const { POST } = await import("./route");

const E = "a0350000-0000-4000-8000-0000000000e1";
// A minimal well-formed JPEG as a canvas writes it: SOI, APP0, then the scan (SOS) and EOI.
const jpeg = (extra: number[] = []) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xda, 0, 2, ...extra, 0xff, 0xd9])], "p.jpg", { type: "image/jpeg" });
const exifJpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 16, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 0xff, 0xd9])], "p.jpg", { type: "image/jpeg" });
const post = (fields: Record<string, string | File>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new Request("https://www.moodbow.com/api/pictures", { method: "POST", body: form }));
};
const good = () => ({ entry: E, width: "2048", height: "1536", full: jpeg([1]), thumb: jpeg([2]) });
const reserved = { data: [{ id: "p1", path: `u/${E}/p1.jpg`, thumb_path: `u/${E}/p1_t.jpg` }], error: null };
const confirmed = { data: [{ id: "p1", width: 2048, height: 1536, created_at: "2026-11-14T09:00:00Z" }], error: null };

beforeEach(() => {
  gate = "live";
  origin = true;
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/pictures (035)", () => {
  it("reserve, both uploads (no overwrite), confirm; the answer has short-lived signed URLs", async () => {
    rpc.mockResolvedValueOnce(reserved).mockResolvedValueOnce(confirmed);
    const body = await (await post(good())).json();
    expect(rpc.mock.calls[0]).toEqual(["picture_reserve", { p_entry: E, p_bytes: 26 }]);
    expect(upload.mock.calls.map((c) => [c[0], (c[2] as { upsert: boolean; contentType: string }).upsert, (c[2] as { contentType: string }).contentType])).toEqual([
      [`u/${E}/p1.jpg`, false, "image/jpeg"],
      [`u/${E}/p1_t.jpg`, false, "image/jpeg"],
    ]);
    expect(rpc.mock.calls[1]).toEqual(["picture_confirm", { p_id: "p1", p_width: 2048, p_height: 1536 }]);
    expect(sign.mock.calls[0][1]).toBe(300);
    expect(body).toEqual({ status: "ok", picture: { id: "p1", width: 2048, height: 1536, created_at: "2026-11-14T09:00:00Z", full: `https://signed.example/u/${E}/p1.jpg`, thumb: `https://signed.example/u/${E}/p1_t.jpg` } });
  });

  it("a file carrying EXIF never reaches storage: refused before anything", async () => {
    const res = await post({ ...good(), full: exifJpeg() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("XMP or IPTC metadata (GPS can live there too) is refused like EXIF", async () => {
    const xmp = [..."http://ns.adobe.com/xap/1.0/"].map((c) => c.charCodeAt(0));
    const res = await post({ ...good(), thumb: new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, xmp.length + 2, ...xmp, 0xff, 0xda, 0, 2, 0xff, 0xd9])], "t.jpg", { type: "image/jpeg" }) });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("not a JPEG, a size over 2048, or not an entry id: invalid", async () => {
    expect((await post({ ...good(), thumb: new File(["GIF89a"], "x.gif", { type: "image/gif" }) })).status).toBe(400);
    expect((await post({ ...good(), width: "4096" })).status).toBe(400);
    expect((await post({ ...good(), entry: "x" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the server's refusals keep their codes: no Plus, the limit, the month's allowance, not a moment", async () => {
    for (const code of ["plus_required", "picture_limit", "picture_quota", "not_a_moment"] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      expect(await (await post(good())).json()).toEqual({ status: "error", error: code });
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it("an upload that fails: what went up comes out again; generic", async () => {
    rpc.mockResolvedValueOnce(reserved);
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "down" } });
    expect(await (await post(good())).json()).toEqual({ status: "error", error: "generic" });
    expect(remove).toHaveBeenCalledWith([`u/${E}/p1.jpg`, `u/${E}/p1_t.jpg`]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("the confirm refused (the real sizes over the allowance): the files come out; picture_quota", async () => {
    rpc.mockResolvedValueOnce(reserved).mockResolvedValueOnce({ data: null, error: { message: "picture_quota" } });
    expect(await (await post(good())).json()).toEqual({ status: "error", error: "picture_quota" });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("where pictures aren't on: 404; another origin: 403", async () => {
    gate = "hidden";
    expect((await post(good())).status).toBe(404);
    gate = "live";
    origin = false;
    expect((await post(good())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
