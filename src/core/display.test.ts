import { describe, expect, it } from "vitest";
import {
  clampTimelineLoopRange,
  clampTimelineTime,
  formatCompactTimelineReadout,
  formatTimelineReadout,
  formatTimelineTick,
  timelineRulerStep,
  resolveTimelineSeekTime,
  snapTimelineTimeToFrame,
  visibleTimelineTicks,
} from "./display";

describe("timeline display policies", () => {
  it("does not zero-pad ruler labels, including signed and six-digit frames", () => {
    expect(formatTimelineTick(0, "frames", 30)).toBe("0");
    expect(formatTimelineTick(5, "frames", 30)).toBe("150");
    expect(formatTimelineTick(-5, "frames", 30)).toBe("-150");
    expect(formatTimelineTick(20000, "frames", 30)).toBe("600000");
    expect(formatTimelineTick(-0.02, "frames", 30)).toBe("-1");
    expect(formatTimelineTick(5, "seconds", 30)).toBe("5.0s");
  });

  it.each([0.015, 0.5, 15, 90, 450, 1500])("keeps enough label spacing at %s px/sec without changing the underlying grid", (scale) => {
    const baseStep = 0.5;
    for (const width of [6, 30, 48, 90]) {
      const step = timelineRulerStep(baseStep, scale, width);
      expect(step * scale).toBeGreaterThanOrEqual(width * 1.5 + 12);
      expect(step / baseStep).toBe(Math.round(step / baseStep));
      const ticks = visibleTimelineTicks(20000, 0, 320, scale, step, 0);
      expect(ticks.length).toBeLessThan(20);
    }
  });
  it("keeps canonical seconds while formatting frames", () => {
    const canonical = 1.02;
    expect(formatTimelineReadout(canonical, 3, "frames")).toBe("0024 / 0072");
    expect(formatCompactTimelineReadout(canonical, 3, "frames")).toBe("0024 f");
    expect(canonical).toBe(1.02);
  });

  it("snaps only when an explicit frame policy is requested", () => {
    expect(snapTimelineTimeToFrame(1.02, 24)).toBe(1);
    expect(resolveTimelineSeekTime(1.02, 3, "unsnapped")).toBe(1.02);
    expect(resolveTimelineSeekTime(1.02, 3, "frame-snap")).toBe(1);
  });

  it("clamps malformed values deterministically", () => {
    expect(clampTimelineTime(-1, 3)).toBe(0);
    expect(clampTimelineTime(5, 3)).toBe(3);
    expect(clampTimelineTime(Number.NaN, 3)).toBe(0);
    expect(clampTimelineTime(Number.POSITIVE_INFINITY, 3)).toBe(3);
  });

  it("virtualizes ruler ticks to the horizontal viewport", () => {
    const ticks = visibleTimelineTicks(120, 400, 300, 20, 1);
    expect(ticks[0]).toBe(18);
    expect(ticks[ticks.length - 1]).toBe(37);
    expect(ticks.length).toBeLessThanOrEqual(512);
  });

  it("clamps a loop range to [0, duration]", () => {
    expect(clampTimelineLoopRange({ start: -1, end: 20 }, 10)).toEqual({ start: 0, end: 10 });
    expect(clampTimelineLoopRange({ start: 2, end: 5 }, 10)).toEqual({ start: 2, end: 5 });
  });

  it("normalizes a degenerate or malformed loop range to null", () => {
    expect(clampTimelineLoopRange(null, 10)).toBeNull();
    expect(clampTimelineLoopRange(undefined, 10)).toBeNull();
    expect(clampTimelineLoopRange({ start: 5, end: 5 }, 10)).toBeNull();
    expect(clampTimelineLoopRange({ start: 8, end: 3 }, 10)).toBeNull();
    expect(clampTimelineLoopRange({ start: Number.NaN, end: 5 }, 10)).toEqual({ start: 0, end: 5 });
  });
});
