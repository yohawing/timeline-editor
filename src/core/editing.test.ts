import { describe, expect, it } from "vitest";
import { timelineId, type TimelineClip } from "./contracts";
import { proposeTimelineItemEdit } from "./editing";

const clip: TimelineClip = { kind: "clip", id: timelineId<"clip">("c"), rowId: timelineId<"row">("r"), label: "clip", color: "red", range: { start: 2, end: 4 } };
const bounds = { start: 0, end: 10 };
describe("host controlled edits", () => {
  it("moves while preserving length, snapping delta and bounding the result", () => {
    expect(proposeTimelineItemEdit(clip, "move", 100, bounds, 30).next).toMatchObject({ range: { start: 8, end: 10 } });
    expect(proposeTimelineItemEdit(clip, "move", -100, bounds, 30).next).toMatchObject({ range: { start: 0, end: 2 } });
    expect(proposeTimelineItemEdit(clip, "move", 0.04, bounds, 30).next).toMatchObject({ range: { start: 2 + 1 / 30, end: 4 + 1 / 30 } });
    expect(clip.range).toEqual({ start: 2, end: 4 });
  });
  it("resizes either edge without crossing or moving the opposite edge", () => {
    expect(proposeTimelineItemEdit(clip, "resize-start", -100, bounds, 30).next).toMatchObject({ range: { start: 0, end: 4 } });
    expect(proposeTimelineItemEdit(clip, "resize-end", 100, bounds, 30).next).toMatchObject({ range: { start: 2, end: 10 } });
    expect(proposeTimelineItemEdit(clip, "resize-end", -100, bounds, 30).next).toMatchObject({ range: { start: 2, end: 2 + 1 / 30 } });
  });
  it("moves cues, rejects unsupported resize and non-finite input", () => {
    const cue = { kind: "cue" as const, id: timelineId<"cue">("q"), rowId: clip.rowId, time: 5, label: "cue", color: "red" };
    expect(proposeTimelineItemEdit(cue, "move", -2, bounds, 30).next).toMatchObject({ time: 3 });
    expect(() => proposeTimelineItemEdit(cue, "resize-end", 1, bounds, 30)).toThrow();
    expect(() => proposeTimelineItemEdit(clip, "move", NaN, bounds, 30)).toThrow();
  });
});
