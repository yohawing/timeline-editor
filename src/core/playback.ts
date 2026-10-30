import { clampTimelineLoopRange, clampTimelineTime } from "./display";
import type { TimeRange, TimelinePlaybackTarget } from "./contracts";

export type { TimelinePlaybackTarget } from "./contracts";

export interface TimelinePlaybackSnapshot {
  readonly available: boolean;
  readonly time: number;
  readonly duration: number;
  /** Absolute canonical bounds; omitted by legacy zero-based hosts. */
  readonly range?: TimeRange;
  readonly playing: boolean;
  readonly looping: boolean;
  /**
   * Playback rate multiplier applied to elapsed time (1 = normal speed).
   * Optional for backward compatibility: a controller that does not report
   * `rate` is treated as fixed at 1x. Consumers must not assume presence.
   */
  readonly rate?: number;
  /**
   * Optional in/out loop region, in canonical seconds. When `looping` is
   * true and this is set, playback wraps within `[loopRange.start,
   * loopRange.end)` instead of the full `[0, duration)` range. `null`/absent
   * means "loop the full duration" — backward compatible with controllers
   * that predate loop ranges.
   */
  readonly loopRange?: TimeRange | null;
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
  | ({ type: "setRate"; rate: number } & TargetedPlaybackCommand)
  | ({ type: "setLoopRange"; range: TimeRange | null } & TargetedPlaybackCommand);

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
  const range = snapshot.range ?? { start: 0, end: duration };
  const base = clampTimelineTime(snapshot.time, range);
  if (!snapshot.available || !snapshot.playing || !Number.isFinite(snapshot.sampledAtUnixMs)) return base;
  const rate = Number.isFinite(snapshot.rate) && (snapshot.rate as number) > 0 ? (snapshot.rate as number) : 1;
  const elapsed = (Math.max(0, nowUnixMs - (snapshot.sampledAtUnixMs ?? nowUnixMs)) / 1000) * rate;
  const projected = base + elapsed;
  if (snapshot.looping && duration > 0) {
    const loopRange = clampTimelineLoopRange(snapshot.loopRange, range);
    const loopStart = loopRange?.start ?? range.start;
    const loopEnd = loopRange?.end ?? range.end;
    const span = loopEnd - loopStart;
    if (span > 0 && projected >= loopStart) return loopStart + ((projected - loopStart) % span);
    return range.start + ((projected - range.start) % duration);
  }
  return Math.min(range.end, projected);
}

export function createLocalPlaybackController(durationOrRange: number | TimeRange, initialTime?: number): TimelinePlaybackController {
  const range = typeof durationOrRange === "number" ? { start: 0, end: durationOrRange } : durationOrRange;
  const duration = range.end - range.start;
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || !Number.isFinite(duration) || duration < 0) throw new RangeError("Playback duration must be finite and non-negative");
  let snapshot: TimelinePlaybackSnapshot = {
    available: true,
    time: clampTimelineTime(initialTime ?? range.start, range),
    duration,
    range,
    playing: false,
    looping: false,
    rate: 1,
    loopRange: null,
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
      const loopRange = clampTimelineLoopRange(snapshot.loopRange, range);
      const loopEnd = snapshot.looping ? (loopRange?.end ?? range.end) : range.end;
      if (time >= loopEnd) {
        if (snapshot.looping && duration > 0) {
          const loopStart = loopRange?.start ?? range.start;
          const span = loopEnd - loopStart;
          time = span > 0 ? loopStart + ((time - loopStart) % span) : 0;
        } else {
          time = range.end;
          playing = false;
          stopTimer();
        }
      }
      snapshot = { ...snapshot, time, playing, sampledAtUnixMs: Date.now() };
      notify();
    }, 100);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch: (command) => {
      // Settle elapsed time before changing state/rate or seeking.
      snapshot = { ...snapshot, time: projectTimelinePlaybackTime(snapshot), sampledAtUnixMs: Date.now() };
      lastTick = performance.now();
      switch (command.type) {
        case "play":
          if (!snapshot.playing) { snapshot = { ...snapshot, target: command.target, playing: true, sampledAtUnixMs: Date.now() }; startTimer(); notify(); }
          break;
        case "pause":
          stopTimer();
          if (snapshot.playing) { snapshot = { ...snapshot, target: command.target, playing: false }; notify(); }
          break;
        case "seek":
          snapshot = { ...snapshot, target: command.target, time: clampTimelineTime(command.time, range), sampledAtUnixMs: Date.now() };
          notify();
          break;
        case "setLooping":
          snapshot = { ...snapshot, target: command.target, looping: command.looping };
          notify();
          break;
        case "setLoopRange":
          snapshot = { ...snapshot, target: command.target, loopRange: clampTimelineLoopRange(command.range, range) };
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
