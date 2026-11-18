"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dialogButton } from "@/components/Dialog";
import { onSignOut } from "@/lib/signOutSignal";
import { minutesLeft, SOUND_RULES, SoundPlayer, soundsSupported, type PlayerState, type TimerMinutes } from "@/lib/sounds/player";
import { SOUND_IDS, type SoundId } from "@/lib/sounds/synth";

const NAME = { rain: "rain", waves: "waves", brown: "brown", hum: "hum" } as const satisfies Record<SoundId, string>;
const choice = (on: boolean) =>
  `inline-flex min-h-11 items-center justify-center rounded-full border px-[16px] font-medium ${on ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-text"}`;

// Whether this browser can make sounds at all, read once on the client (the server says yes, so
// the first paint matches; a browser without Web Audio then shows the line instead).
const subscribeNever = () => () => undefined;
const useSupported = () => useSyncExternalStore(subscribeNever, soundsSupported, () => true);

// Calming sounds (1.4 B, the app's screen): pick a sound and a timer, Play; Pause or Stop. It
// plays on with the tab hidden (as the app with the screen off); leaving the page or signing out
// stops it. The lock screen and media controls only ever say "Sound playing" (never the feature
// or the sound). Nothing about what's played is counted or stored.
export function CalmingSounds({ uid }: { uid: string }) {
  const t = useTranslations("sounds");
  const supported = useSupported();
  const [sound, setSound] = useState<SoundId>("rain");
  const [timer, setTimer] = useState<TimerMinutes>(SOUND_RULES.timerMinutes[0]);
  const [state, setState] = useState<PlayerState>({ status: "idle" });
  const player = useRef<SoundPlayer | null>(null);

  const get = () => (player.current ??= new SoundPlayer(setState));
  useEffect(() => () => player.current?.dispose(), []);
  useEffect(() => onSignOut(({ uid: who }) => who === uid && player.current?.dispose()), [uid]);

  const active = state.status !== "idle";
  const playing = state.status === "playing";
  const paused = state.status === "paused";

  // The minutes left, read from the player again every 15 s while a timer runs.
  const timed = playing && state.endsIn !== null;
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => {
      if (player.current) setState(player.current.state());
    }, 15000);
    return () => clearInterval(id);
  }, [timed]);
  const endsIn = state.status === "idle" ? null : state.endsIn;
  const status = !active ? null : endsIn === null ? t("untilStopped") : t("left", { n: minutesLeft(endsIn) });

  // Media controls: neutral words only, and the three actions.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms || typeof MediaMetadata === "undefined") return;
    if (!active) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }
    ms.metadata = new MediaMetadata({ title: paused ? t("lockPaused") : endsIn === null ? t("lock") : t("lockLeft", { n: minutesLeft(endsIn) }) });
    ms.playbackState = paused ? "paused" : "playing";
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // not supported here
      }
    };
    set("play", () => void player.current?.resume());
    set("pause", () => player.current?.pause());
    set("stop", () => player.current?.stop());
    return () => {
      set("play", null);
      set("pause", null);
      set("stop", null);
    };
  }, [active, paused, endsIn, t]);

  if (!supported) {
    return (
      <p data-testid="sounds-unavailable" className="text-text">
        {t("unavailable")}
      </p>
    );
  }

  const play = () => void get().play(sound, timer);
  return (
    <div className="space-y-6" data-testid="sounds">
      <fieldset>
        <legend className="sr-only">{t("title")}</legend>
        <div className="flex flex-wrap gap-[8px]">
          {SOUND_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={sound === id}
              data-testid={`sounds-${id}`}
              onClick={() => {
                setSound(id);
                // A sound already playing switches at once (the old one cut, the new one faded in).
                if (active) void get().play(id, timer);
              }}
              className={choice(sound === id)}
            >
              {t(NAME[id])}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-medium text-text">{t("timer")}</legend>
        <div className="flex flex-wrap gap-[8px]">
          {[...SOUND_RULES.timerMinutes, null].map((m) => (
            <button key={m ?? "until"} type="button" aria-pressed={timer === m} data-testid={`sounds-timer-${m ?? "until"}`} onClick={() => setTimer(m as TimerMinutes)} className={choice(timer === m)}>
              {m === null ? t("untilStop") : t("minutes", { n: m })}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-[12px]">
        {!active || state.status === "loading" ? (
          <button type="button" data-testid="sounds-play" disabled={state.status === "loading"} onClick={play} className={dialogButton(true)}>
            {t("play")}
          </button>
        ) : paused ? (
          <button type="button" data-testid="sounds-resume" onClick={() => void player.current?.resume()} className={dialogButton(true)}>
            {t("play")}
          </button>
        ) : (
          <button type="button" data-testid="sounds-pause" onClick={() => player.current?.pause()} className={dialogButton(true)}>
            {t("pause")}
          </button>
        )}
        {active && (
          <button type="button" data-testid="sounds-stop" onClick={() => player.current?.stop()} className={dialogButton()}>
            {t("stop")}
          </button>
        )}
      </div>
      <p role="status" data-testid="sounds-status" className="text-sm text-muted">
        {status ?? ""}
      </p>
    </div>
  );
}
