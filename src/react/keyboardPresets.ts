/** Transport and navigation presets. The saved keyboardPreset field is retained for compatibility. */
export type TimelineKeyboardPreset = "ue" | "unity" | "maya" | "logic";
type Action = "toggle" | "play" | "pause" | "start" | "end" | "previous" | "next" | "loop" | "stopOrStart" | "fit" | "zoomIn" | "zoomOut" | "autoScroll";
export const keyboardPresets: Record<TimelineKeyboardPreset, { label: string; keys: Partial<Record<Action, string>> }> = {
  ue: { label: "UE", keys: { toggle: "Space", play: "Down", pause: "K", start: "Up", end: "Ctrl+Up", previous: "Left", next: "Right", fit: "Home", zoomIn: "-", zoomOut: "=", autoScroll: "Shift+S" } },
  unity: { label: "Unity", keys: { toggle: "Space", previous: ",", next: ".", fit: "A", zoomIn: "=", zoomOut: "-" } },
  maya: { label: "Maya", keys: { toggle: "Alt+V", start: "Alt+Shift+V", previous: "Alt+,", next: "Alt+.", fit: "Home" } },
  logic: { label: "Logic", keys: { toggle: "Space", stopOrStart: "Enter", loop: "C", fit: "Home" } },
};
export function normalizeKeyboardPreset(value: unknown): TimelineKeyboardPreset {
  return value === "unity" || value === "maya" || value === "logic" ? value : "ue";
}
export function keyboardAction(preset: TimelineKeyboardPreset, event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): Action | undefined {
  if (event.metaKey) return;
  const key = event.key === " " ? "Space" : event.key.replace(/^Arrow/, "");
  const chord = `${event.ctrlKey ? "Ctrl+" : ""}${event.altKey ? "Alt+" : ""}${event.shiftKey ? "Shift+" : ""}${key}`.toLowerCase();
  return (Object.entries(keyboardPresets[preset].keys) as [Action, string][]).find(([, binding]) => binding.toLowerCase() === chord)?.[0];
}

type Modifiers = { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };
export function wheelAction(preset: TimelineKeyboardPreset, event: Modifiers & { deltaX: number; deltaY: number }, mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)): "time-zoom" | "row-zoom" | "both-zoom" | "pan-x" | "pan-y" | undefined {
  const command = mac ? event.metaKey : event.ctrlKey;
  if (preset === "logic") {
    // Apple distinguishes Control from Command. Windows maps Command to Ctrl.
    if (mac && event.altKey && event.ctrlKey && !event.metaKey) return "both-zoom";
    if (event.altKey && (command || event.metaKey)) return "time-zoom";
    if (event.altKey) return "row-zoom";
    if (command || event.metaKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return "pan-x";
    return "pan-y";
  }
  if (event.altKey) return;
  if (preset === "ue") {
    if (event.ctrlKey && !event.metaKey && !event.shiftKey) return "time-zoom";
    if (event.ctrlKey || event.metaKey) return;
    return event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "pan-x" : "pan-y";
  }
  if (preset === "unity" && command) return "row-zoom";
  if (event.ctrlKey || event.metaKey) return;
  // Horizontal trackpad / Shift scrolling are common library extensions.
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return "pan-x";
  return "time-zoom";
}
export function pointerNavigation(preset: TimelineKeyboardPreset, event: Modifiers & { button: number }): "pan" | "zoom" | undefined {
  if (event.ctrlKey || event.metaKey) return;
  if (preset === "ue") {
    if (event.button !== 2) return;
    if (event.altKey && event.shiftKey) return "zoom";
    if (!event.altKey && !event.shiftKey) return "pan";
    return;
  }
  if (event.shiftKey) return;
  if (preset === "maya") {
    if (event.altKey && event.button === 1) return "pan";
    if (event.altKey && event.button === 2) return "zoom";
  }
  if (preset === "unity" && (event.button === 1 || (event.button === 0 && event.altKey))) return "pan";
  if (preset === "logic" && event.button === 1 && !event.altKey) return "pan";
}
