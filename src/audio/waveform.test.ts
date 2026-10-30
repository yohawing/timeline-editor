import { expect, it } from "vitest";
import { createAudioWaveform } from "./waveform";

it("preserves stereo transients, clamps amplitudes, and keeps silent bins", () => {
  const channels = [new Float32Array([0, 0, -0.8, 0, 0, 0, 0, 0]), new Float32Array([0, 0, 0, 0, 0, 2, 0, 0])];
  const buffer = { length: 8, numberOfChannels: 2, getChannelData: (channel: number) => channels[channel] } as AudioBuffer;
  const peaks = createAudioWaveform(buffer, 4);
  expect(peaks[0]).toBe(0); expect(peaks[1]).toBeCloseTo(0.8); expect(peaks[2]).toBe(1); expect(peaks[3]).toBe(0);
  expect(createAudioWaveform(buffer, 99)).toHaveLength(8);
  expect(() => createAudioWaveform(buffer, 0)).toThrow(RangeError);
});
