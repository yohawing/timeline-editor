/**
 * Horizontal view-range math for the track viewport: how many pixels one
 * second takes (`pixelsPerSecond`) and how far the view is scrolled
 * (`scrollLeft`), plus the conversions the range scrollbar and wheel zoom
 * need. Pure functions, no DOM — the React layer owns the state and the
 * element, this module owns the arithmetic and the clamping rules:
 *
 * - The view never zooms out past "the whole clip fits the viewport"
 *   (`fitPixelsPerSecond`), and never zooms in past
 *   `MAX_PIXELS_PER_SECOND`.
 * - `scrollLeft` stays within `[0, contentWidth - viewportWidth]`.
 * - Zooming keeps the time under the pointer (or any anchor x) fixed on
 *   screen (`zoomAroundAnchor`), the way UE's Sequencer and most NLEs do.
 *
 * The range scrollbar ("view range bar") expresses the visible window as
 * fractions of the whole clip, `[start, end)` in `0..1`
 * (`viewRangeThumb` / `viewRangeFromThumb`), so it can be drawn as a thumb
 * with two resize handles regardless of the clip's actual length.
 */

export const MAX_PIXELS_PER_SECOND = 4000;
/** Used only while the clip has no duration or the viewport has no width
 * (first render, jsdom) — otherwise `fitPixelsPerSecond` decides. */
export const DEFAULT_PIXELS_PER_SECOND = 76;
export const ROW_ZOOM_MIN = 0.6;
export const ROW_ZOOM_MAX = 3;

export interface ViewRange {
  pixelsPerSecond: number;
  scrollLeft: number;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Pixels per second at which `durationSeconds` exactly fills `viewportWidth`. */
export function fitPixelsPerSecond(durationSeconds: number, viewportWidth: number): number {
  const duration = finite(durationSeconds, 0);
  const width = finite(viewportWidth, 0);
  if (duration <= 0 || width <= 0) return DEFAULT_PIXELS_PER_SECOND;
  return Math.min(MAX_PIXELS_PER_SECOND, width / duration);
}

/** Clamps a zoom level between "whole clip fits" and the maximum. */
export function clampPixelsPerSecond(pixelsPerSecond: number, durationSeconds: number, viewportWidth: number): number {
  const min = fitPixelsPerSecond(durationSeconds, viewportWidth);
  const value = finite(pixelsPerSecond, min);
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(min, value));
}

export function contentWidth(durationSeconds: number, pixelsPerSecond: number, viewportWidth: number): number {
  return Math.max(finite(viewportWidth, 0), Math.max(0, finite(durationSeconds, 0)) * pixelsPerSecond);
}

export function clampScrollLeft(scrollLeft: number, durationSeconds: number, pixelsPerSecond: number, viewportWidth: number): number {
  const max = Math.max(0, contentWidth(durationSeconds, pixelsPerSecond, viewportWidth) - finite(viewportWidth, 0));
  return Math.min(max, Math.max(0, finite(scrollLeft, 0)));
}

/**
 * Scales the zoom by `factor` (>1 zooms in) while keeping the time under
 * `anchorX` (pixels from the viewport's left edge) at the same screen
 * position. Result is clamped on both axes.
 */
export function zoomAroundAnchor(
  view: ViewRange,
  factor: number,
  anchorX: number,
  durationSeconds: number,
  viewportWidth: number,
): ViewRange {
  const pixelsPerSecond = clampPixelsPerSecond(view.pixelsPerSecond * finite(factor, 1), durationSeconds, viewportWidth);
  const anchorTime = (view.scrollLeft + anchorX) / view.pixelsPerSecond;
  const scrollLeft = clampScrollLeft(anchorTime * pixelsPerSecond - anchorX, durationSeconds, pixelsPerSecond, viewportWidth);
  return { pixelsPerSecond, scrollLeft };
}

/**
 * Wheel delta -> zoom factor. `deltaMode` follows `WheelEvent.deltaMode`
 * (0 pixels, 1 lines, 2 pages). One typical mouse notch (~100px) gives about
 * ×1.16; trackpad deltas are small and integrate smoothly.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-finite(pixels, 0) * 0.0015);
}

/** Wheel delta -> row-height zoom factor (Ctrl+wheel). Coarser than the time
 * axis so a notch is a visible step. */
export function wheelRowZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-finite(pixels, 0) * 0.002);
}

export function clampRowZoom(rowZoom: number): number {
  return Math.min(ROW_ZOOM_MAX, Math.max(ROW_ZOOM_MIN, finite(rowZoom, 1)));
}

export interface ViewRangeThumb {
  /** Fraction of the clip at the left edge of the view, `0..1`. */
  start: number;
  /** Fraction of the clip at the right edge of the view, `start..1`. */
  end: number;
}

/** The visible window as fractions of the whole clip. A clip that fits
 * entirely (or has no duration) yields the full `[0, 1]`. */
export function viewRangeThumb(view: ViewRange, durationSeconds: number, viewportWidth: number): ViewRangeThumb {
  const duration = finite(durationSeconds, 0);
  if (duration <= 0 || view.pixelsPerSecond <= 0) return { start: 0, end: 1 };
  const total = duration * view.pixelsPerSecond;
  const start = Math.min(1, Math.max(0, view.scrollLeft / total));
  const end = Math.min(1, Math.max(start, (view.scrollLeft + finite(viewportWidth, 0)) / total));
  return { start, end };
}

/**
 * Inverse of `viewRangeThumb`: the zoom/scroll that shows exactly
 * `[start, end)` of the clip. The window is kept at least `minFraction`
 * wide (so the handles can never cross) and inside `[0, 1]`; when `fixed`
 * names the handle that did not move, the other side gives way.
 */
export function viewRangeFromThumb(
  thumb: ViewRangeThumb,
  durationSeconds: number,
  viewportWidth: number,
  fixed: "start" | "end" | "none" = "none",
): ViewRange {
  const duration = finite(durationSeconds, 0);
  const width = finite(viewportWidth, 0);
  if (duration <= 0 || width <= 0) return { pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND, scrollLeft: 0 };
  const minFraction = Math.min(1, width / (MAX_PIXELS_PER_SECOND * duration));
  let start = Math.min(1, Math.max(0, finite(thumb.start, 0)));
  let end = Math.min(1, Math.max(0, finite(thumb.end, 1)));
  if (end - start < minFraction) {
    if (fixed === "start") end = Math.min(1, start + minFraction);
    else if (fixed === "end") start = Math.max(0, end - minFraction);
    else {
      const mid = (start + end) / 2;
      start = Math.max(0, mid - minFraction / 2);
      end = Math.min(1, start + minFraction);
    }
    if (end - start < minFraction - 1e-9) {
      // Pinned against an edge (floating-point slack above): shift the
      // whole window inward.
      if (start <= 0) end = minFraction;
      else start = 1 - minFraction;
    }
  }
  const pixelsPerSecond = clampPixelsPerSecond(width / ((end - start) * duration), duration, width);
  const scrollLeft = clampScrollLeft(start * duration * pixelsPerSecond, duration, pixelsPerSecond, width);
  return { pixelsPerSecond, scrollLeft };
}

/** Pans by a fraction of the clip (thumb drag / bar click), zoom unchanged. */
export function panViewByFraction(view: ViewRange, deltaFraction: number, durationSeconds: number, viewportWidth: number): ViewRange {
  const total = Math.max(0, finite(durationSeconds, 0)) * view.pixelsPerSecond;
  return {
    pixelsPerSecond: view.pixelsPerSecond,
    scrollLeft: clampScrollLeft(view.scrollLeft + finite(deltaFraction, 0) * total, durationSeconds, view.pixelsPerSecond, viewportWidth),
  };
}
