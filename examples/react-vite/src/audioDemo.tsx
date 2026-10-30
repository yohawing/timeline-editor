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


const trackTypes = {
  audio: { label: "Audio", color: "#55bca9", targetKind: "audio-output" },
  animation: { label: "Animation", color: "#8592d0", targetKind: "actor" },
  event: { label: "Event", color: "#dbb56e", targetKind: "property" },
} as const;
type TrackType = keyof typeof trackTypes;
interface Track { id: RowId; type: TrackType }
interface Document { tracks: readonly Track[]; clips: readonly TimelineClip[] }
const firstTrack: Track = { id: timelineId<"row">("audio-track-1"), type: "audio" };
const isAudioTrack = (document: Document, id: RowId) => document.tracks.some(track => track.id === id && track.type === "audio");

export function withAudioRows(base: TimelineDataSource, document: Document): TimelineDataSource {
  const counts = { audio: 0, animation: 0, event: 0 };
  const tracks = document.tracks.map(({ id, type }) => ({ id, label: `${trackTypes[type].label} ${++counts[type]}`, kind: "track" as const, depth: 0, color: trackTypes[type].color, bindingId: timelineId<"binding">(id), targetKind: trackTypes[type].targetKind }));
  return {
    ...base,
    getBindings: () => [...tracks.map(row => ({ id: row.bindingId, label: row.label, targetKind: row.targetKind })), ...base.getBindings()],
    getRowCount: () => tracks.length + base.getRowCount(),
    getRows: ({ start, count }) => {
      const audio = tracks.slice(start, start + count);
      return [...audio, ...base.getRows({ start: Math.max(0, start - tracks.length), count: Math.max(0, count - audio.length) })];
    },
    getItems: query => [...base.getItems(query).filter(item => item.id !== "preview-animation"), ...document.clips.filter(clip => query.rowIds.includes(clip.rowId) && clip.range.start < query.range.end && clip.range.end > query.range.start)],
  };
}

export function useAudioDemo(controller: TimelinePlaybackController, motion: TimelineClip | null) {
  const [document, setDocument] = useState<Document>({ tracks: [firstTrack], clips: motion ? [motion] : [] });
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
  const trackType = (id: RowId) => current.current.tracks.find(track => track.id === id)?.type ?? (id === motion?.rowId ? "animation" : undefined);
  const canMove = (clip: TimelineClip, rowId: RowId) => trackType(clip.rowId) !== undefined && trackType(clip.rowId) === trackType(rowId);
  const report = (reason: unknown) => setError(String(reason instanceof Error ? reason.message : reason));
  const load = async (files: readonly File[], rowId: RowId, start: number) => {
    if (!files.length || !isAudioTrack(current.current, rowId)) return;
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
          if (!decoded || ticket !== epoch.current || !isAudioTrack(current.current, rowId)) { audio.dispose(); return null; }
          const id = timelineId<"clip">(`audio-clip-${++serial.current}`);
          return { audio, clip: { kind: "clip" as const, id, rowId, label: file.name, color: "#3c8d94", range: { start, end: start + decoded.duration }, waveform: decoded.waveform } };
        } catch (reason) { audio.dispose(); reportLoad(reason); return null; }
      }));
      if (ticket !== epoch.current || !isAudioTrack(current.current, rowId)) { loaded.forEach(item => item?.audio.dispose()); return; }
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
        const motionClip = current.current.clips.find(clip => clip.id === motion?.id);
        const motionTime = motionClip ? Math.max(0, Math.min(motionClip.range.end - motionClip.range.start, value.time - motionClip.range.start)) : 0;
        canvas.dataset.motionTime = motionTime.toFixed(3);
        const phase = motionTime % 1;
        const x = width * (0.15 + motionTime / 12 * 0.7);
        const y = floor - 24 - Math.sin(phase * Math.PI) * Math.min(100, height * 0.25);
        context.fillStyle = phase < 0.08 ? "#ffd783" : "#72bfc8";
        if (motionClip) { context.beginPath(); context.arc(x, y, 23, 0, Math.PI * 2); context.fill(); }
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
    canEditClip: clip => document.clips.some(item => item.id === clip.id),
    canMoveClip: canMove,
    canDropFiles: rowId => isAudioTrack(document, rowId),
    onSelectClip: setSelected,
    onDropFiles: (files, rowId, time) => { setError(""); void load(files, rowId, time); },
    onMoveClip: (id, rowId, start) => {
      const old = current.current.clips.find(clip => clip.id === id);
      if (!old || !canMove(old, rowId) || (old.range.start === start && old.rowId === rowId)) return;
      commit({ ...current.current, clips: current.current.clips.map(clip => clip.id === id ? { ...clip, rowId, range: { start, end: start + clip.range.end - clip.range.start } } : clip) });
    },
    onDelete: () => {
      if (!current.current.clips.some(clip => clip.id === selectedRef.current)) return;
      commit({ ...current.current, clips: current.current.clips.filter(clip => clip.id !== selectedRef.current) }); setSelected(null);
    },
    onUndo: undo, onRedo: redo,
  };
  const addTrack = <select className="example-add-track" aria-label="Add track" title="Add track" value="" onChange={event => {
    const type = event.target.value as TrackType;
    if (Object.prototype.hasOwnProperty.call(trackTypes, type)) commit({ ...current.current, tracks: [...current.current.tracks, { id: timelineId<"row">(`${type}-track-${++serial.current}`), type }] });
  }}>
    <option value="" disabled hidden>＋</option>
    {Object.entries(trackTypes).map(([type, info]) => <option key={type} value={type}>{info.label} Track</option>)}
  </select>;
  const toolbar = <>
    <button className="timeline-editor__button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!past.current.length} onClick={undo}>↶</button>
    <button className="timeline-editor__button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!future.current.length} onClick={redo}>↷</button>
  </>;
  return { document, toolbar, addTrack, editing, preview, controller: wrapped, error, dismissError: () => setError("") };
}
