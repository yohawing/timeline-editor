import type { TimelineItem, TimeRange } from "./contracts";

export type TimelineEditMode = "move" | "resize-start" | "resize-end";
export interface TimelineItemEdit {
  item: TimelineItem;
  mode: TimelineEditMode;
  next: TimelineItem;
}

/** Propose a bounded edit without mutating the data source. */
export function proposeTimelineItemEdit(item: TimelineItem, mode: TimelineEditMode, delta: number, bounds: TimeRange, fps: number): TimelineItemEdit {
  if (!Number.isFinite(delta) || !Number.isFinite(fps) || fps <= 0 ||
    !Number.isFinite(bounds.start) || !Number.isFinite(bounds.end) || bounds.end < bounds.start) throw new RangeError("Invalid edit bounds or delta");
  const snapped = Math.round(delta * fps) / fps;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  if (item.kind !== "clip") {
    if (mode !== "move") throw new RangeError("Only clips can be resized");
    return { item, mode, next: { ...item, time: clamp(item.time + snapped, bounds.start, bounds.end) } };
  }
  const { start, end } = item.range;
  const length = end - start;
  if (length <= 0 || length > bounds.end - bounds.start) throw new RangeError("Clip cannot fit edit bounds");
  let range: TimeRange;
  if (mode === "move") {
    const nextStart = clamp(start + snapped, bounds.start, bounds.end - length);
    range = { start: nextStart, end: nextStart + length };
  } else if (mode === "resize-start") {
    range = { start: clamp(start + snapped, bounds.start, end - Math.min(length, 1 / fps)), end };
  } else {
    range = { start, end: clamp(end + snapped, start + Math.min(length, 1 / fps), bounds.end) };
  }
  return { item, mode, next: { ...item, range } };
}
