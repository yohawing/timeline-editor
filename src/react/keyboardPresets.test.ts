import { describe, expect, it } from "vitest";
import { normalizeKeyboardPreset, keyboardAction, pointerNavigation, wheelAction } from "./keyboardPresets";
const plain = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, deltaX: 0, deltaY: -100 };
describe("documented preset distinctions", () => {
  it("restores original navigation by default and migrates removed presets", () => {
    for (const value of [undefined, "default", "logic", "unknown"]) expect(normalizeKeyboardPreset(value)).toBe("default");
    for (const value of ["ue", "unity", "maya"]) expect(normalizeKeyboardPreset(value)).toBe(value);
    expect(wheelAction("default", plain)).toBe("time-zoom");
    expect(wheelAction("default", { ...plain, ctrlKey: true })).toBe("row-zoom");
    expect(pointerNavigation("default", { ...plain, button: 1 })).toBe("pan");
    expect(pointerNavigation("default", { ...plain, button: 2 })).toBeUndefined();
  });
  it("keeps UE middle click unbound and reserves right drags for navigation", () => {
    expect(pointerNavigation("ue", { ...plain, button: 1 })).toBeUndefined();
    expect(pointerNavigation("ue", { ...plain, button: 2 })).toBe("pan");
    expect(pointerNavigation("ue", { ...plain, button: 2, altKey: true, shiftKey: true })).toBe("zoom");
    expect(wheelAction("ue", plain)).toBe("pan-y");
    expect(wheelAction("ue", { ...plain, ctrlKey: true })).toBe("time-zoom");
  });
  it("distinguishes Mac Command from Control for Unity", () => {
    expect(wheelAction("unity", { ...plain, metaKey: true }, true)).toBe("row-zoom");
    expect(wheelAction("unity", { ...plain, ctrlKey: true }, true)).toBeUndefined();
  });
  it("uses native fit/zoom keys", () => {
    expect(keyboardAction("ue", { ...plain, key: "-" })).toBe("zoomIn");
    expect(keyboardAction("unity", { ...plain, key: "-" })).toBe("zoomOut");
    expect(keyboardAction("unity", { ...plain, key: "a" })).toBe("fit");
  });
});
