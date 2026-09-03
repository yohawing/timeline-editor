import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  clampPixelsPerSecond,
  clampRowZoom,
  clampScrollLeft,
  fitPixelsPerSecond,
  panViewByFraction,
  timelineGridSteps,
  viewRangeFromThumb,
  viewRangeThumb,
  wheelZoomFactor,
  zoomAroundAnchor,
} from "./viewRange";

describe("fit / clamp", () => {
  it("fits the whole clip to the viewport and falls back without a clip or a viewport", () => {
    expect(fitPixelsPerSecond(10, 500)).toBe(50);
    expect(fitPixelsPerSecond(0, 500)).toBe(DEFAULT_PIXELS_PER_SECOND);
    expect(fitPixelsPerSecond(10, 0)).toBe(DEFAULT_PIXELS_PER_SECOND);
  });

  it("never zooms out past the fit, never in past the maximum", () => {
    expect(clampPixelsPerSecond(1, 10, 500)).toBe(50);
    expect(clampPixelsPerSecond(1e9, 10, 500)).toBe(MAX_PIXELS_PER_SECOND);
    expect(clampPixelsPerSecond(120, 10, 500)).toBe(120);
  });

  it("keeps scrollLeft inside the content", () => {
    expect(clampScrollLeft(-5, 10, 100, 500)).toBe(0);
    expect(clampScrollLeft(999, 10, 100, 500)).toBe(500); // 1000 - 500
    expect(clampScrollLeft(50, 1, 100, 500)).toBe(0); // clip narrower than the viewport
  });

  it("clamps the row zoom", () => {
    expect(clampRowZoom(0.1)).toBe(0.6);
    expect(clampRowZoom(10)).toBe(3);
    expect(clampRowZoom(Number.NaN)).toBe(1);
  });
});

describe("zoomAroundAnchor", () => {
  it("keeps the time under the anchor at the same screen x", () => {
    const view = { pixelsPerSecond: 100, scrollLeft: 200 }; // anchor x=100 -> t=3s
    const next = zoomAroundAnchor(view, 2, 100, 20, 500);
    expect(next.pixelsPerSecond).toBe(200);
    expect((next.scrollLeft + 100) / next.pixelsPerSecond).toBeCloseTo(3, 9);
  });

  it("clamps at the fit when zooming out", () => {
    const next = zoomAroundAnchor({ pixelsPerSecond: 30, scrollLeft: 10 }, 0.1, 0, 20, 500);
    expect(next.pixelsPerSecond).toBe(25);
    expect(next.scrollLeft).toBe(0);
  });

  it("wheel: positive deltaY (wheel down) zooms in, negative zooms out, lines scale up", () => {
    expect(wheelZoomFactor(100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-100)).toBeLessThan(1);
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48), 9);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  it("grid steps become frame-based once a frame is wide enough", () => {
    expect(timelineGridSteps(30, 30)).toEqual({ gridStep: 1, labelStep: 1, frameGrid: false }); // 1px/frame -> coarse seconds
    expect(timelineGridSteps(90, 30).frameGrid).toBe(false); // 3px/frame -> every 5 frames
    expect(timelineGridSteps(90, 30).gridStep).toBeCloseTo(5 / 30, 9);
    const fine = timelineGridSteps(300, 30); // 10px/frame -> 1F grid, labels every 10F
    expect(fine.frameGrid).toBe(true);
    expect(fine.gridStep).toBeCloseTo(1 / 30, 9);
    expect(fine.labelStep).toBeCloseTo(10 / 30, 9);
    expect(timelineGridSteps(450, 30).labelStep).toBeCloseTo(5 / 30, 9); // 15px/frame -> label every 5F
    expect(timelineGridSteps(1500, 30).labelStep).toBeCloseTo(1 / 30, 9); // 50px/frame -> label every frame
  });
});

describe("range thumb", () => {
  it("round-trips a visible window through fractions", () => {
    const view = { pixelsPerSecond: 100, scrollLeft: 250 }; // clip 20s -> 2000px, view 500px: [0.125, 0.375)
    const thumb = viewRangeThumb(view, 20, 500);
    expect(thumb.start).toBeCloseTo(0.125, 9);
    expect(thumb.end).toBeCloseTo(0.375, 9);
    const back = viewRangeFromThumb(thumb, 20, 500);
    expect(back.pixelsPerSecond).toBeCloseTo(100, 9);
    expect(back.scrollLeft).toBeCloseTo(250, 9);
  });

  it("is the full bar when the clip fits or has no duration", () => {
    expect(viewRangeThumb({ pixelsPerSecond: 25, scrollLeft: 0 }, 20, 500)).toEqual({ start: 0, end: 1 });
    expect(viewRangeThumb({ pixelsPerSecond: 100, scrollLeft: 0 }, 0, 500)).toEqual({ start: 0, end: 1 });
  });

  it("refuses to let the handles cross, giving way on the moving side", () => {
    const fromEnd = viewRangeFromThumb({ start: 0.5, end: 0.5 }, 20, 500, "start");
    expect(fromEnd.pixelsPerSecond).toBe(MAX_PIXELS_PER_SECOND);
    expect(fromEnd.scrollLeft).toBeCloseTo(0.5 * 20 * MAX_PIXELS_PER_SECOND, 6);
    const fromStart = viewRangeFromThumb({ start: 1, end: 1 }, 20, 500, "none");
    expect(fromStart.pixelsPerSecond).toBe(MAX_PIXELS_PER_SECOND);
    expect(fromStart.scrollLeft).toBeCloseTo(20 * MAX_PIXELS_PER_SECOND - 500, 6);
  });

  it("pans by a fraction of the clip without changing the zoom", () => {
    const view = { pixelsPerSecond: 100, scrollLeft: 0 };
    const next = panViewByFraction(view, 0.25, 20, 500);
    expect(next).toEqual({ pixelsPerSecond: 100, scrollLeft: 500 });
    expect(panViewByFraction(view, 5, 20, 500).scrollLeft).toBe(1500);
  });
});
