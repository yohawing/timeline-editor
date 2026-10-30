import { useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from "react";
import type { ClipId, RowId, TimeRange, TimelineClip, TimelineDataSource } from "../core/contracts";

/** Optional controlled editing. The host owns data, audio and undo history. */
export interface TimelineEditing {
  selectedClipId: ClipId | null;
  canEditClip(clip: TimelineClip): boolean;
  canDropFiles(rowId: RowId): boolean;
  /** Defaults to the original row; file-drop eligibility is independent. */
  canMoveClip?(clip: TimelineClip, rowId: RowId): boolean;
  onSelectClip(id: ClipId | null): void;
  onMoveClip(id: ClipId, rowId: RowId, start: number): void;
  onDropFiles(files: readonly File[], rowId: RowId, time: number): void;
  onDelete(): void;
  onUndo(): void;
  onRedo(): void;
}

export function useClipEditing({ editing, dataSource, viewport, scale, rowHeight, range, fps, snap, scrollLeft, width }: {
  editing?: TimelineEditing; dataSource: TimelineDataSource;
  viewport: RefObject<HTMLDivElement | null>; scale: number; rowHeight: number;
  range: TimeRange; fps: number; snap: boolean; scrollLeft: number; width: number;
}) {
  const [preview, setPreview] = useState<{ rowId: RowId; start: number; label: string } | null>(null);
  const drag = useRef<{ id: ClipId; rowId: RowId; start: number; offset: number; pointer: number; element: HTMLElement } | null>(null);
  const previewRef = useRef(preview);
  const set = (value: typeof preview) => { previewRef.current = value; setPreview(value); };
  const latestStart = Math.max(range.start, range.end - 1 / fps);
  const timeAt = (clientX: number, bypass = false) => {
    const element = viewport.current;
    const raw = range.start + (clientX - (element?.getBoundingClientRect().left ?? 0) + (element?.scrollLeft ?? 0)) / scale;
    return Math.min(latestStart, Math.max(range.start, snap && !bypass ? Math.round(raw * fps) / fps : raw));
  };
  const rowAt = (clientY: number) => {
    const element = viewport.current;
    const index = Math.floor((clientY - (element?.getBoundingClientRect().top ?? 0) + (element?.scrollTop ?? 0)) / rowHeight);
    return index >= 0 ? dataSource.getRows({ start: index, count: 1 })[0] : undefined;
  };
  const cancel = () => {
    const current = drag.current;
    drag.current = null; set(null);
    if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
  };
  const selectedClip = () => dataSource.getItems({ rowIds: dataSource.getRows({ start: 0, count: dataSource.getRowCount() }).map(row => row.id), range })
    .find((item): item is TimelineClip => item.kind === "clip" && item.id === editing?.selectedClipId);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!editing) return false;
    const modifier = event.ctrlKey || event.metaKey;
    let handled = true;
    if (event.key === "Escape") { cancel(); editing.onSelectClip(null); }
    else if (drag.current) return true;
    else if (modifier && event.key.toLowerCase() === "z") { if (event.shiftKey) editing.onRedo(); else editing.onUndo(); }
    else if (modifier && event.key.toLowerCase() === "y") editing.onRedo();
    else if (event.key === "Delete" || event.key === "Backspace") editing.onDelete();
    else if (modifier && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const clip = selectedClip();
      if (clip && editing.canEditClip(clip)) editing.onMoveClip(clip.id, clip.rowId, Math.max(range.start, Math.min(latestStart, clip.range.start + (event.key === "ArrowLeft" ? -1 : 1) / fps)));
    } else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
    return handled;
  };
  const dropTarget = (event: DragEvent) => {
    const row = rowAt(event.clientY);
    return row && editing?.canDropFiles(row.id) ? { rowId: row.id, start: timeAt(event.clientX, event.altKey), label: `${row.label} · ${timeAt(event.clientX, event.altKey).toFixed(2)} s` } : null;
  };
  const handlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!editing || !event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      const target = dropTarget(event); set(target); event.dataTransfer.dropEffect = target ? "copy" : "none";
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) set(null); },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!editing) return;
      event.preventDefault(); event.stopPropagation();
      const target = dropTarget(event); set(null);
      if (target) { editing.onDropFiles(Array.from(event.dataTransfer.files), target.rowId, target.start); viewport.current?.focus(); }
    },
  };
  const renderClip = (clip: TimelineClip, rowIndex: number) => {
    if (!editing?.canEditClip(clip)) return null;
    const moving = drag.current?.id === clip.id ? preview : null;
    const start = moving?.start ?? clip.range.start;
    const duration = clip.range.end - clip.range.start;
    const rows = moving ? dataSource.getRows({ start: 0, count: dataSource.getRowCount() }) : [];
    const index = moving ? rows.findIndex(row => row.id === moving.rowId) : rowIndex;
    const x = (start - range.start) * scale;
    const left = Math.max(scrollLeft, x);
    const right = Math.min(scrollLeft + width, x + duration * scale);
    const visibleWidth = Math.max(1, right - left);
    const peaks = clip.waveform;
    const path: string[] = [];
    if (peaks?.length && duration > 0) {
      // Aggregate all bins represented by a pixel, so narrow transients survive zoom-out.
      for (let px = 0; px < visibleWidth; px += 2) {
        const a = Math.max(0, Math.floor((left + px - x) / (duration * scale) * peaks.length));
        const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil((left + px + 2 - x) / (duration * scale) * peaks.length)));
        let peak = 0;
        for (let bin = a; bin < b; bin++) peak = Math.max(peak, peaks[bin]);
        const height = Math.max(0.5, peak * 14);
        path.push(`M${px},${24 - height}v${height * 2}`);
      }
    }
    return <div key={clip.id} role="button" tabIndex={0} aria-label={`Clip ${clip.label}`} aria-pressed={editing.selectedClipId === clip.id}
      data-clip-id={clip.id} data-start={start} data-row-id={moving?.rowId ?? clip.rowId}
      className={`timeline-editor__editable-clip${editing.selectedClipId === clip.id ? " is-selected" : ""}`}
      title={`${clip.label} · ${start.toFixed(2)} s — ${(start + duration).toFixed(2)} s`}
      style={{ left, top: index * rowHeight + 2, width: visibleWidth, height: rowHeight - 4, backgroundColor: clip.color }}
      onKeyDown={(event) => { if (event.key === "Enter") { editing.onSelectClip(clip.id); event.preventDefault(); } }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); viewport.current?.focus(); editing.onSelectClip(clip.id);
        drag.current = { id: clip.id, rowId: clip.rowId, start: clip.range.start, offset: timeAt(event.clientX, true) - clip.range.start, pointer: event.pointerId, element: event.currentTarget };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
        event.stopPropagation();
        const raw = timeAt(event.clientX, true) - current.offset;
        const next = Math.max(range.start, Math.min(latestStart, snap && !event.altKey ? Math.round(raw * fps) / fps : raw));
        const row = rowAt(event.clientY);
        set({ rowId: row && (editing.canMoveClip?.(clip, row.id) ?? row.id === clip.rowId) ? row.id : current.rowId, start: next, label: `${next.toFixed(2)} s` });
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointer !== event.pointerId) return;
        event.stopPropagation(); const next = previewRef.current;
        if (next) editing.onMoveClip(clip.id, next.rowId, next.start);
        cancel();
      }} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}>
      <span>{clip.label}</span>
      {peaks && <svg className="timeline-editor__waveform" aria-label="Audio waveform" viewBox={`0 0 ${visibleWidth} 40`} preserveAspectRatio="none"><path d={path.join("")} /></svg>}
    </div>;
  };
  const rowIndex = preview ? dataSource.getRows({ start: 0, count: dataSource.getRowCount() }).findIndex(row => row.id === preview.rowId) : -1;
  const indicator = preview && <div className="timeline-editor__drop-preview" style={{ left: (preview.start - range.start) * scale, top: rowIndex * rowHeight, height: rowHeight }}><span>{preview.label}</span></div>;
  return { handlers, renderClip, indicator, onKeyDown };
}
