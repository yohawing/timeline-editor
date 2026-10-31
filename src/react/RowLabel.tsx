import { useRef, useState, type HTMLAttributes } from "react";
import type { TimelineRow } from "../core/contracts";

export function RowLabel({ row, style, targetProps, onRename }: {
  row: TimelineRow; style: HTMLAttributes<HTMLSpanElement>["style"];
  targetProps: HTMLAttributes<HTMLSpanElement>;
  onRename?: (rowId: TimelineRow["id"], label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.label);
  const finished = useRef(false);
  const finish = (cancel = false) => {
    if (finished.current) return;
    finished.current = true; setEditing(false);
    const label = value.trim();
    if (!cancel && label && label !== row.label) onRename?.(row.id, label);
  };
  if (editing) return <input className="timeline-editor__row-name-input" aria-label="Track name" value={value}
    ref={element => { if (element && document.activeElement !== element) { element.focus(); element.select(); } }}
    onChange={event => setValue(event.target.value)} onBlur={() => finish()}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); finish(event.key === "Escape"); } }} />;
  return <span {...targetProps} className="timeline-editor__row-label" style={style}
    title={onRename && !row.locked ? `${row.label} · Double-click to rename` : row.label}
    onDoubleClick={event => { if (onRename && !row.locked) { event.stopPropagation(); finished.current = false; setValue(row.label); setEditing(true); } }}>{row.label}</span>;
}
