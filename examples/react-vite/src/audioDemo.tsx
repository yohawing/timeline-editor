import { readProject, writeProject, type SavedProject } from "./projectStorage";
import { TimeField } from "./TimeField";
import { TrackIcon } from "./TrackIcon";
import { TrackMenu } from "./TrackMenu";
import { useEffect, useRef, useState } from "react";
import { createTimelineAudio } from "@yohawing/timeline-editor/audio";
import { projectTimelinePlaybackTime, timelineId, type TimeRange, type TimelineEventCue, type TimelineClip, type RowId, type TimelineRow, type TimelineDataSource, type TimelinePlaybackController } from "@yohawing/timeline-editor/core";
import type { TimelineEditing, TimelineEventEditing } from "@yohawing/timeline-editor";
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
  group: { label: "Group", color: "#a5a9b3", targetKind: "actor" },
  audio: { label: "Audio", color: "#55bca9", targetKind: "audio-output" },
  animation: { label: "Animation", color: "#8592d0", targetKind: "actor" },
  event: { label: "Event", color: "#dbb56e", targetKind: "property" },
} as const;
type TrackType = keyof typeof trackTypes;
interface Track { parentId?: RowId; id: RowId; type: TrackType; label?: string; external?: boolean; muted?: boolean; solo?: boolean }
interface DemoClip extends TimelineClip { volume?: number }
export interface Document { events?: readonly TimelineEventCue[]; playbackRange?: TimeRange; tracks: readonly Track[]; clips: readonly DemoClip[] }
const firstTrack: Track = { id: timelineId<"row">("audio-track-1"), type: "audio" };
const isAudioTrack = (document: Document, id: RowId) => document.tracks.some(track => track.id === id && track.type === "audio");

function trackEnabled(document: Document, rowId: RowId): boolean {
  const track = document.tracks.find(item => item.id === rowId);
  let current = track;
  while (current) {
    if (current.muted) return false;
    current = document.tracks.find(item => item.id === current?.parentId);
  }
  return !document.tracks.some(other => other.solo && other.type === track?.type) || Boolean(track?.solo);
}

export function withAudioRows(base: TimelineDataSource, document: Document, collapsed: readonly string[] = []): TimelineDataSource {
  const counts = { group: 0, audio: 0, animation: 0, event: 0 };
  const baseRows = base.getRows({ start: 0, count: base.getRowCount() });
  const tracks = document.tracks.map(({ id, type, label, parentId, external }) => {
    const number = external ? counts[type] : ++counts[type];
    const original = external ? baseRows.find(row => row.id === id) : undefined;
    return { ...original, id, label: label ?? original?.label ?? `${trackTypes[type].label} ${number}`, kind: type === "group" ? "group" as const : "track" as const, depth: 0, color: trackTypes[type].color,
      bindingId: type === "group" ? undefined : original?.bindingId ?? timelineId<"binding">(id), targetKind: trackTypes[type].targetKind,
      groupId: parentId ? timelineId<"group">(parentId) : undefined, expanded: !collapsed.includes(id), parentId };
  });
  const rows: TimelineRow[] = [];
  const visit = (parentId: RowId | undefined, depth: number) => {
    for (const row of tracks.filter(row => row.parentId === parentId)) {
      rows.push({ ...row, depth });
      if (row.kind === "group" && row.expanded) visit(row.id, depth + 1);
    }
  };
  visit(undefined, 0);
  rows.push(...baseRows.filter(row => !document.tracks.some(track => track.id === row.id)));
  return {
    ...base,
    getRange: () => ({ start: Math.min(base.getRange().start, document.playbackRange?.start ?? 0, ...(document.events ?? []).map(event => event.time), ...document.clips.map(clip => clip.range.start)), end: Math.max(base.getRange().end, document.playbackRange?.end ?? 12, ...(document.events ?? []).map(event => event.time + 1), ...document.clips.map(clip => clip.range.end)) }),
    getGroups: () => [...base.getGroups(), ...tracks.filter(row => row.kind === "group").map(row => ({ id: timelineId<"group">(row.id), label: row.label, color: row.color }))],
    getBindings: () => [...tracks.filter(row => row.bindingId).map(row => ({ id: row.bindingId!, label: row.label, targetKind: row.targetKind })), ...base.getBindings().filter(binding => !tracks.some(row => row.bindingId === binding.id))],
    getRowCount: () => rows.length,
    getRows: ({ start, count }) => rows.slice(start, start + count),
    getItems: query => [...base.getItems(query).filter(item => item.id !== "preview-animation"), ...document.clips.filter(clip => query.rowIds.includes(clip.rowId) && clip.range.start < query.range.end && clip.range.end > query.range.start).map(clip => ({ ...clip, disabled: clip.disabled || !trackEnabled(document, clip.rowId) })), ...(document.events ?? []).filter(event => query.rowIds.includes(event.rowId) && event.time >= query.range.start && event.time < query.range.end).map(event => ({ ...event, disabled: event.disabled || !trackEnabled(document, event.rowId) }))],
  };
}

export function useAudioDemo(controller: TimelinePlaybackController, motion: TimelineClip | null, timeDisplay: { displayMode: "frames" | "seconds"; fps: number }) {
  const timeDisplayRef = useRef(timeDisplay); timeDisplayRef.current = timeDisplay;
  const formatTime = (seconds: number) => timeDisplay.displayMode === "frames" ? `${Math.round(seconds * timeDisplay.fps)} f` : `${seconds.toFixed(3)} s`;
  const [document, setDocument] = useState<Document>({ tracks: [firstTrack, ...(motion ? [{ id: motion.rowId, type: "animation" as const, external: true }] : [])], clips: motion ? [{ ...motion, sourceDuration: 12 }] : [] });
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem("timeline-editor.demo.groups.ui.v1") ?? "[]"); return Array.isArray(value) ? value.filter(item => typeof item === "string") : []; } catch { return []; }
  });
  const toggleRow = (id: RowId) => { setSelected(null); setInspectorId(null); setCollapsed(current => {
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    try { localStorage.setItem("timeline-editor.demo.groups.ui.v1", JSON.stringify(next)); } catch { /* optional UI storage */ }
    return next;
  }); };
  const current = useRef(document);
  const past = useRef<Document[]>([]);
  const future = useRef<Document[]>([]);
  const [selected, setSelected] = useState<TimelineClip["id"] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEventCue["id"] | null>(null);
  const [eventInspectorId, setEventInspectorId] = useState<TimelineEventCue["id"] | null>(null);
  const [inspectorId, setInspectorId] = useState<TimelineClip["id"] | null>(null);
  const volumeStart = useRef<{ id: TimelineClip["id"]; volume?: number } | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const runtime = useRef<{ context: AudioContext; sources: Map<string, ReturnType<typeof createTimelineAudio>> } | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<{ rowId: RowId; time: number } | null>(null);
  const assets = useRef(new Map<string, Blob>());
  const readyRef = useRef(false);
  const canPersist = useRef(false);
  const [storageError, setStorageError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  const projectKey = motion ? "default" : "stress";
  const persist = (next: Document) => {
    if (!readyRef.current || !canPersist.current) return;
    const ticket = epoch.current;
    const active = () => ticket === epoch.current;
    const revision = ++saveRevision.current;
    const ids = new Set(next.clips.map(clip => clip.id as string));
    const snapshot: SavedProject = { version: 1, document: next, audio: [...assets.current].filter(([id]) => ids.has(id)) };
    setSaving(true);
    pendingSave.current = pendingSave.current.catch(() => undefined).then(() => active() ? writeProject(projectKey, snapshot, active) : undefined).then(() => {
      if (active() && revision === saveRevision.current) { setSaving(false); setStorageError(""); }
    }).catch(reason => {
      if (active() && revision === saveRevision.current) { setSaving(false); const message = `Project could not be saved: ${String(reason)}`; setError(message); setStorageError(message); }
    });
  };
  const epoch = useRef(0);
  const loadOperation = useRef(0);
  const [error, setError] = useState("");
  const sample = () => {
    const value = controller.getSnapshot();
    return { ...value, time: projectTimelinePlaybackTime(value) };
  };
  const typeOf = (clip: TimelineClip) => current.current.tracks.find(track => track.id === clip.rowId)?.type ?? (clip.id === motion?.id ? "animation" : undefined);
  const enabled = (clip: DemoClip) => !clip.disabled && trackEnabled(current.current, clip.rowId);
  const sync = (force = false) => {
    const value = sample();
    for (const [id, audio] of runtime.current?.sources ?? []) {
      const clip = current.current.clips.find(clip => clip.id === id);
      audio.setVolume(clip?.volume ?? 1);
      audio.sync(clip && enabled(clip) ? value : { ...value, playing: false }, force, clip ? { ...clip.range, sourceOffset: clip.sourceOffset, loop: clip.loop } : undefined);
    }
  };
  const applyPlaybackRange = (next: Document) => {
    if (!next.playbackRange) return;
    const range = controller.getSnapshot().range;
    if (range?.start !== next.playbackRange.start || range?.end !== next.playbackRange.end) {
      try { void Promise.resolve(controller.dispatch({ type: "setPlaybackRange", range: next.playbackRange, target: null })).catch(report); }
      catch (reason) { report(reason); }
    }
  };
  const publish = (next: Document) => {
    applyPlaybackRange({ ...next, playbackRange: next.playbackRange ?? { start: 0, end: 12 } });
    current.current = next; setDocument(next); sync(); persist(next);
    const retained = new Set([...past.current, next, ...future.current].flatMap(doc => doc.clips.map(clip => clip.id as string)));
    for (const [id, audio] of runtime.current?.sources ?? []) {
      if (!retained.has(id)) { audio.dispose(); runtime.current?.sources.delete(id); assets.current.delete(id); }
    }
  };
  const commit = (next: Document) => {
    if (!readyRef.current) return;
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
    if (!readyRef.current || !files.length || !isAudioTrack(current.current, rowId)) return;
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
          const id = timelineId<"clip">(`audio-clip-${crypto.randomUUID()}`);
          return { audio, file, clip: { kind: "clip" as const, id, rowId, label: file.name, color: "#3c8d94", range: { start, end: start + decoded.duration }, sourceDuration: decoded.duration, waveform: decoded.waveform } };
        } catch (reason) { audio.dispose(); reportLoad(reason); return null; }
      }));
      if (ticket !== epoch.current || !isAudioTrack(current.current, rowId)) { loaded.forEach(item => item?.audio.dispose()); return; }
      const added = loaded.filter(item => item !== null);
      if (!added.length) return;
      for (const item of added) { owner.sources.set(item.clip.id, item.audio); assets.current.set(item.clip.id, item.file); }
      commit({ ...current.current, clips: [...current.current.clips, ...added.map(item => item.clip)] });
      setSelected(added[added.length - 1].clip.id);
    } catch (reason) { reportLoad(reason); }
  };
  useEffect(() => {
    const ticket = epoch.current;
    readyRef.current = false; canPersist.current = false; setReady(false);
    void (async () => {
      try {
        const saved = await readProject(projectKey);
        if (ticket !== epoch.current) return;
        canPersist.current = true;
        if (saved) {
          assets.current = new Map(saved.audio);
          const eventRows = new Set(saved.document.tracks.filter(track => track.type === "event").map(track => track.id));
          const migrated = { ...saved.document, clips: saved.document.clips.filter(clip => !eventRows.has(clip.rowId)), events: [...(saved.document.events ?? []), ...saved.document.clips.filter(clip => eventRows.has(clip.rowId)).map(clip => ({ kind: "event-cue" as const, id: timelineId<"cue">(clip.id), rowId: clip.rowId, label: clip.label, time: clip.range.start, color: clip.color, eventType: "event", disabled: clip.disabled }))] };
          current.current = migrated; setDocument(migrated); applyPlaybackRange(migrated);
          past.current = []; future.current = [];
          if (saved.audio.length) {
            const owner = { context: new AudioContext(), sources: new Map<string, ReturnType<typeof createTimelineAudio>>() };
            runtime.current = owner;
            for (const [id, blob] of saved.audio) {
              const audio = createTimelineAudio(owner.context);
              try {
                const decoded = await audio.load(blob.arrayBuffer());
                if (ticket !== epoch.current) { audio.dispose(); return; }
                if (decoded) { current.current = { ...current.current, clips: current.current.clips.map(clip => clip.id === id ? { ...clip, sourceDuration: decoded.duration } : clip) }; setDocument(current.current); }
                owner.sources.set(id, audio);
              } catch (reason) {
                audio.dispose();
                if (ticket !== epoch.current) return;
                canPersist.current = false;
                const message = `Audio could not be restored; automatic saving is disabled for this session: ${String(reason)}`;
                report(message); setStorageError(message);
              }
            }
          }
        }
      } catch (reason) { if (ticket === epoch.current) {
        canPersist.current = false;
        const message = `Project could not be restored; automatic saving is disabled for this session: ${String(reason)}`;
        report(message); setStorageError(message);
      } }
      finally { if (ticket === epoch.current) { readyRef.current = true; setReady(true); } }
    })();
    return () => { readyRef.current = false; ++epoch.current; };
  }, [controller, projectKey]);
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
        const animations = current.current.clips.filter(clip => typeOf(clip) === "animation" && enabled(clip));
        const motionClip = [...animations].reverse().find(clip => value.time >= clip.range.start && value.time < clip.range.end);
        const sourceTime = motionClip ? value.time - motionClip.range.start + (motionClip.sourceOffset ?? 0) : 0;
        const sourceDuration = motionClip?.sourceDuration ?? 12;
        const motionTime = motionClip?.loop ? sourceTime % sourceDuration : Math.min(sourceDuration, sourceTime);
        canvas.dataset.motionTime = motionTime.toFixed(3);
        const phase = motionTime % 1;
        const x = width * (0.15 + motionTime / 12 * 0.7);
        const y = floor - 24 - Math.sin(phase * Math.PI) * Math.min(100, height * 0.25);
        context.fillStyle = phase < 0.08 ? "#ffd783" : "#72bfc8";
        if (motionClip) { context.beginPath(); context.arc(x, y, 23, 0, Math.PI * 2); context.fill(); }
        context.fillStyle = "#8d98aa"; context.font = "12px Consolas, monospace";
        context.fillText(timeDisplayRef.current.displayMode === "frames" ? `${Math.round(value.time * timeDisplayRef.current.fps)} f` : `${value.time.toFixed(2)} s`, 18, 26);
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
  const resizeClip = (id: TimelineClip["id"], range: TimeRange) => {
    const old = current.current.clips.find(clip => clip.id === id);
    if (!old || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return;
    const sourceDuration = old.sourceDuration ?? (typeOf(old) === "animation" ? 12 : undefined);
    const offset = (old.sourceOffset ?? 0) + range.start - old.range.start;
    if (offset < 0 || (!old.loop && sourceDuration !== undefined && offset + range.end - range.start > sourceDuration + 1e-8)) return;
    if (old.range.start === range.start && old.range.end === range.end) return;
    commit({ ...current.current, clips: current.current.clips.map(clip => clip.id === id ? { ...clip, range, sourceOffset: offset, sourceDuration } : clip) });
  };
  const editing: TimelineEditing = {
    selectedClipId: selected,
    canEditClip: clip => document.clips.some(item => item.id === clip.id),
    canMoveClip: canMove,
    canDropFiles: rowId => isAudioTrack(document, rowId),
    onSelectClip: id => { setSelectedEvent(null); setSelected(id); },
    onOpenClipProperties: id => { setEventInspectorId(null); setInspectorId(id); },
    onDropFiles: (files, rowId, time) => { setError(""); void load(files, rowId, time); },
    onResizeClip: resizeClip,
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
  const moveEvent = (id: TimelineEventCue["id"], time: number) => {
    if (!Number.isFinite(time) || !current.current.events?.some(event => event.id === id && event.time !== time)) return;
    commit({ ...current.current, events: current.current.events.map(event => event.id === id ? { ...event, time } : event) });
  };
  const eventEditing: TimelineEventEditing = {
    selectedId: selectedEvent,
    canEdit: event => Boolean(document.events?.some(item => item.id === event.id)),
    onSelect: id => { setSelected(null); setSelectedEvent(id); },
    onMove: moveEvent,
    onOpenProperties: id => { setInspectorId(null); setEventInspectorId(id); },
    onDelete: id => { commit({ ...current.current, events: current.current.events?.filter(event => event.id !== id) }); setSelectedEvent(null); },
  };
  const inspectedEvent = document.events?.find(event => event.id === eventInspectorId);
  const eventProperties = inspectedEvent && <aside className="timeline-editor__properties" aria-label="Event properties">
    <header className="timeline-editor__properties-header"><strong>Event</strong><button type="button" className="timeline-editor__button" aria-label="Close properties" title="Close" onClick={() => setEventInspectorId(null)}>×</button></header>
    <div className="timeline-editor__properties-content"><div className="timeline-editor__property-name">{inspectedEvent.label}</div>
      <dl><dt>Time</dt><dd><TimeField {...timeDisplay} label="Event time" value={inspectedEvent.time} onCommit={time => moveEvent(inspectedEvent.id, time)} /></dd></dl>
      <label><input type="checkbox" checked={inspectedEvent.disabled ?? false} onChange={event => commit({ ...current.current, events: current.current.events?.map(item => item.id === inspectedEvent.id ? { ...item, disabled: event.target.checked } : item) })} />Disable</label>
    </div>
  </aside>;
  const inspected = document.clips.find(clip => clip.id === inspectorId);
  const updateProperties = (id: TimelineClip["id"], patch: Partial<Pick<DemoClip, "disabled" | "volume" | "loop">>) => {
    const old = current.current.clips.find(clip => clip.id === id);
    if (!old || Object.entries(patch).every(([key, value]) => old[key as keyof DemoClip] === value)) return;
    const updated = { ...old, ...patch };
    if (patch.loop === false && old.sourceDuration !== undefined) {
      const sourceOffset = (old.sourceOffset ?? 0) % old.sourceDuration;
      updated.sourceOffset = sourceOffset;
      updated.range = { start: old.range.start, end: Math.min(old.range.end, old.range.start + old.sourceDuration - sourceOffset) };
    }
    const next = { ...current.current, clips: current.current.clips.map(clip => clip.id === id ? updated : clip) };
    if (volumeStart.current?.id === id && "volume" in patch) publish(next); else commit(next);
  };
  const finishVolume = (cancelled = false) => {
    const gesture = volumeStart.current; volumeStart.current = null;
    const clip = current.current.clips.find(item => item.id === gesture?.id);
    if (!gesture || !clip || (clip.volume ?? 1) === (gesture.volume ?? 1)) return;
    // Preserve unrelated additions that may finish decoding during the drag.
    const before = { ...current.current, clips: current.current.clips.map(item => item.id === gesture.id ? { ...item, volume: gesture.volume } : item) };
    if (cancelled) publish(before);
    else { past.current = [...past.current, before].slice(-50); future.current = []; setDocument({ ...current.current }); }
  };
  const properties = inspected && <aside className="timeline-editor__properties" aria-label="Clip properties">
    <header className="timeline-editor__properties-header"><strong>Properties</strong><button type="button" className="timeline-editor__button" aria-label="Close properties" title="Close" onClick={() => setInspectorId(null)}>×</button></header>
    <div className="timeline-editor__properties-content">
    <div className="timeline-editor__property-name" title={inspected.label}>{inspected.label}</div>
    <dl><dt>Start</dt><dd><TimeField {...timeDisplay} label="Clip start" value={inspected.range.start} onCommit={start => resizeClip(inspected.id, { ...inspected.range, start })} /></dd>
      <dt>End</dt><dd><TimeField {...timeDisplay} label="Clip end" value={inspected.range.end} onCommit={end => resizeClip(inspected.id, { ...inspected.range, end })} /></dd>
      <dt>Duration</dt><dd>{formatTime(inspected.range.end - inspected.range.start)}</dd>
      <dt>Source offset</dt><dd>{formatTime(inspected.sourceOffset ?? 0)}</dd></dl>
    <div className="timeline-editor__property-toggles">
      {typeOf(inspected) !== "event" && <label><input type="checkbox" checked={inspected.loop ?? false} onChange={event => updateProperties(inspected.id, { loop: event.target.checked })} />Loop</label>}
      <label><input type="checkbox" checked={inspected.disabled ?? false} onChange={event => updateProperties(inspected.id, { disabled: event.target.checked })} />Disable</label>
    </div>
    {typeOf(inspected) === "audio" && <label className="timeline-editor__property-volume">Volume <output>{Math.round((inspected.volume ?? 1) * 100)}%</output>
      <input aria-label="Volume" type="range" min="0" max="2" step="0.01" value={inspected.volume ?? 1}
        onPointerDown={event => { volumeStart.current = { id: inspected.id, volume: inspected.volume }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onChange={event => updateProperties(inspected.id, { volume: Number(event.target.value) })}
        onPointerUp={() => finishVolume()} onPointerCancel={() => finishVolume(true)} onLostPointerCapture={() => finishVolume()}
        onBlur={() => finishVolume()} />
    </label>}
    </div>
  </aside>;
  const addTrackOfType = (value: string, parentId?: RowId) => {
    if (parentId && collapsed.includes(parentId)) toggleRow(parentId);
    const type = value as TrackType;
    if (Object.prototype.hasOwnProperty.call(trackTypes, type)) commit({ ...current.current, tracks: [...current.current.tracks, { id: timelineId<"row">(`${type}-track-${crypto.randomUUID()}`), type, parentId }] });
  };
  const moveRow = (id: RowId, parentId: RowId | null) => {
    const track = current.current.tracks.find(track => track.id === id);
    if (!track || id === parentId || track.parentId === (parentId ?? undefined)) return;
    if (parentId && !current.current.tracks.some(track => track.id === parentId && track.type === "group")) return;
    let ancestor = parentId;
    while (ancestor) { if (ancestor === id) return; ancestor = current.current.tracks.find(track => track.id === ancestor)?.parentId ?? null; }
    if (parentId && collapsed.includes(parentId)) toggleRow(parentId);
    commit({ ...current.current, tracks: current.current.tracks.map(track => track.id === id ? { ...track, parentId: parentId ?? undefined } : track) });
  };
  const reorderRow = (id: RowId, targetId: RowId, position: "before" | "after") => {
    const tracks = current.current.tracks;
    const moving = tracks.find(track => track.id === id);
    const target = tracks.find(track => track.id === targetId);
    if (!moving || !target || id === targetId) return;
    let ancestor = target.parentId;
    while (ancestor) { if (ancestor === id) return; ancestor = tracks.find(track => track.id === ancestor)?.parentId; }
    // Persist generated names before reordering, so Audio 1 stays Audio 1.
    const counts = { group: 0, audio: 0, animation: 0, event: 0 };
    const named = tracks.map(track => {
      if (track.external) return track;
      const number = ++counts[track.type];
      return { ...track, label: track.label ?? `${trackTypes[track.type].label} ${number}` };
    });
    const next = named.filter(track => track.id !== id);
    const index = next.findIndex(track => track.id === targetId) + (position === "after" ? 1 : 0);
    next.splice(index, 0, { ...named.find(track => track.id === id)!, parentId: target.parentId });
    if (next.every((track, i) => track.id === tracks[i].id && track.parentId === tracks[i].parentId)) return;
    commit({ ...current.current, tracks: next });
  };
  const rowActions = (row: TimelineRow) => {
    const track = document.tracks.find(track => track.id === row.id);
    if (!track) return null;
    const toggle = (key: "muted" | "solo") => commit({ ...current.current, tracks: current.current.tracks.map(item => item.id === row.id ? { ...item, [key]: !item[key] } : item) });
    const addClip = () => {
      const snapshot = sample();
      const time = snapshot.time;
      if (time >= (snapshot.range?.end ?? snapshot.duration)) return;
      if (track.type === "audio") {
        fileTarget.current = { rowId: row.id, time }; fileInput.current?.click();
      } else if (track.type === "event") {
        const event: TimelineEventCue = { kind: "event-cue", id: timelineId<"cue">(`event-${crypto.randomUUID()}`), rowId: row.id, label: "Event", time, color: trackTypes.event.color, eventType: "event" };
        commit({ ...current.current, events: [...(current.current.events ?? []), event] });
      } else {
        const id = timelineId<"clip">(`clip-${crypto.randomUUID()}`);
        commit({ ...current.current, clips: [...current.current.clips, { id, rowId: row.id, kind: "clip", label: track.type === "animation" ? "Animation" : "Event", sourceDuration: track.type === "animation" ? 12 : undefined, color: trackTypes[track.type].color, range: { start: time, end: time + (track.type === "animation" ? 12 : 1) } }] });
        setSelected(id);
      }
    };
    if (track.type === "group") return <>
      <button className="example-track-action" aria-label={`Mute ${row.label}`} aria-pressed={track.muted ?? false} title="Mute group" onClick={() => toggle("muted")}>M</button>
      <TrackMenu label={`Add track to ${row.label}`} options={Object.entries(trackTypes).map(([value, info]) => ({ value, label: value === "group" ? "Group" : `${info.label} Track` }))} onAdd={value => addTrackOfType(value, row.id)} />
    </>;
    return <>
      <button className="example-track-action" aria-label={`Mute ${row.label}`} aria-pressed={track.muted ?? false} title="Mute track" onClick={() => toggle("muted")}>M</button>
      <button className="example-track-action" aria-label={`Solo ${row.label}`} aria-pressed={track.solo ?? false} title="Solo track (same media type)" onClick={() => toggle("solo")}>S</button>
      <button className="example-track-action" aria-label={`Add ${track.type === "event" ? "event" : "clip"} to ${row.label}`} disabled={sample().time >= (sample().range?.end ?? sample().duration)} title={`Add ${track.type === "event" ? "event" : "clip"} at playhead (inside playback range)`} onClick={addClip}><svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></button>
    </>;
  };
  const filePicker = <input hidden ref={fileInput} type="file" accept="audio/*" multiple aria-label="Add audio clips" onChange={event => {
    const target = fileTarget.current; fileTarget.current = null;
    if (target) { setError(""); void load(Array.from(event.target.files ?? []), target.rowId, target.time); }
    event.target.value = "";
  }} />;
  const addTrack = <TrackMenu options={Object.entries(trackTypes).map(([value, info]) => ({ value, label: value === "group" ? "Group" : `${info.label} Track` }))} onAdd={value => addTrackOfType(value)} />;
  const projectName = motion ? "Untitled" : "Stress Test";
  const saveStatus = !ready ? "Loading project" : storageError || (saving ? "Saving project" : "Project saved in this browser");
  const rowIcon = (row: TimelineRow) => {
    const track = document.tracks.find(track => track.id === row.id);
    return track ? <span title={`${trackTypes[track.type].label} Track`}><TrackIcon type={track.type} /></span> : null;
  };
  const playbackRange = document.playbackRange ?? { start: 0, end: 12 };
  const changePlaybackRange = (range: TimeRange) => { if (range.end > range.start && (range.start !== playbackRange.start || range.end !== playbackRange.end)) commit({ ...current.current, playbackRange: range }); };
  const toolbar = <>
    <span className="example-save-state" role="status" aria-label={`${projectName}: ${saveStatus}`} title={`${projectName} · ${saveStatus}`}>{projectName}{!ready || storageError || saving ? "*" : ""}</span>
    <button className="timeline-editor__button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!past.current.length} onClick={undo}>↶</button>
    <button className="timeline-editor__button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!future.current.length} onClick={redo}>↷</button>
  </>;
  const renameRow = (id: RowId, label: string) => commit({ ...current.current, tracks: current.current.tracks.map(track => track.id === id ? { ...track, label } : track) });
  return { document, changePlaybackRange, collapsed, toggleRow, moveRow, reorderRow, ready, saving, toolbar, addTrack, rowIcon, rowActions, renameRow, filePicker, editing, eventEditing, properties: eventProperties ?? properties, preview, controller: wrapped, error, dismissError: () => setError("") };
}
