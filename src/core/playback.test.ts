import { describe, expect, it, vi } from "vitest";
import {
  createLocalPlaybackController,
  projectTimelinePlaybackTime,
  resolveTimelinePlaybackTarget,
  timelinePlaybackTargetEquals,
} from "./playback";

describe("transport-neutral playback controller", () => {
  it("supports play, pause, seek and loop without a native runtime", () => {
    const controller = createLocalPlaybackController(4, 1.02);
    const listener = vi.fn();
    const stop = controller.subscribe(listener);
    expect(controller.getSnapshot()).toMatchObject({ available: true, time: 1.02, playing: false, looping: false });
    const target = { instanceId: "fixture", clipIndex: 0 };
    controller.dispatch({ type: "setLooping", looping: true, target });
    controller.dispatch({ type: "seek", time: 3.5, target });
    controller.dispatch({ type: "play", target });
    expect(controller.getSnapshot()).toMatchObject({ looping: true, playing: true, time: 3.5 });
    controller.dispatch({ type: "pause", target });
    expect(controller.getSnapshot().playing).toBe(false);
    expect(listener).toHaveBeenCalled();
    stop();
  });

  it("clamps seeks to the controller duration", () => {
    const controller = createLocalPlaybackController(2);
    const target = { instanceId: "fixture", clipIndex: 0 };
    controller.dispatch({ type: "seek", time: 99, target });
    expect(controller.getSnapshot().time).toBe(2);
    controller.dispatch({ type: "seek", time: -1, target });
    expect(controller.getSnapshot().time).toBe(0);
  });

  it("projects a sampled playing snapshot and resolves target precedence", () => {
    const target = { instanceId: "selected", clipIndex: 2 };
    const snapshot = {
      available: true,
      time: 1,
      duration: 3,
      playing: true,
      looping: false,
      target: { instanceId: "snapshot", clipIndex: 0 },
      sampledAtUnixMs: 1_000,
    } as const;
    expect(projectTimelinePlaybackTime(snapshot, 1_500)).toBe(1.5);
    expect(resolveTimelinePlaybackTarget(target, snapshot)).toEqual(target);
    expect(resolveTimelinePlaybackTarget(null, snapshot)).toEqual(snapshot.target);
    expect(timelinePlaybackTargetEquals(snapshot.target, { ...snapshot.target })).toBe(true);
  });
});
