import { useEffect, useState } from "react";

/** Commit once per edit so typing a value is one undo step. */
export function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit(value: number): void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const next = Number(text);
    if (text.trim() && Number.isFinite(next) && next !== value) onCommit(next);
    setText(String(value));
  };
  return <input type="number" step="0.01" aria-label={label} title={`${label} (seconds)`} value={text}
    onChange={event => setText(event.target.value)} onBlur={commit}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setText(String(value)); }
    }} />;
}
