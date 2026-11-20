// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generator, isSoundId, renderLoop, SOUND_IDS } from "./synth";

// The four calming sounds (1.4 B): the app's limits (SoundSynthTest, moodbow-app #253): peaks at
// 0.9 or less, never silent (RMS above 0.02); the same output every time; a loop with no seam.
const SR = 44100;
const take = (id: (typeof SOUND_IDS)[number], seconds: number, sr = SR) => {
  const g = generator(id, sr);
  return Float32Array.from({ length: Math.round(seconds * sr) }, () => g());
};
const stats = (s: Float32Array) => {
  let peak = 0;
  let sq = 0;
  for (const v of s) {
    peak = Math.max(peak, Math.abs(v));
    sq += v * v;
  }
  return { peak, rms: Math.sqrt(sq / s.length) };
};

describe("calming sounds: the generators", () => {
  it("four sounds, by id", () => {
    expect(SOUND_IDS).toEqual(["rain", "waves", "brown", "hum"]);
    expect(isSoundId("rain")).toBe(true);
    expect(isSoundId("thunder")).toBe(false);
  });

  for (const id of SOUND_IDS) {
    it(`${id}: peak ≤ 0.9 and RMS > 0.02 over 20 s, at 44.1 and 48 kHz`, () => {
      for (const sr of [44100, 48000]) {
        const { peak, rms } = stats(take(id, 20, sr));
        expect(peak, `${id} ${sr} peak`).toBeLessThanOrEqual(0.9);
        expect(rms, `${id} ${sr} rms`).toBeGreaterThan(0.02);
      }
    });

    it(`${id}: the same samples every time (seeded)`, () => {
      const a = take(id, 1);
      const b = take(id, 1);
      expect(Array.from(a.slice(1000, 1010))).toEqual(Array.from(b.slice(1000, 1010)));
    });
  }

  it("rain has drops: short bursts above its bed", () => {
    const s = take("rain", 5);
    const { rms } = stats(s);
    expect(Array.from(s).filter((v) => Math.abs(v) > rms * 3).length).toBeGreaterThan(10);
  });
});

describe("calming sounds: the loop", () => {
  it("is exactly `seconds` long, and the end leads into the start with no jump", async () => {
    for (const id of SOUND_IDS) {
      const loop = await renderLoop(id, 8000, { seconds: 6, fade: 1, yieldEvery: 0 });
      expect(loop.length).toBe(48000);
      // Around the seam the step is no bigger than the sound's usual sample-to-sample step.
      const steps = Array.from({ length: loop.length - 1 }, (_, i) => Math.abs(loop[i + 1] - loop[i]));
      const typical = steps.slice().sort((x, y) => x - y)[Math.floor(steps.length * 0.999)];
      expect(Math.abs(loop[0] - loop[loop.length - 1]), id).toBeLessThanOrEqual(typical + 1e-6);
      const { peak } = stats(loop);
      expect(peak, id).toBeLessThanOrEqual(0.9);
    }
  });

  // The Web Tester's #367 S3: what is played is the whole minute's loop, folded (brown peaked at
  // 0.919 at 48 kHz). Every sound's real loop, at both usual rates, stays at 0.9 or less and audible.
  it("the loop the player plays (60 s at 44.1 and 48 kHz): peak ≤ 0.9, RMS > 0.02", async () => {
    for (const sr of [44100, 48000]) {
      for (const id of SOUND_IDS) {
        const { peak, rms } = stats(await renderLoop(id, sr, { yieldEvery: 0 }));
        expect(peak, `${id} ${sr} peak`).toBeLessThanOrEqual(0.9);
        expect(rms, `${id} ${sr} rms`).toBeGreaterThan(0.02);
      }
    }
  }, 60000);

  it("gives the page back while it renders", async () => {
    let pauses = 0;
    await renderLoop("hum", 8000, { seconds: 2, fade: 0.5, yieldEvery: 4000, pause: async () => void pauses++ });
    expect(pauses).toBeGreaterThanOrEqual(4);
  });
});
