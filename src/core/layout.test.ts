import { describe, expect, it } from "vitest";
import { visibleTimelineRowQuery } from "./layout";

describe("row virtualization", () => {
  it("returns an overscanned bounded row page", () => {
    expect(visibleTimelineRowQuery(100, 260, 52)).toEqual({ start: 10, count: 3 });
    expect(visibleTimelineRowQuery(2, 10_000, 100)).toEqual({ start: 2, count: 0 });
  });
});
