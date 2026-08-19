import { describe, expect, it } from "vitest";
import {
  clampTimelineTime,
  formatCompactTimelineReadout,
  formatTimelineReadout,
  resolveTimelineSeekTime,
  snapTimelineTimeToFrame,
  visibleTimelineTicks,
} from "./display";

describe("timeline display policies", () => {
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
});
