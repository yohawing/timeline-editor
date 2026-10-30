import { useEffect, useRef, useState } from "react";
import { createTimelineAudio } from "@yohawing/timeline-editor/audio";
export { createTimelineAudio };
import { projectTimelinePlaybackTime, timelineId, type TimelineDataSource, type TimelinePlaybackController } from "@yohawing/timeline-editor/core";

// A quiet 12-second WAV, with a click at each integer second.
export function clickTrack(): ArrayBuffer {
  const sampleRate = 24000;
  const bytes = new ArrayBuffer(44 + sampleRate * 12 * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, bytes.byteLength - 44, true);
  for (let i = 0; i < sampleRate * 12; i++) {
    const phase = (i % sampleRate) / sampleRate;
    view.setInt16(44 + i * 2, phase < 0.025 ? Math.sin(phase * 2 * Math.PI * 1000) * 6500 * (1 - phase / 0.025) : 0, true);
  }
  return bytes;
}

export function withAudioRow(base: TimelineDataSource, asset: { name: string; duration: number } | null): TimelineDataSource {
  if (!asset) return base;
  const rowId = timelineId<"row">("demo-audio");
  const bindingId = timelineId<"binding">("demo-audio-output");
  return {
    ...base,
    getBindings: () => [...base.getBindings(), { id: bindingId, label: asset.name, targetKind: "audio-output" }],
    getRowCount: () => base.getRowCount() + 1,
    getRows: ({ start, count }) => start === 0 && count > 0
      ? [{ id: rowId, label: asset.name, kind: "track" as const, depth: 0, bindingId }, ...base.getRows({ start: 0, count: count - 1 })]
      : base.getRows({ start: Math.max(0, start - 1), count }),
    getItems: (query) => [...base.getItems(query), ...(query.rowIds.includes(rowId) ? [{ kind: "clip" as const, id: timelineId<"clip">("demo-audio-clip"), rowId, label: asset.name, range: { start: 0, end: Math.min(12, asset.duration) }, color: "#55bca9" }] : [])],
  };
}

export function useAudioDemo(controller: TimelinePlaybackController) {
  const runtime = useRef<{ context: AudioContext; audio: ReturnType<typeof createTimelineAudio> } | null>(null);
  const request = useRef(0);
  const marker = useRef<HTMLDivElement>(null);
  const [asset, setAsset] = useState<{ name: string; duration: number } | null>(null);
  const [error, setError] = useState("");
  const sample = () => {
    const value = controller.getSnapshot();
    return { ...value, time: projectTimelinePlaybackTime(value) };
  };
  const ensure = () => {
    if (!runtime.current) {
      const context = new AudioContext();
      runtime.current = { context, audio: createTimelineAudio(context) };
    }
    return runtime.current;
  };
  const report = (reason: unknown) => setError(String(reason instanceof Error ? reason.message : reason));
  const load = async (name: string, read: () => Promise<ArrayBuffer>) => {
    const ticket = ++request.current;
    try {
      const current = ensure();
      // Resume directly within the file/drop/click gesture, before any await.
      void current.context.resume().catch((reason) => {
        if (ticket === request.current && runtime.current === current) report(reason);
      });
      const result = await current.audio.load(read());
      if (ticket !== request.current || !result) return;
      setAsset({ name, duration: result.duration }); setError("");
      current.audio.sync(sample(), true);
    } catch (reason) { if (ticket === request.current) report(reason); }
  };
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const value = sample();
      runtime.current?.audio.sync(value);
      if (marker.current) {
        marker.current.dataset.time = value.time.toFixed(3);
        marker.current.style.setProperty("--progress", `${value.time / 12 * 100}%`);
        marker.current.dataset.flash = String(value.time % 1 < 0.08);
        marker.current.textContent = `${value.time.toFixed(2)} s`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); ++request.current;
      runtime.current?.audio.dispose();
      if (runtime.current) void runtime.current.context.close();
      runtime.current = null;
      void Promise.resolve(controller.dispatch({ type: "pause", target: null })).catch(() => undefined);
    };
  }, [controller]);
  const wrapped: TimelinePlaybackController = {
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    dispatch: async (command) => {
      const resumed = command.type === "play" ? runtime.current?.context.resume() : undefined;
      await controller.dispatch(command);
      await resumed;
      runtime.current?.audio.sync(sample(), command.type === "seek");
    },
  };
  const controls = <div className="audio-demo-controls">
    <label className="audio-file-button">音声を選択<input aria-label="Audio file" type="file" accept="audio/*" onChange={(event) => {
      const file = event.target.files?.[0]; if (file) void load(file.name, () => file.arrayBuffer()); event.target.value = "";
    }} /></label>
    <button onClick={() => void load("Click track.wav", async () => clickTrack())}>クリック音で試す</button>
    {asset && <><span title={asset.name} className="audio-name">{asset.name}</span><button onClick={() => { ++request.current; runtime.current?.audio.clear(); setAsset(null); setError(""); }}>音声を解除</button></>}
    <div ref={marker} className="audio-marker" aria-label="Sync marker" />
    {error && <span role="alert">{error}</span>}
  </div>;
  return { asset, controls, controller: wrapped, onDrop: (event: React.DragEvent) => {
    event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void load(file.name, () => file.arrayBuffer());
  } };
}
