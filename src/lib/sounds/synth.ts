// Calming sounds (1.4 B, specs/1.4-features.md §B; sounds-live): rain, waves, brown noise and a
// gentle hum, generated in code: procedural noise and filters, no audio files, nothing to license.
// A port of the Mobile Dev's prototype (apps/moodbow/design/sounds-proto/synth.mjs): the same
// generators and seeds, at any sample rate. Deterministic, so a test can pin the output.
export type SoundId = "rain" | "waves" | "brown" | "hum";
export const SOUND_IDS: readonly SoundId[] = ["rain", "waves", "brown", "hum"];
export const isSoundId = (v: unknown): v is SoundId => typeof v === "string" && (SOUND_IDS as readonly string[]).includes(v);

type Gen = () => number;

// xorshift32, in -1..1.
function rng(seed: number): Gen {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// An RBJ biquad: low-pass or band-pass. The frequency is kept below the rate's Nyquist limit (at a
// low sample rate, rain's 6 kHz would otherwise be past it, and the filter would blow up to NaN).
function biquad(sr: number, type: "lp" | "bp", fc: number, q: number): (x: number) => number {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const [b0, b1, b2] = type === "lp" ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [al, 0, -al];
  const a0 = 1 + al;
  const a1 = -2 * c;
  const a2 = 1 - al;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

// Brown noise: leaky integrated white noise, DC blocked.
function brownNoise(seed: number): Gen {
  const r = rng(seed);
  let b = 0;
  let px = 0;
  let py = 0;
  return () => {
    b = 0.998 * b + 0.02 * r();
    const y = b - px + 0.995 * py;
    px = b;
    py = y;
    return y * 3.5;
  };
}

// Pink noise (Paul Kellet's economy filter).
function pinkNoise(seed: number): Gen {
  const r = rng(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const w = r();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.18;
  };
}

const MAKERS: Record<SoundId, (sr: number) => Gen> = {
  brown: () => {
    const n = brownNoise(7);
    // A soft limit (UX, 19 Nov, both clients): brown noise wanders, and over long runs went above
    // the 0.9 ceiling; 0.9·tanh(x/0.9) leaves the quiet parts as they were and bends the peaks under.
    return () => 0.9 * Math.tanh((n() * 0.6) / 0.9);
  },
  // A bed of filtered pink noise and many small drops (short, decaying, band-passed bursts).
  rain: (sr) => {
    const bed = pinkNoise(11);
    const lp = biquad(sr, "lp", 6000, 0.7);
    const r = rng(23);
    const drops: { f: (x: number) => number; n: Gen; a: number; t: number }[] = [];
    // The prototype's drop rate (0.35% of samples at 44.1 kHz), kept per second at any rate.
    const chance = 1 - 0.0035 * (44100 / sr);
    return () => {
      let y = lp(bed()) * 0.35;
      if (r() > chance) drops.push({ f: biquad(sr, "bp", 2500 + 3500 * Math.abs(r()), 4), n: rng(1 + drops.length * 97 + (((r() + 1) * 1e6) | 0)), a: 0.15 + 0.35 * Math.abs(r()), t: 0 });
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        y += d.f(d.n()) * d.a * Math.exp(-d.t / (sr * 0.012));
        if (++d.t > sr * 0.08) drops.splice(i, 1);
      }
      return y;
    };
  },
  // Brown and pink noise through a low-pass whose cutoff and level swell on a slow, drifting cycle.
  waves: (sr) => {
    const b = brownNoise(31);
    const p = pinkNoise(37);
    const r = rng(41);
    let period = 9 * sr;
    let phase = 0;
    let y1 = 0;
    return () => {
      phase += 1 / period;
      if (phase >= 1) {
        phase -= 1;
        period = (7 + 5 * Math.abs(r())) * sr;
      }
      const swell = Math.sin(Math.PI * phase) ** 2;
      const a = Math.exp((-2 * Math.PI * (250 + 2200 * swell)) / sr);
      y1 = (1 - a) * (b() * 0.7 + p() * 0.5) + a * y1;
      return Math.tanh(y1 * (0.25 + 0.9 * swell) * 1.1) * 0.8;
    };
  },
  // Soft low partials with a slow vibrato and a breathing level; no noise.
  hum: (sr) => {
    const parts: [number, number][] = [
      [110, 0.5],
      [165, 0.22],
      [220, 0.16],
      [330, 0.05],
    ];
    const ph = parts.map(() => 0);
    let t = 0;
    return () => {
      const vib = 1 + 0.003 * Math.sin((2 * Math.PI * 0.15 * t) / sr);
      const lvl = 0.8 + 0.2 * Math.sin((2 * Math.PI * 0.07 * t) / sr);
      let y = 0;
      parts.forEach(([f, amp], i) => {
        ph[i] += (2 * Math.PI * f * vib) / sr;
        y += amp * Math.sin(ph[i]);
      });
      t++;
      return y * 0.5 * lvl;
    };
  },
};

export const generator = (id: SoundId, sampleRate: number): Gen => MAKERS[id](sampleRate);

// A loop that plays forever without a seam: seconds + fade of sound, the extra fade folded onto the
// start with an equal-power crossfade, so the last sample leads into the first. Made in steps that
// give the page back between them (yieldEvery samples; 0: all at once, for tests).
export const LOOP_SECONDS = 60;
export const LOOP_FADE_SECONDS = 2;
export async function renderLoop(id: SoundId, sampleRate: number, { seconds = LOOP_SECONDS, fade = LOOP_FADE_SECONDS, yieldEvery = sampleRate, pause = () => new Promise<void>((done) => setTimeout(done, 0)) }: { seconds?: number; fade?: number; yieldEvery?: number; pause?: () => Promise<void> } = {}): Promise<Float32Array<ArrayBuffer>> {
  const g = generator(id, sampleRate);
  const n = Math.round(seconds * sampleRate);
  const x = Math.round(fade * sampleRate);
  const out = new Float32Array(new ArrayBuffer(n * 4));
  const tail = new Float32Array(x);
  for (let i = 0; i < n + x; i++) {
    const v = g();
    if (i < n) out[i] = v;
    else tail[i - n] = v;
    if (yieldEvery > 0 && i > 0 && i % yieldEvery === 0) await pause();
  }
  for (let i = 0; i < x; i++) {
    const k = (i + 0.5) / x;
    out[i] = out[i] * Math.sin((k * Math.PI) / 2) + tail[i] * Math.cos((k * Math.PI) / 2);
  }
  // The app's ceiling (peaks at 0.9 or less) on what is actually played: over a whole minute, brown
  // noise can wander above it, and the fold adds two stretches together (the Web Tester, #367: 0.919
  // at 48 kHz). One gain for the whole loop, so the sound itself doesn't change.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > PEAK_LIMIT) {
    const scale = PEAK_LIMIT / peak;
    for (let i = 0; i < n; i++) out[i] *= scale;
  }
  return out;
}
export const PEAK_LIMIT = 0.9;
