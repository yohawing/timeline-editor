import { useEffect, useRef, useState } from "react";

const DEFAULT_RATIO = 0.58;

export function usePaneResize(initialRatio = DEFAULT_RATIO, onRatioChange?: (ratio: number) => void) {
  const shell = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(window.innerHeight);
  const [ratio, setRatio] = useState(initialRatio);
  useEffect(() => { onRatioChange?.(ratio); }, [ratio, onRatioChange]);
  const drag = useRef<{ pointer: number; y: number; preview: number; ratio: number } | null>(null);
  const available = Math.max(0, height - 1);
  const min = Math.min(120, available * 0.35);
  const max = Math.max(min, available - Math.min(220, available * 0.65));
  const preview = Math.max(min, Math.min(max, available * ratio));
  const resize = (pixels: number) => setRatio(available > 0 ? Math.max(min, Math.min(max, pixels)) / available : DEFAULT_RATIO);
  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const divider = <div role="separator" aria-label="Preview and timeline height" aria-orientation="horizontal"
    aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(preview)}
    tabIndex={0} className="example-pane-divider" title="Drag to resize · Double-click to reset"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      drag.current = { pointer: event.pointerId, y: event.clientY, preview, ratio };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { const start = drag.current; if (start?.pointer === event.pointerId) resize(start.preview + event.clientY - start.y); }}
    onPointerUp={event => { if (drag.current?.pointer !== event.pointerId) return; drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) { setRatio(drag.current.ratio); drag.current = null; } }}
    onLostPointerCapture={() => { if (drag.current) { setRatio(drag.current.ratio); drag.current = null; } }}
    onDoubleClick={() => setRatio(DEFAULT_RATIO)}
    onKeyDown={event => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); resize(preview + (event.key === "ArrowUp" ? -10 : 10)); }
      else if (event.key === "Home") { event.preventDefault(); setRatio(DEFAULT_RATIO); }
      else if (event.key === "Escape" && drag.current) { event.preventDefault(); setRatio(drag.current.ratio); drag.current = null; }
    }} />;
  return { shell, divider, style: { gridTemplateRows: `${preview}px minmax(0, 1fr)` } };
}
