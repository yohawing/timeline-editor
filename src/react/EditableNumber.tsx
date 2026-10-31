import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

/** Shared numeric editor for toolbar values and settings inputs. */
export function EditableNumber({ value, getValue, display, label, inputLabel = label, title,
  className, inputClassName, buttonRef, disabled = false, step = "any",
  isValid = Number.isFinite, commitOnBlur = true, onCommit,
}: {
  value: number; getValue?: () => number; display?: ReactNode;
  label: string; inputLabel?: string; title?: string;
  className?: string; inputClassName: string; buttonRef?: Ref<HTMLButtonElement>;
  disabled?: boolean; step?: number | "any"; isValid?: (value: number) => boolean;
  commitOnBlur?: boolean; onCommit: (value: number) => void;
}) {
  const inline = display !== undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [width, setWidth] = useState<number>();
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const exitAction = useRef<"commit" | "cancel" | null>(null);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);
  const begin = (button: HTMLButtonElement) => {
    setDraft(String(getValue?.() ?? value));
    setWidth(button.getBoundingClientRect().width);
    setEditing(true);
  };
  if (inline && !editing) return <button ref={buttonRef} type="button" className={className}
    disabled={disabled} title={title} aria-label={label}
    onClick={event => begin(event.currentTarget)}
    onKeyDown={event => {
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault(); event.stopPropagation(); begin(event.currentTarget);
      }
    }}>{display}</button>;
  return <input ref={input} className={inputClassName} type="number" step={step}
    style={inline && width ? { width, minWidth: width, maxWidth: width, boxSizing: "border-box" } : undefined}
    aria-label={inputLabel} disabled={disabled} value={draft}
    onFocus={() => { focused.current = true; exitAction.current = null; }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      focused.current = false;
      const next = Number(draft);
      if (exitAction.current !== "cancel" && (commitOnBlur || exitAction.current === "commit") &&
          draft.trim() !== "" && Number.isFinite(next) && isValid(next) && (!commitOnBlur || next !== value)) onCommit(next);
      exitAction.current = null;
      setDraft(String(value));
      setEditing(false);
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        if (event.key === "Enter" && !commitOnBlur &&
            (draft.trim() === "" || !Number.isFinite(Number(draft)) || !isValid(Number(draft)))) return;
        exitAction.current = event.key === "Escape" ? "cancel" : "commit";
        event.currentTarget.blur();
      }
    }} />;
}
