import { describe, expect, it } from "vitest";
import { clampTimelineTime, resolveTimelineSeekTime, formatTimelineReadout, visibleTimelineTicks, clampTimelineLoopRange } from "./display";
import { createLocalPlaybackController, projectTimelinePlaybackTime } from "./playback";
import { createViewTransform, overlapsHalfOpen } from "./contracts";
import { viewRangeFromThumb, viewRangeThumb, zoomAroundAnchor } from "./viewRange";
const range = { start: -2, end: 3 };
describe("absolute negative range", () => {
  it("clamps, snaps and formats absolute seconds", () => {
    expect(clampTimelineTime(-9, range)).toBe(-2);
    expect(resolveTimelineSeekTime(-1.12, range, "frame-snap", 30)).toBeCloseTo(-34/30);
    expect(formatTimelineReadout(-1, range, "frames", 30)).toBe("-0030 / 0090");
    expect(visibleTimelineTicks(range, 0, 500, 100, 1)).toEqual([-2,-1,0,1,2,3]);
    expect(clampTimelineLoopRange({ start:-4, end:1 }, range)).toEqual({ start:-2,end:1 });
  });
  it("projects full and partial loops and stops at the absolute end", () => {
    const snapshot = { available:true,time:-1,duration:5,range,playing:true,looping:true,sampledAtUnixMs:0 };
    expect(projectTimelinePlaybackTime(snapshot,5000)).toBe(-1);
    expect(projectTimelinePlaybackTime({...snapshot,loopRange:{start:-1,end:1}},3000)).toBe(0);
    expect(projectTimelinePlaybackTime({...snapshot,looping:false},9000)).toBe(3);
    const controller=createLocalPlaybackController(range);
    expect(controller.getSnapshot().time).toBe(-2);
    controller.dispatch({type:"seek",time:-1,target:null});
    expect(controller.getSnapshot().time).toBe(-1);
  });
  it("keeps view fractions and absolute query coordinates consistent", () => {
    const view=viewRangeFromThumb({start:0.2,end:0.6},5,400);
    expect(viewRangeThumb(view,5,400).start).toBeCloseTo(0.2);
    const zoom=zoomAroundAnchor(view,2,200,5,400);
    const before=range.start+(view.scrollLeft+200)/view.pixelsPerSecond;
    expect(range.start+(zoom.scrollLeft+200)/zoom.pixelsPerSecond).toBeCloseTo(before);
    const transform=createViewTransform(range.start,100);
    expect(transform.xToTime(100)).toBe(-1);
    expect(overlapsHalfOpen({start:-1.5,end:-0.5},{start:-2,end:0})).toBe(true);
  });
});
