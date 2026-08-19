import { clampTimelineTime } from "./display";
import type { TimelinePlaybackTarget } from "./contracts";

export type { TimelinePlaybackTarget } from "./contracts";

export interface TimelinePlaybackSnapshot {
  readonly available: boolean;
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly looping: boolean;
  /**
   * Playback rate multiplier applied to elapsed time (1 = normal speed).
   * Optional for backward compatibility: a controller that does not report
   * `rate` is treated as fixed at 1x. Consumers must not assume presence.
   */
  readonly rate?: number;
  /** Runtime target represented by this snapshot, when available. */
  readonly target?: TimelinePlaybackTarget | null;
  /** Unix-ms sample time used for local projection while playing. */
  readonly sampledAtUnixMs?: number;
}

interface TargetedPlaybackCommand {
  readonly target: TimelinePlaybackTarget | null;
}

export type TimelinePlaybackCommand =
  | ({ type: "play" } & TargetedPlaybackCommand)
  | ({ type: "pause" } & TargetedPlaybackCommand)
  | ({ type: "seek"; time: number } & TargetedPlaybackCommand)
  | ({ type: "setLooping"; looping: boolean } & TargetedPlaybackCommand)
  | ({ type: "setRate"; rate: number } & TargetedPlaybackCommand);

export interface TimelinePlaybackController {
  getSnapshot(): TimelinePlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: TimelinePlaybackCommand): void | Promise<void>;
}

export function timelinePlaybackTargetEquals(
  left: TimelinePlaybackTarget | null | undefined,
  right: TimelinePlaybackTarget | null | undefined,
): boolean {
  return left?.instanceId === right?.instanceId && left?.clipIndex === right?.clipIndex;
}

export function resolveTimelinePlaybackTarget(
  selectedTarget: TimelinePlaybackTarget | null | undefined,
  snapshot: TimelinePlaybackSnapshot | null | undefined,
): TimelinePlaybackTarget | null {
  if (selectedTarget) return selectedTarget;
  const target = snapshot?.target;
  return snapshot?.available && target && target.instanceId.length > 0 && Number.isInteger(target.clipIndex) && target.clipIndex >= 0
    ? target
    : null;
}

/** Project a sampled playing snapshot to the current wall-clock time. */
export function projectTimelinePlaybackTime(
  snapshot: TimelinePlaybackSnapshot,
  nowUnixMs = Date.now(),
): number {
  const duration = Number.isFinite(snapshot.duration) && snapshot.duration >= 0 ? snapshot.duration : 0;
  const base = clampTimelineTime(snapshot.time, duration);
  if (!snapshot.available || !snapshot.playing || !Number.isFinite(snapshot.sampledAtUnixMs)) return base;
  const rate = Number.isFinite(snapshot.rate) && (snapshot.rate as number) > 0 ? (snapshot.rate as number) : 1;
  const elapsed = (Math.max(0, nowUnixMs - (snapshot.sampledAtUnixMs ?? nowUnixMs)) / 1000) * rate;
  const projected = base + elapsed;
  if (snapshot.looping && duration > 0) return projected % duration;
  return Math.min(duration, projected);
}

export function createLocalPlaybackController(duration: number, initialTime = 0): TimelinePlaybackController {
  if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Playback duration must be finite and non-negative");
  let snapshot: TimelinePlaybackSnapshot = {
    available: true,
    time: clampTimelineTime(initialTime, duration),
    duration,
    playing: false,
    looping: false,
    rate: 1,
    target: null,
    sampledAtUnixMs: Date.now(),
  };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastTick = 0;

  const notify = () => listeners.forEach((listener) => listener());
  const stopTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const startTimer = () => {
    if (timer !== undefined) return;
    lastTick = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      const rate = Number.isFinite(snapshot.rate) && (snapshot.rate as number) > 0 ? (snapshot.rate as number) : 1;
      const delta = (Math.max(0, now - lastTick) / 1000) * rate;
      lastTick = now;
      let time = snapshot.time + delta;
      let playing = true;
      if (time >= duration) {
        if (snapshot.looping && duration > 0) time %= duration;
        else { time = duration; playing = false; stopTimer(); }
      }
      snapshot = { ...snapshot, time, playing, sampledAtUnixMs: Date.now() };
      notify();
    }, 100);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch: (command) => {
      switch (command.type) {
        case "play":
          if (!snapshot.playing) { snapshot = { ...snapshot, target: command.target, playing: true, sampledAtUnixMs: Date.now() }; startTimer(); notify(); }
          break;
        case "pause":
          stopTimer();
          if (snapshot.playing) { snapshot = { ...snapshot, target: command.target, playing: false }; notify(); }
          break;
        case "seek":
          snapshot = { ...snapshot, target: command.target, time: clampTimelineTime(command.time, duration), sampledAtUnixMs: Date.now() };
          notify();
          break;
        case "setLooping":
          snapshot = { ...snapshot, target: command.target, looping: command.looping };
          notify();
          break;
        case "setRate": {
          const rate = Number.isFinite(command.rate) && command.rate > 0 ? command.rate : 1;
          snapshot = { ...snapshot, target: command.target, rate };
          notify();
          break;
        }
      }
    },
  };
}
