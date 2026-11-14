// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { underOwnFolder } from "@/lib/journal/pictureQueue";

type Row = { id: number; user_id: string; path: string; attempts: number };
let picturesMet = false;
vi.mock("@/lib/conditions", () => ({ conditionMet: () => picturesMet }));
let queue: Row[] = [];
let readable = true;
let configured = true;
const removeFiles = vi.fn(async (_paths: string[]) => true);
const clearQueue = vi.fn(async (ids: number[]) => ((queue = queue.filter((r) => !ids.includes(r.id))), true));
const failQueue = vi.fn(async (_rows: Row[]) => {});
vi.mock("@/lib/plus/serviceRole", () => ({
  serviceRoleConfigured: () => configured,
  readPictureQueue: async (limit: number) => (readable ? { ok: true, value: queue.slice(0, limit) } : { ok: false }),
  removePictureFiles: (p: string[]) => removeFiles(p),
  clearPictureQueue: (ids: number[]) => clearQueue(ids),
  failPictureQueue: (rows: Row[]) => failQueue(rows),
}));
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));
const { GET } = await import("./route");

const U = "a0350000-0000-4000-8000-00000000000a";
const V = "a0350000-0000-4000-8000-00000000000b";
const row = (id: number, user = U, path = `${user}/e1/p${id}.jpg`, attempts = 0): Row => ({ id, user_id: user, path, attempts });
const get = (auth: string | null = "Bearer cron-test") => GET(new Request("https://www.moodbow.com/api/cron/picture-deletions", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-test");
  picturesMet = false;
  readable = true;
  configured = true;
  queue = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("underOwnFolder: only a path under the row's own user folder", () => {
  it("its own folder: yes; another's, a bare folder, a climb out, a bad id: no", () => {
    expect(underOwnFolder(row(1))).toBe(true);
    expect(underOwnFolder({ user_id: U, path: `${V}/e1/p.jpg` })).toBe(false);
    expect(underOwnFolder({ user_id: U, path: `${U}/` })).toBe(false);
    expect(underOwnFolder({ user_id: U, path: `${U}/../${V}/p.jpg` })).toBe(false);
    expect(underOwnFolder({ user_id: "x", path: "x/p.jpg" })).toBe(false);
  });
});

describe("GET /api/cron/picture-deletions (035)", () => {
  it("only with the cron secret", async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("deletes the queued files under their own folders, clears them, answers with counts only", async () => {
    queue = [row(1), row(2, U, `${U}/e1/p2_t.jpg`), row(3, V)];
    const res = await get();
    const body = await res.json();
    expect(body).toEqual({ deleted: 3, failed: 0, refused: 0 });
    expect(removeFiles.mock.calls[0][0]).toEqual([`${U}/e1/p1.jpg`, `${U}/e1/p2_t.jpg`, `${V}/e1/p3.jpg`]);
    expect(queue).toEqual([]);
    // Counts only: no path, no id in the answer.
    expect(JSON.stringify(body)).not.toMatch(/jpg|a0350000/);
  });

  it("a path outside its row's folder is never deleted: left queued, counted as refused, reported", async () => {
    queue = [row(1), { id: 2, user_id: U, path: `${V}/e9/stolen.jpg`, attempts: 0 }];
    expect(await (await get()).json()).toEqual({ deleted: 1, failed: 0, refused: 1 });
    expect(removeFiles.mock.calls.flatMap((c) => c[0])).toEqual([`${U}/e1/p1.jpg`]);
    expect(queue.map((r) => r.id)).toEqual([2]);
    expect(captureMessage).toHaveBeenCalledWith("Picture deletions: 0 stuck, 1 refused", expect.anything());
  });

  it("Storage failing: the batch stays queued with its attempts counted; past 5 it's reported", async () => {
    removeFiles.mockResolvedValueOnce(false);
    queue = [row(1, U, `${U}/e1/p1.jpg`, 4), row(2)];
    expect(await (await get()).json()).toEqual({ deleted: 0, failed: 2, refused: 0 });
    expect(failQueue).toHaveBeenCalledTimes(1);
    expect(queue.map((r) => r.id)).toEqual([1, 2]);
    expect(captureMessage).toHaveBeenCalledWith("Picture deletions: 1 stuck, 0 refused", expect.anything());
  });

  it("more than a batch: every batch, in one run", async () => {
    queue = Array.from({ length: 250 }, (_, i) => row(i + 1));
    expect(await (await get()).json()).toEqual({ deleted: 250, failed: 0, refused: 0 });
    expect(removeFiles).toHaveBeenCalledTimes(3);
  });

  it("before pictures are set up (no key, or no 035 yet): a quiet 200; once pictures-live is met, an error", async () => {
    configured = false;
    expect(await (await get()).json()).toEqual({ skipped: "not_configured" });
    readable = false;
    configured = true;
    expect(await (await get()).json()).toEqual({ skipped: "no_queue" });
    picturesMet = true;
    expect((await get()).status).toBe(500);
    configured = false;
    expect((await get()).status).toBe(503);
  });
});
