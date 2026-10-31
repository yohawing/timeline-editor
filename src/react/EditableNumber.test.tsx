/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableNumber } from "./EditableNumber";
afterEach(cleanup);
describe("EditableNumber", () => {
  it.each(["Current frame", "Playback rate"])("preserves button width and commits %s", label => {
    const onCommit = vi.fn();
    const view = render(<EditableNumber value={1} display="0001 / 1500" label={label} inputClassName="number" onCommit={onCommit} />);
    const button = view.getByRole("button");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ width: 112 } as DOMRect);
    fireEvent.click(button);
    const input = view.getByRole("spinbutton") as HTMLInputElement;
    expect(input.style.width).toBe("112px");
    expect(input.style.maxWidth).toBe("112px");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "2.5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(2.5);
    expect(view.queryByRole("spinbutton")).toBeNull();
  });
  it("reads live time on entry and preserves time blur cancellation", () => {
    const onCommit = vi.fn();
    const view = render(<EditableNumber value={0} getValue={() => 42} display="0042" label="Time" inputClassName="number" commitOnBlur={false} onCommit={onCommit} />);
    fireEvent.keyDown(view.getByRole("button"), { key: "F2" });
    const input = view.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("42");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(42);
    onCommit.mockClear();
    fireEvent.click(view.getByRole("button"));
    const reopened = view.getByRole("spinbutton");
    fireEvent.change(reopened, { target: { value: "0" } });
    fireEvent.keyDown(reopened, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(0);
    onCommit.mockClear();
    fireEvent.click(view.getByRole("button"));
    fireEvent.change(view.getByRole("spinbutton"), { target: { value: "75" } });
    fireEvent.blur(view.getByRole("spinbutton"));
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("cancels Escape, rejects invalid rates, and commits settings on blur", () => {
    const onCommit = vi.fn();
    const view = render(<EditableNumber value={1} label="Rate" inputClassName="number" isValid={n => n > 0} onCommit={onCommit} />);
    const input = view.getByRole("spinbutton") as HTMLInputElement;
    for (const value of ["", "0", "-1"]) {
      input.focus(); fireEvent.change(input, { target: { value } }); fireEvent.keyDown(input, { key: "Enter" });
      expect(input.value).toBe("1");
    }
    input.focus(); fireEvent.change(input, { target: { value: "2" } }); fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    input.focus(); fireEvent.change(input, { target: { value: "1.375" } }); fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(1.375);
  });
});
