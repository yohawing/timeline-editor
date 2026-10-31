import { describe, expect, it } from "vitest";
import { keyboardAction, pointerNavigation, wheelAction } from "./keyboardPresets";
const plain = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, deltaX: 0, deltaY: -100 };
describe("documented preset distinctions", () => {
  it("keeps UE middle click unbound and reserves right drags for navigation", () => {
    expect(pointerNavigation("ue", { ...plain, button: 1 })).toBeUndefined();
    expect(pointerNavigation("ue", { ...plain, button: 2 })).toBe("pan");
    expect(pointerNavigation("ue", { ...plain, button: 2, altKey: true, shiftKey: true })).toBe("zoom");
    expect(wheelAction("ue", plain)).toBe("pan-y");
    expect(wheelAction("ue", { ...plain, ctrlKey: true })).toBe("time-zoom");
  });
  it("distinguishes Mac Command from Control for Logic and Unity", () => {
    expect(wheelAction("logic", { ...plain, altKey: true, metaKey: true }, true)).toBe("time-zoom");
    expect(wheelAction("logic", { ...plain, altKey: true, ctrlKey: true }, true)).toBe("both-zoom");
    expect(wheelAction("logic", { ...plain, altKey: true, ctrlKey: true }, false)).toBe("time-zoom");
    expect(wheelAction("unity", { ...plain, metaKey: true }, true)).toBe("row-zoom");
    expect(wheelAction("unity", { ...plain, ctrlKey: true }, true)).toBeUndefined();
  });
  it("uses native fit/zoom keys and does not misrepresent Logic selection navigation", () => {
    expect(keyboardAction("ue", { ...plain, key: "-" })).toBe("zoomIn");
    expect(keyboardAction("unity", { ...plain, key: "-" })).toBe("zoomOut");
    expect(keyboardAction("unity", { ...plain, key: "a" })).toBe("fit");
    expect(keyboardAction("logic", { ...plain, shiftKey: true, key: "Enter" })).toBeUndefined();
  });
});
