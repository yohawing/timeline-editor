import { useRef, type RefObject, type PointerEvent, type KeyboardEvent, type MouseEvent } from "react";

export function useMiddlePan(viewport: RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; element: HTMLDivElement } | null>(null);
  const finish = (cancel: boolean) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    if (cancel && viewport.current) { viewport.current.scrollLeft = start.left; viewport.current.scrollTop = start.top; }
    start.element.classList.remove("is-panning");
    if (start.element.hasPointerCapture(start.pointer)) start.element.releasePointerCapture(start.pointer);
  };
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 1 || !viewport.current) return;
      event.preventDefault(); event.stopPropagation(); viewport.current.focus();
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop, element: event.currentTarget };
      event.currentTarget.classList.add("is-panning");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId || !viewport.current) return;
      event.preventDefault(); event.stopPropagation();
      viewport.current.scrollLeft = start.left - (event.clientX - start.x);
      viewport.current.scrollTop = start.top - (event.clientY - start.y);
    },
    onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) { event.preventDefault(); event.stopPropagation(); finish(false); } },
    onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) { event.stopPropagation(); finish(true); } },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer === event.pointerId) finish(true); },
    onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); } },
    onAuxClickCapture: (event: MouseEvent<HTMLDivElement>) => { if (event.button === 1) event.preventDefault(); },
  };
}
