/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DragEvent } from "react";
import { useClipEditing, type TimelineEditing } from "./clipEditing";
import { createFixtureTimelineDataSource } from "../core/fixture";

it("never drops before the start of a sub-frame range", () => {
  const element = document.createElement("div");
  const source = createFixtureTimelineDataSource();
  const row = source.getRows({ start: 0, count: 1 })[0];
  const editing: TimelineEditing = { selectedClipId: null, canEditClip: () => true, canDropFiles: () => true,
    onSelectClip: vi.fn(), onMoveClip: vi.fn(), onDropFiles: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
  const { result } = renderHook(() => useClipEditing({ editing, dataSource: source, viewport: { current: element }, scale: 100, rowHeight: 26,
    range: { start: 3, end: 3.001 }, fps: 24, snap: true, scrollLeft: 0, width: 100 }));
  const file = new File(["audio"], "clip.wav");
  act(() => result.current.handlers.onDrop({ clientX: 0, clientY: 10, dataTransfer: { files: [file] }, preventDefault() {}, stopPropagation() {} } as unknown as DragEvent<HTMLDivElement>));
  expect(editing.onDropFiles).toHaveBeenCalledWith([file], row.id, 3);
});
