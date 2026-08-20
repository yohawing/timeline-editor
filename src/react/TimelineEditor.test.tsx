/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timelineId, type TimelineDataSource } from "../core/contracts";
import type { TimelinePlaybackController, TimelinePlaybackSnapshot } from "../core/playback";
import { TimelineEditor } from "./TimelineEditor";

const target = { instanceId: "test-instance", clipIndex: 1 };
const rowId = timelineId<"row">("target-row");

function source(): TimelineDataSource {
  const row = { id: rowId, label: "Target Track", kind: "track" as const, depth: 0, color: "#678" };
  return {
    subscribe: () => () => undefined,
    getRevision: () => 1,
    getDomain: () => ({ kind: "seconds" }),
    getRange: () => ({ start: 0, end: 10 }),
    getGroups: () => [],
    getBindings: () => [],
    getRowCount: () => 1,
    getRows: () => [row],
    getPlaybackTarget: (id) => id === rowId ? target : null,
    getItems: () => [],
    getKeys: () => [],
  };
}

function controller(overrides: Partial<TimelinePlaybackSnapshot> = {}): TimelinePlaybackController & { dispatch: ReturnType<typeof vi.fn> } {
  const snapshot: TimelinePlaybackSnapshot = {
    available: true,
    time: 1,
    duration: 10,
    playing: false,
    looping: false,
    target,
    sampledAtUnixMs: Date.now(),
    ...overrides,
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    dispatch: vi.fn(),
  };
}

beforeEach(() => {
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arcTo: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  class TestResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  if (!HTMLElement.prototype.setPointerCapture) Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: () => undefined, configurable: true, writable: true });
  if (!HTMLElement.prototype.releasePointerCapture) Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { value: () => undefined, configurable: true, writable: true });
  if (!HTMLElement.prototype.hasPointerCapture) Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { value: () => true, configurable: true, writable: true });
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "releasePointerCapture").mockImplementation(() => undefined);
  vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(true);
});
afterEach(() => cleanup());

describe("TimelineEditor transport and interaction boundary", () => {
  it("keeps transport disabled without a controller", () => {
    render(<TimelineEditor dataSource={source()} />);
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Loop" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  it("toggles a single play/pause button based on the controller's playing state", () => {
    const playback = controller({ playing: true });
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    const pauseButton = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(pauseButton);
    expect(playback.dispatch).toHaveBeenCalledWith({ type: "pause", target });
  });

  it("steps one frame forward and backward honoring the frame rate", () => {
    const playback = controller();
    render(<TimelineEditor dataSource={source()} playbackController={playback} frameRate={24} />);
    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
    expect(playback.dispatch).toHaveBeenLastCalledWith({ type: "seek", time: 25 / 24, target });
    fireEvent.click(screen.getByRole("button", { name: "Previous frame" }));
    expect(playback.dispatch).toHaveBeenLastCalledWith({ type: "seek", time: 23 / 24, target });
  });

  it("skips to the start and end of the timeline range", () => {
    const playback = controller();
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip to start" }));
    expect(playback.dispatch).toHaveBeenLastCalledWith({ type: "seek", time: 0, target });
    fireEvent.click(screen.getByRole("button", { name: "Skip to end" }));
    expect(playback.dispatch).toHaveBeenLastCalledWith({ type: "seek", time: 10, target });
  });

  it("hides the built-in title strip when showTitle is false", () => {
    render(<TimelineEditor dataSource={source()} showTitle={false} />);
    expect(screen.queryByText("Timeline")).toBeNull();
  });

  it("disables transport and sanitizes malformed host playback state", () => {
    const malformed = {
      available: true,
      time: Number.NaN,
      duration: -4,
      playing: true,
      looping: true,
      target: { instanceId: "", clipIndex: -1 },
      sampledAtUnixMs: Number.NaN,
    } as unknown as TimelinePlaybackSnapshot;
    const playback: TimelinePlaybackController = {
      getSnapshot: () => ({ ...malformed, target: malformed.target }),
      subscribe: () => () => undefined,
      dispatch: vi.fn(),
    };
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(document.body.innerHTML).not.toContain("NaN");
    expect(document.body.innerHTML).not.toContain("Infinity");
  });

  it("selects a row target by mouse and keyboard and sends target commands", () => {
    const playback = controller();
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    const row = screen.getByRole("button", { name: /Select playback target Target Track/ });
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(playback.dispatch).toHaveBeenCalledWith({ type: "play", target });
  });

  it("cycles the playback rate and shows 1x when the controller omits rate", () => {
    const playback = controller();
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    const rateButton = screen.getByRole("button", { name: "Playback rate" });
    expect(rateButton.textContent).toBe("1x");
    fireEvent.click(rateButton);
    expect(playback.dispatch).toHaveBeenCalledWith({ type: "setRate", rate: 2, target });
  });

  it("displays the controller-reported rate and continues the cycle from it", () => {
    const playback = controller({ rate: 2 });
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    const rateButton = screen.getByRole("button", { name: "Playback rate" });
    expect(rateButton.textContent).toBe("2x");
    fireEvent.click(rateButton);
    expect(playback.dispatch).toHaveBeenCalledWith({ type: "setRate", rate: 0.25, target });
  });

  it("restores scrub origin on pointercancel and dispatches the origin seek", () => {
    const playback = controller();
    render(<TimelineEditor dataSource={source()} playbackController={playback} />);
    const viewport = document.querySelector(".timeline-editor__viewport") as HTMLDivElement;
    Object.defineProperty(viewport, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 300, height: 100 }) });
    const pointerDown = new Event("pointerdown", { bubbles: true });
    Object.assign(pointerDown, { button: 0, pointerId: 1, clientX: 10 });
    fireEvent(viewport, pointerDown);
    expect(playback.dispatch).not.toHaveBeenCalled();
    const pointerMove = new Event("pointermove", { bubbles: true });
    Object.assign(pointerMove, { pointerId: 1, clientX: 100 });
    fireEvent(viewport, pointerMove);
    const pointerCancel = new Event("pointercancel", { bubbles: true });
    Object.assign(pointerCancel, { pointerId: 1, clientX: 100 });
    fireEvent(viewport, pointerCancel);
    expect(playback.dispatch).toHaveBeenLastCalledWith({ type: "seek", time: 1, target });
  });

  it("does not re-render while pointermove previews the scrub imperatively", () => {
    const playback = controller();
    const renders: string[] = [];
    render(
      <Profiler id="timeline" onRender={() => renders.push("render")}>
        <TimelineEditor dataSource={source()} playbackController={playback} />
      </Profiler>,
    );
    const viewport = document.querySelector(".timeline-editor__viewport") as HTMLDivElement;
    Object.defineProperty(viewport, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 300, height: 100 }) });
    act(() => {
      const pointerDown = new Event("pointerdown", { bubbles: true });
      Object.assign(pointerDown, { button: 0, pointerId: 1, clientX: 10 });
      fireEvent(viewport, pointerDown);
    });
    const afterDown = renders.length;
    act(() => {
      for (const clientX of [30, 60, 100, 140]) {
        const pointerMove = new Event("pointermove", { bubbles: true });
        Object.assign(pointerMove, { pointerId: 1, clientX });
        fireEvent(viewport, pointerMove);
      }
    });
    expect(renders.length).toBe(afterDown);
    expect(playback.dispatch).not.toHaveBeenCalled();
  });

  it("reports rejected async commands and follows display props", async () => {
    const playback = controller();
    playback.dispatch.mockRejectedValue(new Error("transport down"));
    const onDiagnostic = vi.fn();
    const view = render(<TimelineEditor dataSource={source()} playbackController={playback} frameRate={30} onDiagnostic={onDiagnostic} displayMode="frames" variant="compact" />);
    expect(document.querySelector(".timeline-editor--compact")).toBeTruthy();
    expect(screen.getByText("30 fps")).toBeTruthy();
    view.rerender(<TimelineEditor dataSource={source()} playbackController={playback} frameRate={30} onDiagnostic={onDiagnostic} displayMode="seconds" variant="full" />);
    expect(document.querySelector(".timeline-editor--full")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play" })); await Promise.resolve(); });
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ level: "error", source: "timeline" }));
  });
});
