import { useRef, useState } from "react";
import type { TimeRange, TimelineEventCue } from "../core/contracts";

/** Optional event editing; data, evaluation and history remain host-owned. */
export interface TimelineEventEditing {
  selectedId: TimelineEventCue["id"] | null;
  canEdit(cue: TimelineEventCue): boolean;
  onSelect(id: TimelineEventCue["id"]): void;
  onMove(id: TimelineEventCue["id"], time: number): void;
  onOpenProperties?(id: TimelineEventCue["id"]): void;
  onDelete?(id: TimelineEventCue["id"]): void;
}

export function EventCue({ cue, editing, rowIndex, rowHeight, scale, range, fps, snap, displayMode }: {
  cue: TimelineEventCue; editing: TimelineEventEditing; rowIndex: number; rowHeight: number;
  scale: number; range: TimeRange; fps: number; snap: boolean; displayMode: "frames" | "seconds";
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; x: number; origin: number; next: number; element: HTMLButtonElement } | null>(null);
  const finish = (cancel: boolean) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null; setPreview(null);
    if (!cancel && start.next !== start.origin) editing.onMove(cue.id, start.next);
    if (start.element.hasPointerCapture(start.pointer)) start.element.releasePointerCapture(start.pointer);
  };
  const latestTime = Math.max(range.start, range.end - 1 / fps);
  const time = preview ?? cue.time;
  const x = (time - range.start) * scale;
  const hitLeft = Math.max(0, Math.min((range.end - range.start) * scale - 20, x - 10));
  const formatted = displayMode === "frames" ? `${Math.round(time * fps)} f` : `${time.toFixed(2)} s`;
  return <button type="button" className={`timeline-editor__event-cue${editing.selectedId === cue.id ? " is-selected" : ""}${cue.disabled ? " is-disabled" : ""}`}
    aria-label={`Event ${cue.label}`} aria-pressed={editing.selectedId === cue.id} data-time={time}
    title={`${cue.label} · ${formatted}${editing.onOpenProperties ? " · Double-click for properties" : ""}`}
    style={{ left: hitLeft, top: rowIndex * rowHeight, height: rowHeight, color: cue.color }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.stopPropagation(); event.currentTarget.focus(); editing.onSelect(cue.id);
      drag.current = { pointer: event.pointerId, x: event.clientX, origin: cue.time, next: cue.time, element: event.currentTarget };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      event.stopPropagation();
      const raw = start.origin + (event.clientX - start.x) / scale;
      start.next = Math.max(range.start, Math.min(latestTime, snap && !event.altKey ? Math.round(raw * fps) / fps : raw));
      setPreview(start.next);
    }}
    onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { event.stopPropagation(); finish(false); } }}
    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
    onClick={event => { event.stopPropagation(); editing.onSelect(cue.id); }}
    onDoubleClick={event => { event.stopPropagation(); editing.onOpenProperties?.(cue.id); }}
    onKeyDown={event => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); }
      else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); editing.onDelete?.(cue.id); }
      else if (!event.ctrlKey && !event.metaKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault(); event.stopPropagation();
        const next = Math.max(range.start, Math.min(latestTime, cue.time + (event.key === "ArrowLeft" ? -1 : 1) / fps));
        if (next !== cue.time) editing.onMove(cue.id, next);
      }
    }}>
    <svg style={{ transform: `translateX(${x - hitLeft - 10}px)` }} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 L9 5 L5 9 L1 5 Z" fill="currentColor" stroke={editing.selectedId === cue.id ? "#ffe08a" : "currentColor"} /></svg>
  </button>;
}
