import { describe, expect, it, vi } from "vitest";
import { createTimelineAudio } from "./index";
import type { TimelinePlaybackSnapshot } from "../core/playback";

const sample = (time: number, overrides: Partial<TimelinePlaybackSnapshot> = {}): TimelinePlaybackSnapshot => ({ available: true, time, duration: 12, playing: true, looping: false, ...overrides });
function fixture() {
  const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; playbackRate: { value: number }; onended: (() => void) | null }[] = [];
  const context = {
    currentTime: 0, state: "running", destination: {},
    decodeAudioData: vi.fn(async () => ({ duration: 20, length: 0, numberOfChannels: 0 } as AudioBuffer)),
    createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn() } })),
    createBufferSource: () => {
      const node = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), playbackRate: { value: 1 }, onended: null };
      nodes.push(node); return node;
    },
  };
  const audio = createTimelineAudio(context as unknown as AudioContext);
  return { audio, context, nodes };
}
describe("audio follows the host clock", () => {
  it("updates gain without restarting the source and releases it on dispose", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(0)); audio.setVolume(0.25); audio.sync(sample(0));
    expect(nodes).toHaveLength(1);
    const gain = context.createGain.mock.results[0].value;
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 0, 0.01);
    audio.setVolume(0.25); expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(1);
    expect(() => audio.setVolume(Number.NaN)).toThrow(RangeError);
    expect(() => audio.setVolume(-1)).toThrow(RangeError);
    audio.dispose(); expect(gain.disconnect).toHaveBeenCalled();
  });
  it("starts only inside the placed clip and resyncs after moving it", async () => {
    const { audio, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(1), false, { start: 3, end: 8 }); expect(nodes).toHaveLength(0);
    audio.sync(sample(4), false, { start: 3, end: 8 });
    expect(nodes[0].start).toHaveBeenCalledWith(0, 1, 4);
    audio.sync(sample(4), false, { start: 2, end: 7 });
    expect(nodes[1].start).toHaveBeenCalledWith(0, 2, 3);
    audio.sync(sample(7), false, { start: 2, end: 7 }); expect(nodes[1].stop).toHaveBeenCalled();
  });
  it("resyncs a changed audio origin and does not replay a naturally ended tail", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(3));
    audio.sync(sample(3, { range: { start: 2, end: 12 } }));
    expect(nodes).toHaveLength(2);
    expect(nodes[1].start).toHaveBeenCalledWith(0, 1, 9);
    context.currentTime = 9;
    nodes[1].onended?.();
    audio.sync(sample(11.98, { range: { start: 2, end: 12 } }));
    expect(nodes).toHaveLength(2);
    audio.sync(sample(2, { range: { start: 2, end: 12 } }));
    expect(nodes).toHaveLength(3);
  });
  it("supersedes a pending decode as soon as the next file read begins", async () => {
    const { audio, context } = fixture();
    let finishDecode!: (buffer: AudioBuffer) => void;
    let finishRead!: (bytes: ArrayBuffer) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { finishDecode = resolve; }));
    const first = audio.load(new ArrayBuffer(0)); await Promise.resolve();
    const second = audio.load(new Promise((resolve) => { finishRead = resolve; }));
    finishDecode({ duration: 2, length: 0, numberOfChannels: 0 } as AudioBuffer);
    expect(await first).toBeNull();
    finishRead(new ArrayBuffer(0)); expect(await second).toEqual({ duration: 20, waveform: [] });
  });
  it("keeps continuous frames on one source, resyncs drift and explicit small seeks", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(0)); context.currentTime = 0.02; audio.sync(sample(0.02));
    expect(nodes).toHaveLength(1);
    audio.sync(sample(0.03), true); expect(nodes).toHaveLength(2);
    expect(nodes[0].stop).toHaveBeenCalledOnce();
    context.currentTime = 1; audio.sync(sample(2)); expect(nodes).toHaveLength(3);
    audio.sync(sample(2, { playing: false })); expect(nodes[2].stop).toHaveBeenCalledOnce();
  });
  it("bounds long audio, applies rate, restarts at loop wrap, and stays silent after short audio", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(3, { rate: 2, looping: true, loopRange: { start: 2, end: 4 } }));
    expect(nodes[0].start).toHaveBeenCalledWith(0, 3, 1);
    expect(nodes[0].playbackRate.value).toBe(2);
    context.currentTime = 0.5; audio.sync(sample(2, { rate: 2, looping: true, loopRange: { start: 2, end: 4 } }));
    expect(nodes).toHaveLength(2);
    audio.sync(sample(12)); expect(nodes[1].stop).toHaveBeenCalledOnce();
    context.decodeAudioData.mockResolvedValueOnce({ duration: 1, length: 0, numberOfChannels: 0 } as AudioBuffer);
    await audio.load(new ArrayBuffer(0)); audio.sync(sample(2)); expect(nodes).toHaveLength(2);
    audio.sync(sample(0)); expect(nodes).toHaveLength(3);
  });
  it("keeps the old asset on decode failure and discards superseded/cleared loads", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    context.decodeAudioData.mockRejectedValueOnce(new Error("bad file"));
    await expect(audio.load(new ArrayBuffer(0))).rejects.toThrow("bad file");
    audio.sync(sample(0)); expect(nodes).toHaveLength(1);
    let resolve!: (buffer: AudioBuffer) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = audio.load(new ArrayBuffer(0)); await Promise.resolve();
    await audio.load(new ArrayBuffer(0)); resolve({ duration: 1, length: 0, numberOfChannels: 0 } as AudioBuffer);
    expect(await pending).toBeNull(); audio.sync(sample(2)); expect(nodes).toHaveLength(2);
    context.decodeAudioData.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const cleared = audio.load(new ArrayBuffer(0)); await Promise.resolve(); audio.clear(); resolve({ duration: 20, length: 0, numberOfChannels: 0 } as AudioBuffer);
    expect(await cleared).toBeNull(); audio.sync(sample(0)); expect(nodes).toHaveLength(2);
    audio.dispose(); await expect(audio.load(new ArrayBuffer(0))).rejects.toThrow("disposed");
  });
  it("maps negative range starts to audio zero and stops when context suspends", async () => {
    const { audio, context, nodes } = fixture(); await audio.load(new ArrayBuffer(0));
    audio.sync(sample(-1, { range: { start: -2, end: 10 } }));
    expect(nodes[0].start).toHaveBeenCalledWith(0, 1, 11);
    context.state = "suspended"; audio.sync(sample(0)); expect(nodes[0].disconnect).toHaveBeenCalled();
  });
});

it("loops a trimmed source without restarting on each source wrap", async () => {
  const { audio, nodes, context } = fixture(); await audio.load(new ArrayBuffer(0));
  const placement = { start: 5, end: 60, sourceOffset: 3, loop: true };
  audio.sync(sample(24, { duration: 60 }), false, placement);
  expect(nodes[0]).toMatchObject({ loop: true });
  expect(nodes[0].start).toHaveBeenCalledWith(0, 2, 36);
  context.currentTime = 20;
  audio.sync(sample(44, { duration: 60 }), false, placement);
  expect(nodes).toHaveLength(1);
  audio.sync(sample(44, { duration: 60 }), false, { ...placement, sourceOffset: 4 });
  expect(nodes).toHaveLength(2);
  expect(nodes[1].start).toHaveBeenCalledWith(20, 3, 16);
  audio.sync(sample(60, { duration: 60 }), false, placement);
  expect(nodes[1].stop).toHaveBeenCalled();
});
