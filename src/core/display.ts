import type { TimeRange } from "./contracts";

export type TimelineDisplayMode = "frames" | "seconds";
export type TimelineSeekPolicy = "unsnapped" | "frame-snap";

export function normalizeFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError("Timeline frameRate must be finite and positive");
  }
  return frameRate;
}

export function clampTimelineTime(time: number, timeEnd: number | TimeRange): number {
  const range = typeof timeEnd === "number" ? { start: 0, end: Number.isFinite(timeEnd) ? Math.max(0, timeEnd) : 0 } : timeEnd;
  if (Number.isNaN(time) || time === -Infinity) return range.start;
  if (time === Infinity) return range.end;
  return Math.min(range.end, Math.max(range.start, time));
}

function formatFrame(value: number): string {
  const frame = Math.round(value);
  return `${frame < 0 ? "-" : ""}${String(Math.abs(frame)).padStart(4, "0")}`;
}

/** Display formatting never changes canonical seconds. */
export function snapTimelineTimeToFrame(time: number, frameRate = 24): number {
  if (!Number.isFinite(time)) return 0;
  const fps = normalizeFrameRate(frameRate);
  return Math.round(time * fps) / fps;
}

export function resolveTimelineSeekTime(
  time: number,
  timeEnd: number | TimeRange,
  policy: TimelineSeekPolicy = "unsnapped",
  frameRate = 24,
): number {
  const clamped = clampTimelineTime(time, timeEnd);
  return policy === "frame-snap"
    ? clampTimelineTime(snapTimelineTimeToFrame(clamped, frameRate), timeEnd)
    : clamped;
}

export function formatTimelineReadout(
  time: number,
  timeEnd: number | TimeRange,
  displayMode: TimelineDisplayMode,
  frameRate = 24,
): string {
  const fps = normalizeFrameRate(frameRate);
  const canonical = clampTimelineTime(time, timeEnd);
  const end = clampTimelineTime(typeof timeEnd === "number" ? timeEnd : timeEnd.end, timeEnd);
  if (displayMode === "frames") {
    return `${formatFrame(canonical * fps)} / ${formatFrame(end * fps)}`;
  }
  return `${canonical.toFixed(2)} / ${end.toFixed(2)} s`;
}

export function formatCompactTimelineReadout(
  time: number,
  timeEnd: number | TimeRange,
  displayMode: TimelineDisplayMode,
  frameRate = 24,
): string {
  const fps = normalizeFrameRate(frameRate);
  const canonical = clampTimelineTime(time, timeEnd);
  return displayMode === "frames"
    ? `${formatFrame(canonical * fps)} f`
    : `${canonical.toFixed(2)} s`;
}

/**
 * Clamp a candidate loop range to `[0, duration]` and normalize a degenerate
 * or malformed range (end <= start, non-finite bounds) to `null`, which
 * callers treat as "no loop range" (playback loops the full duration).
 */
export function clampTimelineLoopRange(range: TimeRange | null | undefined, duration: number | TimeRange): TimeRange | null {
  if (!range) return null;
  const end = typeof duration === "number" ? (Number.isFinite(duration) && duration >= 0 ? duration : 0) : duration;
  const start = clampTimelineTime(range.start, end);
  const rawEnd = clampTimelineTime(range.end, end);
  if (!(rawEnd > start)) return null;
  return { start, end: rawEnd };
}

export function formatTimelineTick(time: number, displayMode: TimelineDisplayMode, frameRate = 24): string {
  const fps = normalizeFrameRate(frameRate);
  return displayMode === "frames"
    ? String(Math.round(time * fps))
    : `${time.toFixed(1)}s`;
}

/** Coarsen labels only; grid positions and frame snapping keep their original steps. */
export function timelineRulerStep(baseStep: number, pixelsPerSecond: number, labelWidth: number): number {
  if (![baseStep, pixelsPerSecond, labelWidth].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Ruler spacing inputs must be finite and positive");
  }
  // The extra half-label also leaves room for labels clamped at viewport edges.
  const multiplier = Math.max(1, (labelWidth * 1.5 + 12) / pixelsPerSecond / baseStep);
  const power = 10 ** Math.floor(Math.log10(multiplier));
  const factor = [1, 2, 5, 10].find((value) => value * power >= multiplier)!;
  return baseStep * factor * power;
}

export function visibleTimelineTicks(
  timeEnd: number | TimeRange,
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number,
  tickStep: number,
  overscanTicks = 2,
  maxTicks = 512,
): number[] {
  const start = typeof timeEnd === "number" ? 0 : timeEnd.start;
  const end = typeof timeEnd === "number" ? (Number.isFinite(timeEnd) ? Math.max(0, timeEnd) : 0) : timeEnd.end - start;
  const scale = Number.isFinite(pixelsPerSecond) ? Math.max(0.001, pixelsPerSecond) : 1;
  const step = Number.isFinite(tickStep) ? Math.max(0.001, tickStep) : 1;
  const left = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const overscan = Number.isFinite(overscanTicks) ? Math.max(0, Math.floor(overscanTicks)) : 0;
  const maxIndex = Math.floor((start + end) / step);
  const visibleLeft = Math.min(left, Math.max(0, end * scale - width));
  const visibleRight = Math.min(end, (visibleLeft + width) / scale);
  const first = Math.max(Math.ceil(start / step), Math.floor((start + visibleLeft / scale) / step) - overscan);
  const last = Math.min(maxIndex, Math.ceil((start + visibleRight) / step) + overscan);
  const count = Math.min(Math.max(0, Math.floor(maxTicks)), Math.max(0, last - first + 1));
  return Array.from({ length: count }, (_, index) => (first + index) * step);
}
