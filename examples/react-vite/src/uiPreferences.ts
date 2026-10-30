import { useCallback, useRef } from "react";
import type { TimelineViewState } from "@yohawing/timeline-editor";

const KEY = "timeline-editor.demo.ui.v1";
interface Preferences { previewRatio?: number; timeline?: Partial<TimelineViewState> }
function read(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return {};
    return {
      previewRatio: Number.isFinite(value.previewRatio) && value.previewRatio > 0 && value.previewRatio < 1 ? value.previewRatio : undefined,
      timeline: value.timeline && typeof value.timeline === "object" ? value.timeline : undefined,
    };
  } catch { return {}; }
}

export function useUiPreferences() {
  const initial = useRef<Preferences | null>(null);
  if (initial.current === null) initial.current = read();
  const current = useRef(initial.current);
  const save = useCallback((patch: Preferences) => {
    current.current = { ...current.current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current.current)); } catch { /* Storage may be unavailable. */ }
  }, []);
  const saveTimeline = useCallback((timeline: TimelineViewState) => save({ timeline }), [save]);
  const saveRatio = useCallback((previewRatio: number) => save({ previewRatio }), [save]);
  return { initial: initial.current, saveTimeline, saveRatio };
}
