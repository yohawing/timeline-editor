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


it.each([false, true])("moves before the view only when opted in: %s", (allowMoveBeforeRange) => {
  const element = document.createElement("div");
  element.setPointerCapture = vi.fn(); element.hasPointerCapture = () => false;
  const source = createFixtureTimelineDataSource();
  const row = source.getRows({ start: 0, count: 1 })[0];
  const clip = { kind: "clip" as const, id: "negative" as import("../core/contracts").ClipId, rowId: row.id, label: "audio", range: { start: 0, end: 10 } };
  const editing: TimelineEditing = { selectedClipId: clip.id, allowMoveBeforeRange, canEditClip: () => true, canDropFiles: () => true,
    onSelectClip: vi.fn(), onMoveClip: vi.fn(), onDropFiles: vi.fn(), onDelete: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
  const { result, unmount } = renderHook(() => useClipEditing({ editing, dataSource: { ...source, getItems: query => clip.range.end >= query.range.start && clip.range.start <= query.range.end ? [clip] : [] }, viewport: { current: element }, scale: 100, rowHeight: 26,
    range: { start: 0, end: 10 }, fps: 30, snap: true, scrollLeft: 0, width: 1000 }));
  const pointer = (clientX: number) => ({ button: 0, pointerId: 1, clientX, clientY: 10, target: element, currentTarget: element, preventDefault() {}, stopPropagation() {} }) as unknown as import("react").PointerEvent<HTMLDivElement>;
  act(() => result.current.renderClip(clip, 0)!.props.onPointerDown(pointer(200)));
  act(() => result.current.renderClip(clip, 0)!.props.onPointerMove(pointer(-100)));
  act(() => result.current.renderClip(clip, 0)!.props.onPointerUp(pointer(-100)));
  expect(editing.onMoveClip).toHaveBeenLastCalledWith(clip.id, row.id, allowMoveBeforeRange ? -3 : 0);
  if (allowMoveBeforeRange) {
    clip.range = { start: -3, end: 7 };
    act(() => result.current.renderClip(clip, 0)!.props.onPointerDown(pointer(100)));
    act(() => result.current.renderClip(clip, 0)!.props.onPointerMove(pointer(200)));
    act(() => result.current.renderClip(clip, 0)!.props.onPointerUp(pointer(200)));
    expect(editing.onMoveClip).toHaveBeenLastCalledWith(clip.id, row.id, -2);
    act(() => result.current.onKeyDown({ key: "ArrowLeft", ctrlKey: true, preventDefault() {}, stopPropagation() {} } as import("react").KeyboardEvent));
    expect(editing.onMoveClip).toHaveBeenLastCalledWith(clip.id, row.id, -3 - 1 / 30);
    clip.range = { start: -30, end: -20 };
    act(() => result.current.onKeyDown({ key: "ArrowRight", ctrlKey: true, preventDefault() {}, stopPropagation() {} } as import("react").KeyboardEvent));
    expect(editing.onMoveClip).toHaveBeenLastCalledWith(clip.id, row.id, -30 + 1 / 30);
  }
  unmount();
});
