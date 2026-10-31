import { useLayoutEffect, useState, type RefObject } from "react";

const tokens = ["row-divider", "row-group", "row-even", "row-odd", "grid-major", "grid-frame", "grid-minor", "selection", "clip-border", "clip-text", "clip-loop-line", "cue-label", "key", "key-selected", "key-border", "key-column"] as const;
export type CanvasColors = Record<typeof tokens[number], string>;

/** CSS owns the palette. Observe theme inputs, not animated Canvas/clip descendants. */
export function useCanvasTheme(root: RefObject<HTMLElement | null>): CanvasColors | null {
  const [colors, setColors] = useState<CanvasColors | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return;
    const read = () => {
      const style = view.getComputedStyle(element);
      const next = Object.fromEntries(tokens.map(token => [token, style.getPropertyValue(`--timeline-${token}`).trim() || style.color])) as CanvasColors;
      setColors(previous => previous && tokens.every(token => previous[token] === next[token]) ? previous : next);
    };
    let frame: number | null = null;
    const schedule = () => { if (frame === null) frame = view.requestAnimationFrame(() => { frame = null; read(); }); };
    const observer = new view.MutationObserver(schedule);
    const ancestors = new Set<HTMLElement>();
    const onTransitionEnd = (event: Event) => { if (ancestors.has(event.target as HTMLElement)) schedule(); };
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      ancestors.add(ancestor);
      observer.observe(ancestor, { attributes: true });
    }
    element.ownerDocument.addEventListener("transitionend", onTransitionEnd, true);
    observer.observe(element.ownerDocument.head, { childList: true, subtree: true, characterData: true, attributes: true });
    const media = ["(prefers-color-scheme: dark)", "(forced-colors: active)"].map(query => view.matchMedia?.(query)).filter((query): query is MediaQueryList => Boolean(query));
    media.forEach(query => query.addEventListener("change", schedule));
    element.ownerDocument.head.addEventListener("load", schedule, true);
    view.addEventListener("resize", schedule);
    read();
    return () => {
      observer.disconnect();
      if (frame !== null) view.cancelAnimationFrame(frame);
      media.forEach(query => query.removeEventListener("change", schedule));
      element.ownerDocument.head.removeEventListener("load", schedule, true);
      view.removeEventListener("resize", schedule);
      element.ownerDocument.removeEventListener("transitionend", onTransitionEnd, true);
    };
  }, [root]);
  return colors;
}
