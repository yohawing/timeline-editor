import { useEffect, useRef, useState } from "react";
import { createTimelineAudio } from "@yohawing/timeline-editor/audio";
import { projectTimelinePlaybackTime, timelineId, type TimelineClip, type RowId, type TimelineDataSource, type TimelinePlaybackController } from "@yohawing/timeline-editor/core";
import type { TimelineEditing } from "@yohawing/timeline-editor";
export { createTimelineAudio };

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


interface Document { tracks: readonly RowId[]; clips: readonly TimelineClip[] }
const firstTrack = timelineId<"row">("audio-track-1");

export function withAudioRows(base: TimelineDataSource, document: Document): TimelineDataSource {
  const tracks = document.tracks.map((id, index) => ({ id, label: `Audio ${index + 1}`, kind: "track" as const, depth: 0, bindingId: timelineId<"binding">(id) }));
  return {
    ...base,
    getBindings: () => [...tracks.map(row => ({ id: row.bindingId, label: row.label, targetKind: "audio-output" as const })), ...base.getBindings()],
    getRowCount: () => tracks.length + base.getRowCount(),
    getRows: ({ start, count }) => {
      const audio = tracks.slice(start, start + count);
      return [...audio, ...base.getRows({ start: Math.max(0, start - tracks.length), count: Math.max(0, count - audio.length) })];
    },
    getItems: query => [...base.getItems(query), ...document.clips.filter(clip => query.rowIds.includes(clip.rowId) && clip.range.start < query.range.end && clip.range.end > query.range.start)],
  };
}

export function useAudioDemo(controller: TimelinePlaybackController) {
  const [document, setDocument] = useState<Document>({ tracks: [firstTrack], clips: [] });
  const current = useRef(document);
  const past = useRef<Document[]>([]);
  const future = useRef<Document[]>([]);
  const [selected, setSelected] = useState<TimelineClip["id"] | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const runtime = useRef<{ context: AudioContext; sources: Map<string, ReturnType<typeof createTimelineAudio>> } | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const serial = useRef(1);
  const epoch = useRef(0);
  const loadOperation = useRef(0);
  const [error, setError] = useState("");
  const sample = () => {
    const value = controller.getSnapshot();
    return { ...value, time: projectTimelinePlaybackTime(value) };
  };
  const sync = (force = false) => {
    const value = sample();
    for (const [id, audio] of runtime.current?.sources ?? []) {
      const clip = current.current.clips.find(clip => clip.id === id);
      audio.sync(clip ? value : { ...value, playing: false }, force, clip?.range);
    }
  };
  const publish = (next: Document) => {
    current.current = next; setDocument(next); sync(true);
    const retained = new Set([...past.current, next, ...future.current].flatMap(doc => doc.clips.map(clip => clip.id as string)));
    for (const [id, audio] of runtime.current?.sources ?? []) {
      if (!retained.has(id)) { audio.dispose(); runtime.current?.sources.delete(id); }
    }
  };
  const commit = (next: Document) => {
    past.current = [...past.current, current.current].slice(-50); future.current = []; publish(next);
  };
  const undo = () => {
    const next = past.current.pop(); if (!next) return;
    future.current.push(current.current); publish(next); setSelected(null);
  };
  const redo = () => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(current.current); publish(next); setSelected(null);
  };
  const report = (reason: unknown) => setError(String(reason instanceof Error ? reason.message : reason));
  const load = async (files: readonly File[], rowId: RowId, start: number) => {
    if (!files.length || !current.current.tracks.includes(rowId)) return;
    const ticket = epoch.current;
    const operation = ++loadOperation.current;
    const reportLoad = (reason: unknown) => { if (ticket === epoch.current && operation === loadOperation.current) report(reason); };
    try {
      if (!runtime.current) runtime.current = { context: new AudioContext(), sources: new Map() };
      const owner = runtime.current;
      void owner.context.resume().catch(reportLoad);
      const loaded = await Promise.all(files.map(async file => {
        const audio = createTimelineAudio(owner.context);
        try {
          const decoded = await audio.load(file.arrayBuffer());
          if (!decoded || ticket !== epoch.current || !current.current.tracks.includes(rowId)) { audio.dispose(); return null; }
          const id = timelineId<"clip">(`audio-clip-${++serial.current}`);
          return { audio, clip: { kind: "clip" as const, id, rowId, label: file.name, color: "#3c8d94", range: { start, end: start + decoded.duration }, waveform: decoded.waveform } };
        } catch (reason) { audio.dispose(); reportLoad(reason); return null; }
      }));
      if (ticket !== epoch.current || !current.current.tracks.includes(rowId)) { loaded.forEach(item => item?.audio.dispose()); return; }
      const added = loaded.filter(item => item !== null);
      if (!added.length) return;
      for (const item of added) owner.sources.set(item.clip.id, item.audio);
      commit({ ...current.current, clips: [...current.current.clips, ...added.map(item => item.clip)] });
      setSelected(added[added.length - 1].clip.id);
    } catch (reason) { reportLoad(reason); }
  };
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      sync();
      const canvas = preview.current;
      const context = canvas?.getContext("2d");
      const value = sample();
      if (canvas && context) {
        const bounds = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(bounds.width * dpr)); const h = Math.max(1, Math.round(bounds.height * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        const width = bounds.width, height = bounds.height;
        context.fillStyle = "#14171d"; context.fillRect(0, 0, width, height);
        context.strokeStyle = "#282e39"; context.lineWidth = 1;
        const floor = height * 0.7;
        context.beginPath(); context.moveTo(0, floor); context.lineTo(width, floor); context.stroke();
        const phase = value.time % 1;
        const x = width * (0.15 + value.time / 12 * 0.7);
        const y = floor - 24 - Math.sin(phase * Math.PI) * Math.min(100, height * 0.25);
        context.fillStyle = phase < 0.08 ? "#ffd783" : "#72bfc8";
        context.beginPath(); context.arc(x, y, 23, 0, Math.PI * 2); context.fill();
        context.fillStyle = "#8d98aa"; context.font = "12px Consolas, monospace";
        context.fillText(`${value.time.toFixed(2)} s`, 18, 26);
        canvas.dataset.time = value.time.toFixed(3);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); ++epoch.current;
      for (const audio of runtime.current?.sources.values() ?? []) audio.dispose();
      if (runtime.current) void runtime.current.context.close();
      runtime.current = null;
      try { void Promise.resolve(controller.dispatch({ type: "pause", target: null })).catch(() => undefined); } catch { /* teardown */ }
    };
  }, [controller]);
  const wrapped: TimelinePlaybackController = {
    getSnapshot: controller.getSnapshot, subscribe: controller.subscribe,
    dispatch: async command => {
      const resumed = command.type === "play" ? runtime.current?.context.resume() : undefined;
      await controller.dispatch(command); await resumed; sync(command.type === "seek");
    },
  };
  const editing: TimelineEditing = {
    selectedClipId: selected,
    canEditClip: clip => document.tracks.includes(clip.rowId),
    canDropFiles: rowId => document.tracks.includes(rowId),
    onSelectClip: setSelected,
    onDropFiles: (files, rowId, time) => { setError(""); void load(files, rowId, time); },
    onMoveClip: (id, rowId, start) => {
      const old = current.current.clips.find(clip => clip.id === id);
      if (!old || !current.current.tracks.includes(rowId) || (old.range.start === start && old.rowId === rowId)) return;
      commit({ ...current.current, clips: current.current.clips.map(clip => clip.id === id ? { ...clip, rowId, range: { start, end: start + clip.range.end - clip.range.start } } : clip) });
    },
    onDelete: () => {
      if (!current.current.clips.some(clip => clip.id === selectedRef.current)) return;
      commit({ ...current.current, clips: current.current.clips.filter(clip => clip.id !== selectedRef.current) }); setSelected(null);
    },
    onUndo: undo, onRedo: redo,
  };
  const toolbar = <>
    <button className="timeline-editor__button timeline-editor__button--text" title="Add Audio Track" aria-label="Add Audio Track" onClick={() => commit({ ...current.current, tracks: [...current.current.tracks, timelineId<"row">(`audio-track-${++serial.current}`)] })}>+ Audio</button>
    <button className="timeline-editor__button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!past.current.length} onClick={undo}>↶</button>
    <button className="timeline-editor__button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!future.current.length} onClick={redo}>↷</button>
  </>;
  return { document, toolbar, editing, preview, controller: wrapped, error, dismissError: () => setError("") };
}
