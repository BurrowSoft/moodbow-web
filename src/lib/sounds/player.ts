import { renderLoop, type SoundId } from "./synth";

// The calming sounds player (1.4 B), as the app's (moodbow-app #253): one sound at a time, from a
// seamless loop made in the browser and played natively (no worklet: the CSP's strict-dynamic
// would block one, and a native loop needs no timers, so it plays on with the tab hidden or the
// screen off). Linear fades on the audio clock: in over 3 s on Play and Resume; out over 1 s on
// Stop and Pause; 20 s at a timer's end. Another sound while one plays: the old one is cut at
// once and the new one fades in. A pause of 30 min stops it.
export const SOUND_RULES = {
  timerMinutes: [15, 30, 45, 60] as const,
  fadeInSeconds: 3,
  fadeOutSeconds: 1,
  endFadeSeconds: 20,
  pauseStopMs: 30 * 60 * 1000,
  // The generators peak at 0.9 or less; the device's own volume does the rest.
  volume: 1,
};
export type TimerMinutes = (typeof SOUND_RULES.timerMinutes)[number] | null;
export type PlayerState = { status: "idle" } | { status: "loading" | "playing" | "paused"; sound: SoundId; endsIn: number | null };

type Ctx = AudioContext;
const AudioCtor = (): (new () => Ctx) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
};
export const soundsSupported = () => AudioCtor() !== null;

export class SoundPlayer {
  private ctx: Ctx | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private sound: SoundId | null = null;
  private loading = false;
  private paused = false;
  // With a timer: when it ends (audio clock) while playing; what's left while paused.
  private endAt: number | null = null;
  private leftAtPause: number | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  // Each start is a new one: a late "ended" or render from an older start changes nothing.
  private generation = 0;
  private buffers = new Map<SoundId, AudioBuffer>();

  constructor(private readonly onChange: (state: PlayerState) => void) {}

  state(): PlayerState {
    if (!this.sound) return { status: "idle" };
    const endsIn = this.paused ? this.leftAtPause : this.endAt === null || !this.ctx ? null : Math.max(0, this.endAt - this.ctx.currentTime);
    return { status: this.loading ? "loading" : this.paused ? "paused" : "playing", sound: this.sound, endsIn };
  }

  // Called from the tap itself: the context is made (or resumed) inside the user's gesture.
  async play(sound: SoundId, minutes: TimerMinutes): Promise<boolean> {
    const Ctor = AudioCtor();
    if (!Ctor) return false;
    const gen = ++this.generation;
    this.clearTimers();
    this.ctx ??= new Ctor();
    const ctx = this.ctx;
    // The old one, cut at once (no fade).
    this.cut();
    this.sound = sound;
    this.paused = false;
    this.leftAtPause = null;
    this.endAt = null;
    this.loading = true;
    this.emit();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    let buffer = this.buffers.get(sound);
    if (!buffer) {
      const samples = await renderLoop(sound, ctx.sampleRate);
      if (gen !== this.generation) return false;
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples, 0);
      // Only the latest is kept (a minute of mono audio is a few megabytes).
      this.buffers.clear();
      this.buffers.set(sound, buffer);
    }
    if (gen !== this.generation) return false;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.onended = () => {
      if (gen === this.generation && this.source === source) this.finish();
    };
    const now = ctx.currentTime;
    source.start(now);
    this.source = source;
    this.gain = gain;
    this.loading = false;
    this.schedule(now, minutes === null ? null : minutes * 60);
    this.emit();
    return true;
  }

  pause(): void {
    const { ctx, gain } = this;
    if (!ctx || !gain || !this.source || this.paused || this.loading) return;
    this.paused = true;
    const now = ctx.currentTime;
    this.leftAtPause = this.endAt === null ? null : Math.max(0, this.endAt - now);
    this.endAt = null;
    this.ramp(gain, now, 0, SOUND_RULES.fadeOutSeconds);
    // Quiet first, then the clock stops (and the timer with it).
    this.suspendTimer = setTimeout(() => {
      if (this.paused) void ctx.suspend().catch(() => undefined);
    }, SOUND_RULES.fadeOutSeconds * 1000);
    this.pauseTimer = setTimeout(() => this.stop(), SOUND_RULES.pauseStopMs);
    this.emit();
  }

  async resume(): Promise<void> {
    const { ctx } = this;
    if (!ctx || !this.source || !this.paused) return;
    this.clearTimers();
    this.paused = false;
    await ctx.resume().catch(() => undefined);
    this.schedule(ctx.currentTime, this.leftAtPause);
    this.leftAtPause = null;
    this.emit();
  }

  // Stop: out over 1 s, then quiet. The context stays for the next play.
  stop(): void {
    this.generation++;
    this.clearTimers();
    const { ctx, source, gain } = this;
    if (ctx && source && gain) {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const now = ctx.currentTime;
      this.ramp(gain, now, 0, SOUND_RULES.fadeOutSeconds);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      try {
        source.stop(now + SOUND_RULES.fadeOutSeconds);
      } catch {
        // already stopped
      }
    }
    this.finish();
  }

  // Signing out, or leaving the page: everything goes at once, the context too.
  dispose(): void {
    this.generation++;
    this.clearTimers();
    this.cut();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.buffers.clear();
    this.finish();
  }

  // From `now`: in over 3 s; with `left` seconds of timer, out over the last 20 s and ended there.
  private schedule(now: number, left: number | null): void {
    const { gain, source } = this;
    if (!gain || !source) return;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(SOUND_RULES.volume, now + SOUND_RULES.fadeInSeconds);
    if (left === null) {
      this.endAt = null;
      return;
    }
    const end = now + left;
    this.endAt = end;
    const fadeFrom = Math.max(now + SOUND_RULES.fadeInSeconds, end - SOUND_RULES.endFadeSeconds);
    gain.gain.setValueAtTime(SOUND_RULES.volume, fadeFrom);
    gain.gain.linearRampToValueAtTime(0, end);
    // A later stop() replaces an earlier one's time (a resumed timer).
    source.stop(end);
  }

  private ramp(gain: GainNode, now: number, to: number, seconds: number): void {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  }

  private cut(): void {
    const { source, gain } = this;
    this.source = null;
    this.gain = null;
    if (!source || !gain) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
    gain.disconnect();
  }

  private clearTimers(): void {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.pauseTimer = null;
    this.suspendTimer = null;
  }

  private finish(): void {
    this.clearTimers();
    this.sound = null;
    this.source = null;
    this.gain = null;
    this.endAt = null;
    this.leftAtPause = null;
    this.paused = false;
    this.loading = false;
    this.emit();
  }

  private emit(): void {
    this.onChange(this.state());
  }
}

// "{n} min left": whole minutes, rounded up, so it reads 1 until the very end.
export const minutesLeft = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
