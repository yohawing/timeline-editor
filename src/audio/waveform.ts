/** One bounded peak envelope, preserving transients from every channel. */
export function createAudioWaveform(buffer: AudioBuffer, bins = 2048): number[] {
  if (!Number.isInteger(bins) || bins <= 0) throw new RangeError("Invalid waveform bin count");
  const count = Math.min(bins, buffer.length);
  const peaks = new Array<number>(count).fill(0);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let bin = 0; bin < count; bin++) {
      const start = Math.floor(bin * buffer.length / count);
      const end = Math.floor((bin + 1) * buffer.length / count);
      for (let i = start; i < end; i++) peaks[bin] = Math.max(peaks[bin], Math.min(1, Math.abs(samples[i]) || 0));
    }
  }
  return peaks;
}
