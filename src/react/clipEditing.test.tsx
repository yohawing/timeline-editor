/** @vitest-environment jsdom */
import { act, renderHook, render, cleanup } from "@testing-library/react";
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


it("renders both waveform contracts with the same source-time offset and loop", () => {
  const source = createFixtureTimelineDataSource();
  const row = source.getRows({ start: 0, count: 1 })[0];
  const editing: TimelineEditing = { selectedClipId: null, canEditClip: () => true, canDropFiles: () => true,
    onSelectClip: vi.fn(), onMoveClip: vi.fn(), onDropFiles: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
  const { result } = renderHook(() => useClipEditing({ editing, dataSource: source, viewport: { current: document.createElement("div") }, scale: 100,
    rowHeight: 26, range: { start: 0, end: 4 }, fps: 24, snap: true, scrollLeft: 0, width: 400 }));
  const clip = { kind: "clip" as const, id: "wave" as import("../core/contracts").ClipId, rowId: row.id, label: "wave", color: "red", range: { start: 0, end: 4 }, sourceOffset: 1, sourceDuration: 2, loop: true };
  const peaks = [0, 1];
  const view = render(result.current.renderClip({ ...clip, waveform: peaks }, 0));
  const path = () => view.container.querySelector(".timeline-editor__waveform path")!.getAttribute("d");
  const arrayPath = path();
  expect(arrayPath).toContain("M0,10v28"); // starts at source second 1, not source zero
  expect(arrayPath).toContain("M100,23.5v1"); // wraps at source duration
  view.rerender(result.current.renderClip({ ...clip, waveform: { peaks, sampleDuration: 1 } }, 0));
  expect(path()).toBe(arrayPath);
  cleanup();
});
