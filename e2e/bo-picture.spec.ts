import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import ts from "typescript";

// Bo's pictures, in a real browser: the real file, run as it is on a blank page (the
// screen itself needs a session and the function), and the output's bytes read back.
// Generated images only: patterns, never people.
const source = ts.transpileModule(readFileSync("src/lib/journal/boPicture.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;

async function load(page: Page) {
  await page.goto("about:blank");
  await page.addScriptTag({ type: "module", content: `${source}\nwindow.bo = { preparePicture, jpegMetadataSegments, LONG: BO_PICTURE_LONG_SIDE, MAX: BO_PICTURE_MAX_BYTES };` });
  await page.waitForFunction(() => "bo" in window);
  // A generated JPEG, with an APP1 or other segment put in after its first marker.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.jpeg = async (width: number, height: number) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const d = c.getContext("2d")!;
      d.fillStyle = "#3366cc";
      d.fillRect(0, 0, width, height);
      d.fillStyle = "#ffcc00";
      // The top-left quarter marks which way up it is.
      d.fillRect(0, 0, width / 2, height / 2);
      const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/jpeg", 0.9));
      return new Uint8Array(await blob.arrayBuffer());
    };
    w.withSegment = (bytes: Uint8Array, marker: number, payload: Uint8Array) => {
      const size = payload.length + 2;
      return new Uint8Array([0xff, 0xd8, 0xff, marker, size >> 8, size & 255, ...payload, ...bytes.slice(2)]);
    };
  });
}

type Output = { ok: boolean; segments: number[] | null; text: string; width: number; height: number; size: number; soi: boolean; decoded: [number, number] };

// Runs preparePicture on a file made in the page, and reads what came out, byte by byte.
const prepare = (page: Page, make: string, name = "holiday-in-paris.jpg", type = "image/jpeg") =>
  page.evaluate(
    async ({ make, name, type }) => {
      const w = window as unknown as Record<string, never> & { bo: { preparePicture: (f: File) => Promise<{ ok: boolean; blob: Blob; base64: string; width: number; height: number }>; jpegMetadataSegments: (b: Uint8Array) => number[] | null } };
      const parts = await new Function("w", `return (async () => { const { jpeg, withSegment } = w; const text = (s) => new TextEncoder().encode(s); return ${make}; })()`)(w);
      const out = await w.bo.preparePicture(new File([parts], name, { type }));
      if (!out.ok) return { ok: false } as Output;
      const bytes = Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(out.blob);
      return {
        ok: true,
        segments: w.bo.jpegMetadataSegments(bytes),
        // Latin-1, so any marker word in the bytes can be searched for.
        text: Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
        width: out.width,
        height: out.height,
        size: bytes.length,
        soi: bytes[0] === 0xff && bytes[1] === 0xd8,
        decoded: [bitmap.width, bitmap.height],
      } as Output;
    },
    { make, name, type },
  );

// EXIF with an orientation (1 entry, tag 0x0112) and a marker word, big-endian.
const EXIF = (orientation: number, marker: string) => `new Uint8Array([
  ...text("Exif"), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
  0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, ${orientation}, 0, 0, 0, 0, 0, 0,
  ...text("${marker}")])`;

test.describe("Bo's pictures: the bytes that would leave the browser", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "other browsers are the Web Tester's");
  test.beforeEach(async ({ page }) => load(page));

  test("EXIF with GPS, XMP, IPTC and a comment: none of it comes out, and the result is a clean JPEG", async ({ page }) => {
    for (const [name, marker, payload] of [
      ["EXIF", 0xe1, EXIF(1, "GPSLATITUDE-MARKER")],
      ["XMP", 0xe1, `text("http://ns.adobe.com/xap/1.0/ XMP-MARKER")`],
      ["IPTC", 0xed, `text("Photoshop 3.0 IPTC-MARKER")`],
      ["comment", 0xfe, `text("COMMENT-MARKER")`],
    ] as const) {
      const out = await prepare(page, `withSegment(await jpeg(400, 300), ${marker}, ${payload})`);
      expect(out.ok, name).toBe(true);
      expect(out.soi, name).toBe(true);
      expect(out.segments, name).toEqual([]);
      expect(out.text, name).not.toMatch(/MARKER|Exif|xap|Photoshop/);
    }
  });

  // Why the check first refused everything: what this browser's own encoder writes, printed
  // so the run's log says, and what the code does with it. Not an assertion on the browser.
  test("what the browser's encoder adds, and that it doesn't survive", async ({ page }) => {
    const seen = await page.evaluate(async () => {
      const w = window as unknown as { jpeg: (w: number, h: number) => Promise<Uint8Array>; bo: { jpegMetadataSegments: (b: Uint8Array) => number[] | null; preparePicture: (f: File) => Promise<{ ok: boolean; base64: string }> } };
      const raw = await w.jpeg(400, 300);
      const markers: string[] = [];
      for (let at = 2; at + 3 < raw.length && raw[at] === 0xff; at += 2 + ((raw[at + 2] << 8) | raw[at + 3])) {
        markers.push(raw[at + 1].toString(16));
        if (raw[at + 1] === 0xda) break;
      }
      const out = await w.bo.preparePicture(new File([raw as BlobPart], "x.jpg", { type: "image/jpeg" }));
      const bytes = Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
      return { markers, found: w.bo.jpegMetadataSegments(raw), ok: out.ok, after: w.bo.jpegMetadataSegments(bytes) };
    });
    console.log(`The encoder's markers: ${seen.markers.join(" ")}; metadata found: ${JSON.stringify(seen.found)}; after: ${JSON.stringify(seen.after)}`);
    expect(seen.ok).toBe(true);
    expect(seen.after).toEqual([]);
  });

  test("the file's name isn't in the bytes", async ({ page }) => {
    const out = await prepare(page, "await jpeg(400, 300)", "my-secret-name.jpg");
    expect(out.ok).toBe(true);
    expect(out.text).not.toContain("my-secret-name");
  });

  test("a large file comes out about 1024 px on the long side, within the size", async ({ page }) => {
    const out = await prepare(page, "await jpeg(3000, 1500)");
    expect(out.decoded).toEqual([1024, 512]);
    expect(out.size).toBeLessThanOrEqual(1_000_000);
  });

  test("a small file isn't enlarged", async ({ page }) => {
    expect((await prepare(page, "await jpeg(400, 300)")).decoded).toEqual([400, 300]);
  });

  test("EXIF orientation 6: upright, with the sides swapped, and the orientation gone", async ({ page }) => {
    const out = await prepare(page, `withSegment(await jpeg(800, 400), 0xe1, ${EXIF(6, "ORIENTATION-MARKER")})`);
    expect(out.decoded).toEqual([400, 800]);
    expect(out.segments).toEqual([]);
  });

  test("a PNG and a transparent one become JPEGs", async ({ page }) => {
    const out = await page.evaluate(async () => {
      const w = window as unknown as { bo: { preparePicture: (f: File) => Promise<{ ok: boolean; blob: Blob }> } };
      const c = document.createElement("canvas");
      c.width = c.height = 100;
      const png = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
      const result = await w.bo.preparePicture(new File([png], "clear.png", { type: "image/png" }));
      if (!result.ok) return null;
      const bitmap = await createImageBitmap(result.blob);
      const draw = document.createElement("canvas").getContext("2d")!;
      draw.drawImage(bitmap, 0, 0);
      return { type: result.blob.type, corner: [...draw.getImageData(0, 0, 1, 1).data].slice(0, 3) };
    });
    expect(out?.type).toBe("image/jpeg");
    // On white, not black.
    expect(out?.corner.every((v) => v > 250)).toBe(true);
  });

  test("what can't be read gets no picture at all: corrupt, text as .jpg, empty, SVG, too large", async ({ page }) => {
    for (const [name, make, type] of [
      ["corrupt", `new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 8, ...text("GPS-MK")])`, "image/jpeg"],
      ["text", `text("not a picture at all")`, "image/jpeg"],
      ["empty", "new Uint8Array(0)", "image/jpeg"],
      ["svg", `text('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><rect width="9" height="9"/></svg>')`, "image/svg+xml"],
      ["too large", "new Uint8Array(30_000_001)", "image/jpeg"],
    ] as const) {
      expect((await prepare(page, make, "x.jpg", type)).ok, name).toBe(false);
    }
  });

  // A cut-off file decodes in part, as a grey picture, so it's refused before any drawing
  // (app #228): "That picture couldn't be opened", and nothing is attached.
  test("a truncated JPEG with EXIF, a truncated one without, and a cut-off PNG: refused, never a grey picture", async ({ page }) => {
    const half = (make: string) => `(await (async () => { const whole = ${make}; return whole.slice(0, Math.floor(whole.length / 2)); })())`;
    expect((await prepare(page, half(`withSegment(await jpeg(400, 300), 0xe1, ${EXIF(1, "TRUNCATED-MARKER")})`))).ok, "with EXIF").toBe(false);
    expect((await prepare(page, half("await jpeg(400, 300)"))).ok, "plain").toBe(false);
    const cutPng = await page.evaluate(async () => {
      const w = window as unknown as { bo: { preparePicture: (f: File) => Promise<{ ok: boolean }> } };
      const c = document.createElement("canvas");
      c.width = c.height = 100;
      const png = new Uint8Array(await (await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"))).arrayBuffer());
      return (await w.bo.preparePicture(new File([png.slice(0, png.length - 6)], "cut.png", { type: "image/png" }))).ok;
    });
    expect(cutPng, "PNG short of IEND's CRC").toBe(false);
    // The whole file still goes: the check refuses only what's cut off.
    expect((await prepare(page, "await jpeg(400, 300)")).ok, "whole").toBe(true);
  });
});
