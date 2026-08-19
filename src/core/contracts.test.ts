import { describe, expect, it } from "vitest";
import { createFixtureTimelineDataSource } from "./fixture";
import { createViewTransform, normalizeTime, normalizeTimeRange, overlapsHalfOpen } from "./contracts";

describe("timeline core contracts", () => {
  it("round-trips seconds and canvas coordinates", () => {
    const transform = createViewTransform(1.25, 80);
    expect(transform.timeToX(3.75)).toBe(200);
    expect(transform.xToTime(200)).toBe(3.75);
  });

  it("uses half-open ranges", () => {
    expect(overlapsHalfOpen({ start: 0, end: 2 }, { start: 2, end: 4 })).toBe(false);
    expect(overlapsHalfOpen({ start: 0, end: 2.01 }, { start: 2, end: 4 })).toBe(true);
  });

  it("rejects non-finite seconds and malformed ranges", () => {
    expect(normalizeTime(1.25)).toBe(1.25);
    expect(() => normalizeTime(Number.POSITIVE_INFINITY)).toThrow("finite seconds");
    expect(normalizeTimeRange({ start: 0, end: 2 })).toEqual({ start: 0, end: 2 });
    expect(() => normalizeTimeRange({ start: -1, end: 2 })).toThrow();
    expect(() => normalizeTimeRange({ start: 3, end: 2 })).toThrow();
  });

  it("keeps groups, rows, items and keys as separate projection concepts", () => {
    const source = createFixtureTimelineDataSource();
    const rows = source.getRows({ start: 0, count: source.getRowCount() });
    const items = source.getItems({ rowIds: rows.map((row) => row.id), range: { start: 0, end: 12 } });
    expect(source.getGroups().length).toBeGreaterThan(0);
    expect(source.getBindings().length).toBeGreaterThan(0);
    expect(items.some((item) => item.kind === "marker")).toBe(true);
    expect(items.some((item) => item.kind === "event-cue")).toBe(true);
    expect(source.getKeys({ rowIds: rows.map((row) => row.id), range: { start: 0, end: 12 } }).length).toBeGreaterThan(0);
  });
});
