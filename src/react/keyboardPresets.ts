/** Transport and navigation presets. The saved keyboardPreset field is retained for compatibility. */
export type TimelineKeyboardPreset = "ue" | "unity" | "maya" | "logic";
type Action = "toggle" | "play" | "pause" | "start" | "end" | "previous" | "next" | "loop" | "stopOrStart" | "fit";
export const keyboardPresets: Record<TimelineKeyboardPreset, { label: string; keys: Partial<Record<Action, string>> }> = {
  ue: { label: "UE", keys: { toggle: "Space", play: "Down", pause: "K", start: "Up", end: "Ctrl+Up", previous: "Left", next: "Right", fit: "Home" } },
  unity: { label: "Unity", keys: { toggle: "Space", previous: ",", next: ".", fit: "Home" } },
  maya: { label: "Maya", keys: { toggle: "Alt+V", start: "Alt+Shift+V", previous: "Alt+,", next: "Alt+.", fit: "Home" } },
  logic: { label: "Logic", keys: { toggle: "Space", stopOrStart: "Enter", start: "Shift+Enter", loop: "C", fit: "Home" } },
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

export function wheelAction(preset: TimelineKeyboardPreset, event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; deltaX: number; deltaY: number }): "time-zoom" | "row-zoom" | "pan-x" | "pan-y" | undefined {
  const modifier = event.ctrlKey || event.metaKey;
  if (preset === "logic") {
    if (event.altKey && modifier) return "time-zoom";
    if (event.altKey) return "row-zoom";
    if (modifier || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return "pan-x";
    return "pan-y";
  }
  if (event.altKey || (event.metaKey && preset !== "unity")) return;
  if (modifier) return "row-zoom";
  if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return "pan-x";
  return "time-zoom";
}
export function isPanGesture(preset: TimelineKeyboardPreset, event: { button: number; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): boolean {
  if (preset === "ue") return event.button === 1;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (preset === "maya") return event.button === 1 && event.altKey;
  if (preset === "unity") return event.button === 1 || (event.button === 0 && event.altKey);
  return event.button === 1 && !event.altKey;
}
