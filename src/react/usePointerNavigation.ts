import { pointerNavigation, type TimelineKeyboardPreset } from "./keyboardPresets";
import { useRef, type RefObject, type PointerEvent, type KeyboardEvent, type MouseEvent } from "react";

export function usePointerNavigation(viewport: RefObject<HTMLDivElement | null>, preset: TimelineKeyboardPreset, captureZoom: (clientX: number) => (deltaX: number | null) => void) {
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; element: HTMLDivElement; zoom?: (deltaX: number | null) => void } | null>(null);
  const suppressContextMenu = useRef(false);
  const finish = (cancel: boolean) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    if (cancel) start.zoom?.(null);
    if (cancel && viewport.current) { viewport.current.scrollLeft = start.left; viewport.current.scrollTop = start.top; }
    start.element.classList.remove("is-panning");
    if (start.element.hasPointerCapture(start.pointer)) start.element.releasePointerCapture(start.pointer);
  };
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (!viewport.current) return;
      const mode = pointerNavigation(preset, event);
      suppressContextMenu.current = mode !== undefined && event.button === 2;
      if (!mode) {
        if (event.button === 1) event.preventDefault(); // Suppress browser autoscroll for unbound middle gestures.
        return;
      }
      event.preventDefault(); event.stopPropagation(); viewport.current.focus();
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop, element: event.currentTarget, zoom: mode === "zoom" ? captureZoom(event.clientX) : undefined };
      event.currentTarget.classList.add("is-panning");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId || !viewport.current) return;
      event.preventDefault(); event.stopPropagation();
      if (start.zoom) { start.zoom(event.clientX - start.x); return; }
      viewport.current.scrollLeft = start.left - (event.clientX - start.x);
      viewport.current.scrollTop = start.top - (event.clientY - start.y);
    },
    onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) { event.preventDefault(); event.stopPropagation(); finish(false); } },
    onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) { event.stopPropagation(); finish(true); } },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) finish(true); },
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); } },
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => { if (suppressContextMenu.current) event.preventDefault(); },
    onAuxClickCapture: (event: MouseEvent<HTMLDivElement>) => { if (event.button === 1) event.preventDefault(); },
  };
}
