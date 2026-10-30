import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Local view state only; hosts may still set the initial width with CSS. */
export function TrackDivider({ onResize }: { onResize(width: number | null): void }) {
  const handle = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ width: 212, max: 480 });
  useEffect(() => {
    const body = handle.current?.parentElement;
    const heading = body?.querySelector(".timeline-editor__tree-heading");
    if (!body || !heading) return;
    const update = () => setMeasured({ width: heading.getBoundingClientRect().width, max: Math.max(120, body.clientWidth - 160) });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update); observer.observe(body); observer.observe(heading);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
  const width = (element: HTMLElement) => element.parentElement?.querySelector(".timeline-editor__tree-heading")?.getBoundingClientRect().width ?? 212;
  const clamp = (element: HTMLElement, value: number) => Math.max(120, Math.min(Math.max(120, (element.parentElement?.clientWidth ?? 480) - 160), value));
  return <div ref={handle} aria-valuenow={Math.round(measured.width)} aria-valuemin={120} aria-valuemax={measured.max} className="timeline-editor__track-divider" role="separator" aria-label="Track panel width" aria-orientation="vertical" tabIndex={0}
    style={{ touchAction: "none" } as CSSProperties}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
      drag.current = { pointer: event.pointerId, x: event.clientX, width: width(event.currentTarget) };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { const start = drag.current; if (start?.pointer === event.pointerId) onResize(clamp(event.currentTarget, start.width + event.clientX - start.x)); }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { if (drag.current) onResize(drag.current.width); drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={() => onResize(null)}
    onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); onResize(clamp(event.currentTarget, width(event.currentTarget) + (event.key === "ArrowLeft" ? -10 : 10))); }
      else if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); onResize(null); }
      else if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); onResize(drag.current.width); drag.current = null; }
    }} />;
}
