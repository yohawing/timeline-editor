import { useEffect, useState } from "react";

/** Commit once per edit so typing a value is one undo step. */
export function TimeField({ label, value, displayMode, fps, onCommit }: { label: string; value: number; displayMode: "frames" | "seconds"; fps: number; onCommit(value: number): void }) {
  const displayedValue = displayMode === "frames" ? Math.round(value * fps) : value;
  const [text, setText] = useState(String(displayedValue));
  useEffect(() => setText(String(displayedValue)), [displayedValue, displayMode, fps]);
  const commit = () => {
    const next = Number(text);
    const seconds = displayMode === "frames" ? Math.round(next) / fps : next;
    if (text.trim() && Number.isFinite(seconds) && next !== displayedValue) onCommit(seconds);
    setText(String(displayedValue));
  };
  return <input type="number" step={displayMode === "frames" ? 1 : 0.01} aria-label={label} title={`${label} (${displayMode === "frames" ? `frames, ${fps} fps` : "seconds"})`} value={text}
    onChange={event => setText(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setText(String(displayedValue)); }
    }} />;
}
