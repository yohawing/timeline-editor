import { createAudioWaveform } from "./waveform";
export { createAudioWaveform } from "./waveform";
import type { TimeRange } from "../core/contracts";
import type { TimelinePlaybackSnapshot } from "../core/playback";
import { clampTimelineLoopRange } from "../core/display";

/** One audio asset, following fresh host samples in canonical seconds.
 * The caller owns the context and must resume it from a user gesture.
 */
export function createTimelineAudio(context: AudioContext, driftTolerance = 0.08) {
  if (!Number.isFinite(driftTolerance) || driftTolerance <= 0) throw new RangeError("Invalid drift tolerance");
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let generation = 0;
  let disposed = false;
  let anchorStart = 0;
  let anchorTime = 0;
  let anchorContext = 0;
  let rate = 1;
  let end = 0;
  let lastTime = -Infinity;
  const stop = () => {
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
      source = null;
    }
  };
  return {
    /** Returns null for superseded loads. A failed decode preserves the old asset. */
    async load(bytes: ArrayBuffer | Promise<ArrayBuffer>): Promise<{ duration: number; waveform: readonly number[] } | null> {
      if (disposed) throw new Error("Audio follower is disposed");
      const ticket = ++generation;
      let decoded: AudioBuffer;
      try {
        const data = await bytes;
        if (ticket !== generation || disposed) return null;
        decoded = await context.decodeAudioData(data.slice(0));
      }
      catch (error) { if (ticket !== generation || disposed) return null; throw error; }
      if (ticket !== generation || disposed) return null;
      stop();
      buffer = decoded;
      return { duration: decoded.duration, waveform: createAudioWaveform(decoded) };
    },
    /** Call each host frame, and immediately after operations. Set discontinuity
     * for explicit seeks (including seeks smaller than the drift tolerance).
     * No wall-clock projection is performed here. Audio zero is placement.start
     * when supplied, otherwise range.start. Placement end stops this clip.
     */
    sync(sample: TimelinePlaybackSnapshot, discontinuity = false, placement?: TimeRange): void {
      if (disposed) return;
      const timelineStart = sample.range?.start ?? 0;
      const start = placement?.start ?? timelineStart;
      const finish = sample.range?.end ?? sample.duration;
      const nextRate = sample.rate ?? 1;
      const loop = sample.looping ? clampTimelineLoopRange(sample.loopRange, { start: timelineStart, end: finish }) : null;
      const boundary = Math.min(loop?.end ?? finish, placement?.end ?? finish);
      const offset = sample.time - start;
      const backwards = sample.time < lastTime;
      lastTime = sample.time;
      if (!buffer || !sample.available || !sample.playing || context.state !== "running" ||
          ![start, finish, boundary, sample.time, nextRate].every(Number.isFinite) || nextRate <= 0 ||
          offset < 0 || offset >= buffer.duration || sample.time >= boundary) {
        stop(); return;
      }
      const predicted = anchorTime + (context.currentTime - anchorContext) * rate;
      if (source && !discontinuity && !backwards && nextRate === rate && boundary === end && start === anchorStart &&
          Math.abs(predicted - sample.time) <= driftTolerance) return;
      stop();
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.playbackRate.value = nextRate;
      node.connect(context.destination);
      anchorStart = start;
      anchorTime = sample.time;
      anchorContext = context.currentTime;
      rate = nextRate;
      end = boundary;
      source = node;
      // Retain the ended source as an anchor until the host reaches the end,
      // wraps, seeks or drifts. A slightly late sample must not replay the tail.
      node.onended = () => { node.disconnect(); };
      node.start(anchorContext, offset, Math.min(buffer.duration - offset, boundary - sample.time));
    },
    clear(): void { ++generation; stop(); buffer = null; },
    dispose(): void { disposed = true; ++generation; stop(); buffer = null; },
  };
}
