import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { minutesLeft, SOUND_RULES, SoundPlayer, type PlayerState } from "./player";

// The player against a fake Web Audio (1.4 B, the app's #253 rules): fades in 3 s on Play and
// Resume, out 1 s on Stop and Pause, 20 s at a timer's end; another sound cuts the old one at once;
// a 30 min pause stops it; leaving closes everything.
vi.mock("./synth", () => ({ renderLoop: async () => new Float32Array(16) }));

type Event = [string, ...number[]];
class FakeParam {
  value = 0;
  events: Event[] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(["ramp", v, t]);
  }
  cancelScheduledValues(t: number) {
    this.events.push(["cancel", t]);
  }
}
class FakeNode {
  connect() {}
  disconnect() {}
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  start(t: number) {
    this.starts.push(t);
  }
  stop(t?: number) {
    this.stops.push(t);
  }
}
const made = { gains: [] as FakeGain[], sources: [] as FakeSource[], contexts: [] as FakeCtx[] };
class FakeCtx {
  currentTime = 100;
  sampleRate = 8000;
  state: "running" | "suspended" | "closed" = "running";
  destination = {};
  constructor() {
    made.contexts.push(this);
  }
  createGain() {
    const g = new FakeGain();
    made.gains.push(g);
    return g;
  }
  createBufferSource() {
    const s = new FakeSource();
    made.sources.push(s);
    return s;
  }
  createBuffer() {
    return { copyToChannel() {} };
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}

let states: PlayerState[] = [];
const last = () => states[states.length - 1];
beforeEach(() => {
  vi.useFakeTimers();
  made.gains = [];
  made.sources = [];
  made.contexts = [];
  states = [];
  vi.stubGlobal("AudioContext", FakeCtx);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const player = () => new SoundPlayer((s) => states.push(s));

describe("SoundPlayer", () => {
  it("Play: a looping source, faded in over 3 s; until stopped: no end", async () => {
    const p = player();
    expect(await p.play("rain", null)).toBe(true);
    const [s] = made.sources;
    const [g] = made.gains;
    expect(s.loop).toBe(true);
    expect(s.starts).toEqual([100]);
    expect(g.gain.events).toContainEqual(["set", 0, 100]);
    expect(g.gain.events).toContainEqual(["ramp", SOUND_RULES.volume, 103]);
    expect(s.stops).toEqual([]);
    expect(last()).toEqual({ status: "playing", sound: "rain", endsIn: null });
  });

  it("a timer: out over its last 20 s, and the source ends then", async () => {
    const p = player();
    await p.play("waves", 15);
    const [s] = made.sources;
    const [g] = made.gains;
    const end = 100 + 15 * 60;
    expect(g.gain.events).toContainEqual(["set", SOUND_RULES.volume, end - 20]);
    expect(g.gain.events).toContainEqual(["ramp", 0, end]);
    expect(s.stops).toEqual([end]);
    expect(last()).toMatchObject({ status: "playing", endsIn: 900 });
    s.onended?.();
    expect(last()).toEqual({ status: "idle" });
  });

  it("another sound while one plays: the old one is cut at once, the new one fades in", async () => {
    const p = player();
    await p.play("rain", null);
    await p.play("hum", null);
    const [old, next] = made.sources;
    expect(old.stops).toEqual([undefined]);
    expect(next.starts).toEqual([100]);
    expect(made.gains[1].gain.events).toContainEqual(["ramp", SOUND_RULES.volume, 103]);
    expect(last()).toMatchObject({ sound: "hum", status: "playing" });
  });

  it("Pause: out over 1 s, then the clock stops; the timer waits; Resume fades in and moves the end", async () => {
    const p = player();
    await p.play("brown", 15);
    const ctx = made.contexts[0];
    const [g] = made.gains;
    const [s] = made.sources;
    ctx.currentTime = 400;
    p.pause();
    expect(g.gain.events).toContainEqual(["ramp", 0, 401]);
    expect(last()).toMatchObject({ status: "paused", endsIn: 600 });
    vi.advanceTimersByTime(1000);
    expect(ctx.state).toBe("suspended");
    ctx.currentTime = 401;
    await p.resume();
    expect(g.gain.events).toContainEqual(["ramp", SOUND_RULES.volume, 404]);
    expect(s.stops.at(-1)).toBe(401 + 600);
    expect(last()).toMatchObject({ status: "playing", endsIn: 600 });
  });

  it("a pause of 30 minutes stops it", async () => {
    const p = player();
    await p.play("rain", null);
    p.pause();
    vi.advanceTimersByTime(SOUND_RULES.pauseStopMs);
    expect(last()).toEqual({ status: "idle" });
  });

  it("Stop: out over 1 s; dispose (leaving, sign-out) closes the context", async () => {
    const p = player();
    await p.play("rain", null);
    p.stop();
    expect(made.gains[0].gain.events).toContainEqual(["ramp", 0, 101]);
    expect(made.sources[0].stops).toEqual([101]);
    expect(last()).toEqual({ status: "idle" });
    await p.play("rain", null);
    p.dispose();
    expect(made.contexts[0].state).toBe("closed");
  });

  it("without Web Audio: play says no", async () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(await player().play("rain", null)).toBe(false);
  });

  it("minutes left: rounded up, at least 1", () => {
    expect(minutesLeft(900)).toBe(15);
    expect(minutesLeft(61)).toBe(2);
    expect(minutesLeft(5)).toBe(1);
    expect(minutesLeft(0)).toBe(1);
  });
});
