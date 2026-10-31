/** Transport keys only; editing and mouse gestures keep their existing contracts. */
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
