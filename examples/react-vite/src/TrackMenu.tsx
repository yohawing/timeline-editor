import { useId, useRef, useState } from "react";

export function TrackMenu({ options, onAdd }: { options: readonly { value: string; label: string }[]; onAdd(value: string): void }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  return <>
    <button ref={trigger} className="example-add-track" aria-label="Add track" title="Add track" popoverTarget={id} aria-haspopup="menu"
      onClick={() => { const box = trigger.current!.getBoundingClientRect(); setPosition({ left: Math.max(4, box.right - 160), top: box.bottom + 3 }); }}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
    <div ref={menu} id={id} popover="auto" role="menu" aria-label="Track types" className="example-track-menu" style={position}
      onToggle={event => { if ((event.nativeEvent as ToggleEvent).newState === "open") menu.current?.querySelector("button")?.focus(); }}
      onKeyDown={event => {
        const buttons = Array.from(menu.current?.querySelectorAll("button") ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus(); }
      }}>
      {options.map(option => <button key={option.value} role="menuitem" onClick={() => { onAdd(option.value); menu.current?.hidePopover(); trigger.current?.focus(); }}>{option.label}</button>)}
    </div>
  </>;
}
