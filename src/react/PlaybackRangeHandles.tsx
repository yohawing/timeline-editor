import { useRef } from "react";
import type { TimeRange } from "../core/contracts";

export function PlaybackRangeHandles({ range, viewStart, scale, scrollLeft, width, fps, snap = true, displayMode, onPreview, onChange }: {
  range: TimeRange; viewStart: number; scale: number; scrollLeft: number; width: number; fps: number; snap?: boolean;
  displayMode: "frames" | "seconds"; onPreview(range: TimeRange | null): void; onChange(range: TimeRange): void;
}) {
  const drag = useRef<{ pointer: number; x: number; edge: "start" | "end"; origin: TimeRange; next: TimeRange; element: HTMLDivElement } | null>(null);
  const finish = (cancel: boolean) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    onPreview(null);
    if (!cancel && (start.next.start !== start.origin.start || start.next.end !== start.origin.end)) onChange(start.next);
    if (start.element.hasPointerCapture(start.pointer)) start.element.releasePointerCapture(start.pointer);
  };
  const change = (origin: TimeRange, edge: "start" | "end", time: number): TimeRange => edge === "start"
    ? { start: Math.min(origin.end - 1 / fps, time), end: origin.end }
    : { start: origin.start, end: Math.max(origin.start + 1 / fps, time) };
  return <>{(["start", "end"] as const).map(edge => {
    const x = (range[edge] - viewStart) * scale - scrollLeft;
    if ((x < 0 || x > width) && drag.current?.edge !== edge) return null;
    const label = `Playback range ${edge}`;
    const value = displayMode === "frames" ? `${Math.round(range[edge] * fps)} f` : `${range[edge].toFixed(2)} s`;
    return <div key={edge} role="slider" tabIndex={0} aria-label={label} aria-orientation="horizontal" aria-valuenow={range[edge]}
      aria-valuetext={value} title={`${label}: ${value} · Drag or Left/Right · Hold Alt during drag to bypass snapping`}
      className={`timeline-editor__playback-handle timeline-editor__playback-handle--${edge}`}
      style={{ left: Math.max(3, Math.min(width - 9, x - (edge === "end" ? 8 : 0))) }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
        drag.current = { pointer: event.pointerId, x: event.clientX, edge, origin: range, next: range, element: event.currentTarget };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.pointer !== event.pointerId) return;
        event.stopPropagation();
        const raw = start.origin[edge] + (event.clientX - start.x) / scale;
        start.next = change(start.origin, edge, snap && !event.altKey ? Math.round(raw * fps) / fps : raw);
        onPreview(start.next);
      }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { event.stopPropagation(); finish(false); } }}
      onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) finish(true); }}
      onLostPointerCapture={() => finish(true)}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); finish(true); }
        else if (!drag.current && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          const next = change(range, edge, range[edge] + (event.key === "ArrowLeft" ? -1 : 1) / fps);
          if (next.start !== range.start || next.end !== range.end) onChange(next);
        }
      }} />;
  })}</>;
}
