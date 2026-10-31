import { useEffect, useRef, useState } from "react";

export function PlaybackRateInput({ rate, label, disabled, autoFocus = false, onCommit, onFinish }: {
  rate: number; label: string; disabled: boolean; autoFocus?: boolean;
  onCommit: (rate: number) => void; onFinish?: () => void;
}) {
  const [draft, setDraft] = useState(String(rate));
  const input = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(rate)); }, [rate]);
  useEffect(() => { if (autoFocus) { input.current?.focus(); input.current?.select(); } }, [autoFocus]);
  return <input ref={input} className="timeline-editor__rate-input" type="number" step="any" aria-label={label} disabled={disabled} value={draft}
    onFocus={() => { focused.current = true; cancelled.current = false; }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      focused.current = false;
      const next = Number(draft);
      if (!cancelled.current && Number.isFinite(next) && next > 0 && next !== rate) onCommit(next);
      setDraft(String(rate));
      onFinish?.();
    }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        cancelled.current = event.key === "Escape";
        event.currentTarget.blur();
      }
    }} />;
}
