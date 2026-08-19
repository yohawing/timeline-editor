export type TimelineDisplayMode = "frames" | "seconds";
export type TimelineSeekPolicy = "unsnapped" | "frame-snap";

export function normalizeFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError("Timeline frameRate must be finite and positive");
  }
  return frameRate;
}

export function clampTimelineTime(time: number, timeEnd: number): number {
  const end = Number.isFinite(timeEnd) && timeEnd >= 0 ? timeEnd : 0;
  if (Number.isNaN(time) || time === -Infinity) return 0;
  if (time === Infinity) return end;
  return Math.min(end, Math.max(0, time));
}

/** Display formatting never changes canonical seconds. */
export function snapTimelineTimeToFrame(time: number, frameRate = 24): number {
  if (!Number.isFinite(time)) return 0;
  const fps = normalizeFrameRate(frameRate);
  return Math.round(time * fps) / fps;
}

export function resolveTimelineSeekTime(
  time: number,
  timeEnd: number,
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
  timeEnd: number,
  displayMode: TimelineDisplayMode,
  frameRate = 24,
): string {
  const fps = normalizeFrameRate(frameRate);
  const canonical = clampTimelineTime(time, timeEnd);
  const end = clampTimelineTime(timeEnd, timeEnd);
  if (displayMode === "frames") {
    return `${String(Math.round(canonical * fps)).padStart(4, "0")} / ${String(Math.round(end * fps)).padStart(4, "0")}`;
  }
  return `${canonical.toFixed(2)} / ${end.toFixed(2)} s`;
}

export function formatCompactTimelineReadout(
  time: number,
  timeEnd: number,
  displayMode: TimelineDisplayMode,
  frameRate = 24,
): string {
  const fps = normalizeFrameRate(frameRate);
  const canonical = clampTimelineTime(time, timeEnd);
  return displayMode === "frames"
    ? `${String(Math.round(canonical * fps)).padStart(4, "0")} f`
    : `${canonical.toFixed(2)} s`;
}

export function formatTimelineTick(time: number, displayMode: TimelineDisplayMode, frameRate = 24): string {
  const fps = normalizeFrameRate(frameRate);
  return displayMode === "frames"
    ? String(Math.round(time * fps)).padStart(4, "0")
    : `${time.toFixed(1)}s`;
}

export function visibleTimelineTicks(
  timeEnd: number,
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number,
  tickStep: number,
  overscanTicks = 2,
  maxTicks = 512,
): number[] {
  const end = Number.isFinite(timeEnd) ? Math.max(0, timeEnd) : 0;
  const scale = Number.isFinite(pixelsPerSecond) ? Math.max(0.001, pixelsPerSecond) : 1;
  const step = Number.isFinite(tickStep) ? Math.max(0.001, tickStep) : 1;
  const left = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const overscan = Number.isFinite(overscanTicks) ? Math.max(0, Math.floor(overscanTicks)) : 0;
  const maxIndex = Math.floor(end / step);
  const visibleLeft = Math.min(left, Math.max(0, end * scale - width));
  const visibleRight = Math.min(end, (visibleLeft + width) / scale);
  const first = Math.max(0, Math.floor(visibleLeft / scale / step) - overscan);
  const last = Math.min(maxIndex, Math.ceil(visibleRight / step) + overscan);
  const count = Math.min(Math.max(0, Math.floor(maxTicks)), Math.max(0, last - first + 1));
  return Array.from({ length: count }, (_, index) => (first + index) * step);
}
