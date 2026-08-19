import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  clampTimelineTime,
  createViewTransform,
  formatCompactTimelineReadout,
  formatTimelineReadout,
  formatTimelineTick,
  normalizeFrameRate,
  resolveTimelineSeekTime,
  visibleTimelineTicks,
  type TimelineDataSource,
  type TimelineItem,
  type TimelineKey,
  type TimelineKeyColumn,
  type TimelineRow,
} from "../core";
import {
  TIMELINE_ROW_HEIGHT,
  visibleTimelineRowQuery,
} from "../core/layout";
import type {
  TimelinePlaybackCommand,
  TimelinePlaybackController,
  TimelinePlaybackSnapshot,
} from "../core/playback";
import {
  projectTimelinePlaybackTime,
  resolveTimelinePlaybackTarget,
  timelinePlaybackTargetEquals,
  type TimelinePlaybackTarget,
} from "../core/playback";
import "../styles/timeline.css";

export interface TimelineDiagnostic {
  level: "info" | "warning" | "error";
  source: "timeline";
  message: string;
  error?: unknown;
}

export interface TimelinePerformanceSummary {
  source: "timeline-canvas";
  paintMs: number;
  rowsPainted: number;
  itemsPainted: number;
  keysPainted: number;
  devicePixelRatio: number;
}

export interface TimelineEditorSlots {
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  emptyState?: ReactNode;
  diagnosticAction?: ReactNode;
}

export interface TimelineEditorProps {
  dataSource: TimelineDataSource;
  playbackController?: TimelinePlaybackController;
  frameRate?: number;
  displayMode?: "frames" | "seconds";
  variant?: "compact" | "full";
  className?: string;
  onDiagnostic?: (diagnostic: TimelineDiagnostic) => void;
  onPerformanceSummary?: (summary: TimelinePerformanceSummary) => void;
  slots?: TimelineEditorSlots;
}

interface CanvasViewport {
  width: number;
  height: number;
}

const MIN_PIXELS_PER_SECOND = 12;
const MAX_PIXELS_PER_SECOND = 180;
const DEFAULT_ZOOM_PERCENT = 38;
const EMPTY_PLAYBACK: TimelinePlaybackSnapshot = {
  available: false,
  time: 0,
  duration: 0,
  playing: false,
  looping: false,
};

function pixelsPerSecondFromZoom(zoomPercent: number): number {
  const percent = Math.min(100, Math.max(0, Number.isFinite(zoomPercent) ? zoomPercent : DEFAULT_ZOOM_PERCENT));
  return MIN_PIXELS_PER_SECOND + (MAX_PIXELS_PER_SECOND - MIN_PIXELS_PER_SECOND) * percent / 100;
}

function safeRange(dataSource: TimelineDataSource): { start: number; end: number } {
  const range = dataSource.getRange();
  const start = Number.isFinite(range.start) ? Math.max(0, range.start) : 0;
  const end = Number.isFinite(range.end) ? Math.max(start, range.end) : start;
  return { start, end };
}

function safeDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const value = window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? Math.max(1, value) : 1;
}

function isPlaybackTarget(value: unknown): value is TimelinePlaybackTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as { instanceId?: unknown; clipIndex?: unknown };
  return typeof target.instanceId === "string" && target.instanceId.length > 0 &&
    Number.isSafeInteger(target.clipIndex) && (target.clipIndex as number) >= 0;
}

/** Keep malformed host snapshots away from layout, Canvas, and transport controls. */
function normalizePlaybackSnapshot(value: unknown): TimelinePlaybackSnapshot {
  if (!value || typeof value !== "object") return EMPTY_PLAYBACK;
  const raw = value as Partial<Record<keyof TimelinePlaybackSnapshot, unknown>>;
  const durationIsValid = typeof raw.duration === "number" && Number.isFinite(raw.duration) && raw.duration >= 0;
  const timeIsValid = typeof raw.time === "number" && Number.isFinite(raw.time) && raw.time >= 0;
  const targetIsValid = raw.target === undefined || raw.target === null || isPlaybackTarget(raw.target);
  const available = raw.available === true && durationIsValid && timeIsValid && targetIsValid;
  const duration = durationIsValid ? raw.duration as number : 0;
  const time = available ? clampTimelineTime(raw.time as number, duration) : 0;
  const sampledAtUnixMs = typeof raw.sampledAtUnixMs === "number" && Number.isFinite(raw.sampledAtUnixMs) && raw.sampledAtUnixMs >= 0
    ? raw.sampledAtUnixMs
    : undefined;
  return {
    available,
    time,
    duration: available ? duration : 0,
    playing: available && raw.playing === true,
    looping: available && raw.looping === true,
    target: available && isPlaybackTarget(raw.target) ? raw.target : null,
    ...(sampledAtUnixMs === undefined ? {} : { sampledAtUnixMs }),
  };
}

function samePlaybackSnapshot(left: TimelinePlaybackSnapshot, right: TimelinePlaybackSnapshot): boolean {
  return left.available === right.available &&
    left.time === right.time &&
    left.duration === right.duration &&
    left.playing === right.playing &&
    left.looping === right.looping &&
    left.target?.instanceId === right.target?.instanceId &&
    left.target?.clipIndex === right.target?.clipIndex &&
    left.sampledAtUnixMs === right.sampledAtUnixMs;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, Math.max(0, width / 2), Math.max(0, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawItem(
  context: CanvasRenderingContext2D,
  item: TimelineItem,
  rowIndex: number,
  timeToX: (time: number) => number,
): void {
  const rowY = rowIndex * TIMELINE_ROW_HEIGHT;
  if (item.kind === "clip") {
    const x = timeToX(item.range.start);
    const width = Math.max(3, timeToX(item.range.end) - x);
    roundedRect(context, x + 1, rowY + 4, width - 2, 18, 3);
    context.globalAlpha = 0.82;
    context.fillStyle = item.color;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = item.selected ? "#f1f3ff" : "rgba(255,255,255,.16)";
    context.lineWidth = item.selected ? 1.5 : 1;
    context.stroke();
    context.save();
    context.beginPath();
    context.rect(x + 7, rowY + 4, Math.max(0, width - 14), 18);
    context.clip();
    context.fillStyle = "rgba(255,255,255,.9)";
    context.font = "500 10px Inter, Segoe UI, sans-serif";
    context.textBaseline = "middle";
    context.fillText(item.label, x + 8, rowY + 13);
    context.restore();
    return;
  }

  const x = timeToX(item.time);
  context.fillStyle = item.color;
  if (item.kind === "marker") {
    context.fillRect(x, rowY + 7, 1, 15);
    context.beginPath();
    context.moveTo(x - 5, rowY + 5);
    context.lineTo(x + 5, rowY + 5);
    context.lineTo(x, rowY + 11);
    context.closePath();
    context.fill();
  } else if (item.kind === "event-cue") {
    context.beginPath();
    context.moveTo(x, rowY + 5);
    context.lineTo(x + 6, rowY + 9);
    context.lineTo(x + 6, rowY + 17);
    context.lineTo(x, rowY + 21);
    context.lineTo(x - 6, rowY + 17);
    context.lineTo(x - 6, rowY + 9);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(x, rowY + 13, 5, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "rgba(238,238,244,.78)";
  context.font = "500 9px Inter, Segoe UI, sans-serif";
  context.textBaseline = "middle";
  context.fillText(item.label, x + 9, rowY + 13);
}

function drawKey(
  context: CanvasRenderingContext2D,
  key: TimelineKey,
  rowIndex: number,
  timeToX: (time: number) => number,
): void {
  const x = timeToX(key.time);
  const y = rowIndex * TIMELINE_ROW_HEIGHT + 19;
  const radius = key.selected ? 4.5 : 3.5;
  context.beginPath();
  context.moveTo(x, y - radius);
  context.lineTo(x + radius, y);
  context.lineTo(x, y + radius);
  context.lineTo(x - radius, y);
  context.closePath();
  context.fillStyle = key.selected ? "#fff" : "rgba(230,232,255,.78)";
  context.fill();
  context.strokeStyle = "rgba(24,24,31,.9)";
  context.lineWidth = 1;
  context.stroke();
}

function drawKeyColumn(
  context: CanvasRenderingContext2D,
  column: TimelineKeyColumn,
  rowIndex: number,
  timeToX: (time: number) => number,
): void {
  if (column.count <= 1) {
    drawKey(context, {
      kind: "key",
      id: `aggregate:${column.channelId}:${column.time}` as TimelineKey["id"],
      rowId: column.rowId,
      channelId: column.channelId,
      time: column.time,
    }, rowIndex, timeToX);
    return;
  }
  const x = Math.round(timeToX(column.time)) + 0.5;
  const y = rowIndex * TIMELINE_ROW_HEIGHT + 13;
  context.strokeStyle = `rgba(230,232,255,${Math.min(1, .3 + Math.log2(column.count) / 8)})`;
  context.lineWidth = Math.min(4, 1 + Math.log2(column.count) / 3);
  context.beginPath();
  context.moveTo(x, y - 9);
  context.lineTo(x, y + 9);
  context.stroke();
}

function dispatchSafely(
  controller: TimelinePlaybackController | undefined,
  command: TimelinePlaybackCommand,
  onDiagnostic: TimelineEditorProps["onDiagnostic"],
): void {
  if (!controller) return;
  try {
    const result = controller.dispatch(command);
    if (result && typeof (result as PromiseLike<void>).then === "function") {
      void (result as PromiseLike<void>).then(undefined, (error) => {
        onDiagnostic?.({ level: "error", source: "timeline", message: "Playback command failed", error });
      });
    }
  } catch (error) {
    onDiagnostic?.({ level: "error", source: "timeline", message: "Playback command failed", error });
  }
}

export function TimelineEditor({
  dataSource,
  playbackController,
  frameRate = 24,
  displayMode: initialDisplayMode = "frames",
  variant = "full",
  className,
  onDiagnostic,
  onPerformanceSummary,
  slots,
}: TimelineEditorProps): ReactElement {
  const fps = normalizeFrameRate(frameRate);
  const revision = useSyncExternalStore(
    useCallback((listener) => dataSource.subscribe(listener), [dataSource]),
    useCallback(() => dataSource.getRevision(), [dataSource]),
    useCallback(() => dataSource.getRevision(), [dataSource]),
  );
  const playbackSnapshotCacheRef = useRef<{
    source: unknown;
    snapshot: TimelinePlaybackSnapshot;
  }>({ source: EMPTY_PLAYBACK, snapshot: EMPTY_PLAYBACK });
  const readPlaybackSnapshot = useCallback(() => {
    let source: unknown = EMPTY_PLAYBACK;
    try {
      source = playbackController?.getSnapshot() ?? EMPTY_PLAYBACK;
    } catch {
      source = EMPTY_PLAYBACK;
    }
    if (source === playbackSnapshotCacheRef.current.source) return playbackSnapshotCacheRef.current.snapshot;
    let snapshot: TimelinePlaybackSnapshot;
    try {
      snapshot = normalizePlaybackSnapshot(source);
    } catch {
      snapshot = EMPTY_PLAYBACK;
    }
    if (samePlaybackSnapshot(playbackSnapshotCacheRef.current.snapshot, snapshot)) {
      playbackSnapshotCacheRef.current = { source, snapshot: playbackSnapshotCacheRef.current.snapshot };
      return playbackSnapshotCacheRef.current.snapshot;
    }
    playbackSnapshotCacheRef.current = { source, snapshot };
    return snapshot;
  }, [playbackController]);
  const playbackSnapshot = useSyncExternalStore(
    useCallback((listener) => playbackController?.subscribe(listener) ?? (() => undefined), [playbackController]),
    readPlaybackSnapshot,
    readPlaybackSnapshot,
  );
  const range = useMemo(() => safeRange(dataSource), [dataSource, revision]);
  const duration = Math.max(0, range.end - range.start);
  const [displayMode, setDisplayMode] = useState<"frames" | "seconds">(initialDisplayMode);
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT);
  const pixelsPerSecond = pixelsPerSecondFromZoom(zoomPercent);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState<CanvasViewport>({ width: 0, height: 0 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(safeDevicePixelRatio);
  const [localTime, setLocalTime] = useState(range.start);
  const [scrubbing, setScrubbing] = useState(false);
  const scrubOriginRef = useRef(range.start);
  const scrubPreviewRef = useRef(range.start);
  const pointerIdRef = useRef<number | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const treeViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLButtonElement>(null);
  const [selectedTarget, setSelectedTarget] = useState<TimelinePlaybackTarget | null>(null);

  useEffect(() => {
    setLocalTime((time) => clampTimelineTime(time, range.end));
  }, [range.end]);

  useEffect(() => {
    setDisplayMode(initialDisplayMode);
  }, [initialDisplayMode]);

  useEffect(() => {
    const element = timelineViewportRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setDevicePixelRatio(safeDevicePixelRatio());
    window.addEventListener("resize", update);
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia(`(resolution: ${safeDevicePixelRatio()}dppx)`)
      : undefined;
    media?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      media?.removeEventListener?.("change", update);
    };
  }, []);

  const time = playbackController && playbackSnapshot.available ? playbackSnapshot.time : localTime;
  const canTransport = Boolean(playbackController && playbackSnapshot.available);
  const rowCountValue = dataSource.getRowCount();
  const rowCount = Number.isFinite(rowCountValue) ? Math.max(0, Math.floor(rowCountValue)) : 0;
  const rowQuery = visibleTimelineRowQuery(rowCount, scroll.top, viewport.height);
  const rows = useMemo(
    () => dataSource.getRows(rowQuery),
    [dataSource, revision, rowQuery.start, rowQuery.count],
  );
  const totalHeight = rowCount * TIMELINE_ROW_HEIGHT;
  const totalWidth = Math.max(viewport.width, duration * pixelsPerSecond);
  const visibleTimeRange = {
    start: Math.max(range.start, range.start + scroll.left / pixelsPerSecond),
    end: Math.min(range.end, range.start + (scroll.left + viewport.width) / pixelsPerSecond),
  };
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const visibleQuery = useMemo(() => ({ rowIds, range: visibleTimeRange }), [rowIds, visibleTimeRange.start, visibleTimeRange.end]);
  const rowTargets = useMemo(() => {
    const targets = new Map<string, TimelinePlaybackTarget>();
    for (const row of rows) {
      const target = dataSource.getPlaybackTarget?.(row.id);
      if (target) targets.set(row.id, target);
    }
    return targets;
  }, [dataSource, revision, rows]);
  const commandTarget = resolveTimelinePlaybackTarget(selectedTarget, playbackSnapshot);

  const updateReadout = useCallback((nextTime: number) => {
    if (readoutRef.current) {
      readoutRef.current.textContent = variant === "compact"
        ? formatCompactTimelineReadout(nextTime - range.start, duration, displayMode, fps)
        : formatTimelineReadout(nextTime - range.start, duration, displayMode, fps);
    }
  }, [displayMode, duration, fps, range.start, variant]);

  const updatePlayhead = useCallback((nextTime: number) => {
    const x = (nextTime - range.start) * pixelsPerSecond - scroll.left;
    if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${x}px,0,0)`;
    updateReadout(nextTime);
  }, [pixelsPerSecond, range.start, scroll.left, updateReadout]);

  useEffect(() => updatePlayhead(time), [time, updatePlayhead]);

  useEffect(() => {
    if (!playbackController || !playbackSnapshot.available || !playbackSnapshot.playing || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    const tick = () => {
      updatePlayhead(projectTimelinePlaybackTime(playbackSnapshot));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playbackController, playbackSnapshot, updatePlayhead]);

  const seekFromClientX = useCallback((clientX: number) => {
    const element = timelineViewportRef.current;
    if (!element) return;
    const next = resolveTimelineSeekTime(
      range.start + (clientX - element.getBoundingClientRect().left + element.scrollLeft) / pixelsPerSecond,
      range.end,
      "unsnapped",
      fps,
    );
    scrubPreviewRef.current = next;
    updatePlayhead(next);
  }, [fps, pixelsPerSecond, range.end, range.start, updatePlayhead]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerIdRef.current = event.pointerId;
    scrubOriginRef.current = time;
    scrubPreviewRef.current = time;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    seekFromClientX(event.clientX);
  }, [seekFromClientX, time]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    seekFromClientX(event.clientX);
  }, [seekFromClientX]);

  const finishScrub = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (cancelled) {
      const origin = scrubOriginRef.current;
      scrubPreviewRef.current = origin;
      updatePlayhead(origin);
      if (playbackController && playbackSnapshot.available) dispatchSafely(playbackController, { type: "seek", time: origin, target: commandTarget }, onDiagnostic);
      else setLocalTime(origin);
    } else if (playbackController && playbackSnapshot.available) {
      dispatchSafely(playbackController, { type: "seek", time: scrubPreviewRef.current, target: commandTarget }, onDiagnostic);
    } else if (!playbackController) {
      setLocalTime(scrubPreviewRef.current);
    }
    pointerIdRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [commandTarget, onDiagnostic, playbackController, playbackSnapshot.available, updatePlayhead]);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScroll({ left: element.scrollLeft, top: element.scrollTop });
    if (treeViewportRef.current && Math.abs(treeViewportRef.current.scrollTop - element.scrollTop) > 1) {
      treeViewportRef.current.scrollTop = element.scrollTop;
    }
  }, []);

  const onTreeScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (timelineViewportRef.current && Math.abs(timelineViewportRef.current.scrollTop - element.scrollTop) > 1) {
      timelineViewportRef.current.scrollTop = element.scrollTop;
    }
    setScroll((current) => ({ ...current, top: element.scrollTop }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return;
    const startedAt = performance.now();
    const dpr = devicePixelRatio;
    canvas.width = Math.max(1, Math.round(viewport.width * dpr));
    canvas.height = Math.max(1, Math.round(viewport.height * dpr));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.save();
    context.translate(-scroll.left, -scroll.top);
    const firstRow = rowQuery.start;
    const lastRow = rowQuery.start + rows.length;
    const rowIndexById = new Map(rows.map((row, index) => [row.id, rowQuery.start + index]));
    for (let index = firstRow; index < lastRow; index += 1) {
      const row = rows[index - rowQuery.start];
      if (!row) continue;
      const y = index * TIMELINE_ROW_HEIGHT;
      context.fillStyle = row.kind === "group" ? "#22242d" : index % 2 === 0 ? "#1c1e25" : "#191b21";
      context.fillRect(scroll.left, y, viewport.width, TIMELINE_ROW_HEIGHT);
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.beginPath();
      context.moveTo(scroll.left, y + TIMELINE_ROW_HEIGHT - .5);
      context.lineTo(scroll.left + viewport.width, y + TIMELINE_ROW_HEIGHT - .5);
      context.stroke();
    }
    const gridStep = pixelsPerSecond >= 40 ? .5 : pixelsPerSecond >= 15 ? 1 : 5;
    const firstGrid = Math.max(range.start, Math.floor(visibleTimeRange.start / gridStep) * gridStep);
    const lastGrid = Math.min(range.end, visibleTimeRange.end);
    const transform = createViewTransform(range.start, pixelsPerSecond);
    for (let gridTime = firstGrid; gridTime <= lastGrid + gridStep * .001; gridTime += gridStep) {
      const x = transform.timeToX(gridTime);
      context.strokeStyle = Number.isInteger(gridTime) ? "rgba(255,255,255,.105)" : "rgba(255,255,255,.045)";
      context.beginPath();
      context.moveTo(x, scroll.top);
      context.lineTo(x, scroll.top + viewport.height);
      context.stroke();
    }
    const items = dataSource.getItems(visibleQuery);
    const keys = dataSource.getKeys(visibleQuery);
    const columns = dataSource.getKeyColumns?.(visibleQuery, pixelsPerSecond) ?? [];
    const clippedRows = new Set(rowIds);
    for (const item of items) {
      const rowIndex = rowIndexById.get(item.rowId);
      if (rowIndex != null && clippedRows.has(item.rowId)) drawItem(context, item, rowIndex, transform.timeToX);
    }
    if (columns.length > 0) {
      for (const column of columns) {
        const rowIndex = rowIndexById.get(column.rowId);
        if (rowIndex != null) drawKeyColumn(context, column, rowIndex, transform.timeToX);
      }
    } else {
      for (const key of keys) {
        const rowIndex = rowIndexById.get(key.rowId);
        if (rowIndex != null) drawKey(context, key, rowIndex, transform.timeToX);
      }
    }
    context.restore();
    onPerformanceSummary?.({
      source: "timeline-canvas",
      paintMs: performance.now() - startedAt,
      rowsPainted: rows.length,
      itemsPainted: items.length,
      keysPainted: columns.length > 0 ? columns.length : keys.length,
      devicePixelRatio: dpr,
    });
  }, [dataSource, devicePixelRatio, pixelsPerSecond, range.end, range.start, revision, rowIds, rowQuery.start, rows, scroll.left, scroll.top, visibleQuery, viewport.height, viewport.width, onPerformanceSummary, visibleTimeRange.start, visibleTimeRange.end]);

  const ticks = visibleTimelineTicks(
    range.end - range.start,
    scroll.left,
    viewport.width,
    pixelsPerSecond,
    pixelsPerSecond >= 40 ? .5 : pixelsPerSecond >= 15 ? 1 : 5,
  );
  const playbackReadout = variant === "compact"
    ? formatCompactTimelineReadout(time - range.start, duration, displayMode, fps)
    : formatTimelineReadout(time - range.start, duration, displayMode, fps);
  const rootClassName = ["timeline-editor", `timeline-editor--${variant}`, scrubbing ? "is-scrubbing" : "", className ?? ""].filter(Boolean).join(" ");

  type UntargetedPlaybackCommand =
    | { type: "play" }
    | { type: "pause" }
    | { type: "seek"; time: number }
    | { type: "setLooping"; looping: boolean };
  const dispatchTransport = (command: UntargetedPlaybackCommand) => {
    dispatchSafely(playbackController, { ...command, target: commandTarget } as TimelinePlaybackCommand, onDiagnostic);
  };

  return (
    <section className={rootClassName} aria-label="Timeline editor">
      <header className="timeline-editor__header">
        <div className="timeline-editor__tabs">
          <span className="timeline-editor__tab timeline-editor__tab--active">Timeline</span>
        </div>
        <div className="timeline-editor__toolbar">
          <div className="timeline-editor__slot">{slots?.toolbarStart}</div>
          <div className="timeline-editor__transport" role="group" aria-label="Playback controls">
            <button type="button" className="timeline-editor__button" disabled={!canTransport} aria-label="Play" onClick={() => dispatchTransport({ type: "play" })}>▶</button>
            <button type="button" className="timeline-editor__button" disabled={!canTransport} aria-label="Pause" onClick={() => dispatchTransport({ type: "pause" })}>▮▮</button>
            <button type="button" className={`timeline-editor__button${playbackSnapshot.looping ? " is-active" : ""}`} disabled={!canTransport} aria-label="Loop" onClick={() => dispatchTransport({ type: "setLooping", looping: !playbackSnapshot.looping })}>↻</button>
          </div>
          <button ref={readoutRef} type="button" className="timeline-editor__readout" onClick={() => setDisplayMode((mode) => mode === "frames" ? "seconds" : "frames")} aria-label="Toggle time display">{playbackReadout}</button>
          <label className="timeline-editor__zoom">Zoom
            <input type="range" min="0" max="100" value={zoomPercent} onChange={(event) => setZoomPercent(Number(event.target.value))} aria-label="Timeline zoom" />
          </label>
          <span className="timeline-editor__fps">{fps} fps</span>
          <div className="timeline-editor__slot timeline-editor__slot--end">{slots?.toolbarEnd}</div>
        </div>
      </header>
      <div className="timeline-editor__body">
        <div className="timeline-editor__tree-heading">TRACKS</div>
        <div className="timeline-editor__ruler" aria-hidden="true">
          {ticks.map((tick) => <span className="timeline-editor__tick" key={tick} style={{ left: `${(tick * pixelsPerSecond) - scroll.left}px` }}>{formatTimelineTick(tick + range.start, displayMode, fps)}</span>)}
        </div>
        <div className="timeline-editor__tree-viewport" ref={treeViewportRef} onScroll={onTreeScroll}>
          <div className="timeline-editor__tree-content" style={{ height: totalHeight }}>
            {rows.map((row, index) => {
              const target = rowTargets.get(row.id);
              return <TimelineRowView key={row.id} row={row} index={rowQuery.start + index} target={target} selected={Boolean(target && timelinePlaybackTargetEquals(target, selectedTarget))} onSelect={setSelectedTarget} />;
            })}
            {rowCount === 0 && <div className="timeline-editor__empty">{slots?.emptyState ?? "No timeline tracks"}</div>}
          </div>
        </div>
        <div
          className="timeline-editor__viewport"
          ref={timelineViewportRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishScrub(event, false)}
          onPointerCancel={(event) => finishScrub(event, true)}
          onPointerLeave={(event) => { if (pointerIdRef.current === event.pointerId && !event.currentTarget.hasPointerCapture(event.pointerId)) finishScrub(event, true); }}
        >
          <div className="timeline-editor__content" style={{ width: totalWidth, height: totalHeight }} />
          <canvas className="timeline-editor__canvas" ref={canvasRef} />
          <div className="timeline-editor__playhead" ref={playheadRef} />
          <div className="timeline-editor__range-action">{slots?.diagnosticAction}</div>
        </div>
      </div>
    </section>
  );
}

function TimelineRowView({
  row,
  index,
  target,
  selected,
  onSelect,
}: {
  row: TimelineRow;
  index: number;
  target?: TimelinePlaybackTarget;
  selected: boolean;
  onSelect: (target: TimelinePlaybackTarget) => void;
}): ReactElement {
  const targetProps = target ? {
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": selected,
    "aria-label": `Select playback target ${row.label}`,
    onClick: () => onSelect(target),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(target);
      }
    },
  } : {};
  return (
    <div className={`timeline-editor__row timeline-editor__row--${row.kind}${target ? " timeline-editor__row--target" : ""}${selected ? " is-target-selected" : ""}`} style={{ transform: `translateY(${index * TIMELINE_ROW_HEIGHT}px)` }} {...targetProps}>
      <span className="timeline-editor__row-color" style={{ backgroundColor: row.color ?? "#6c7284" }} />
      <span className="timeline-editor__row-disclosure">{row.kind === "group" ? "▾" : ""}</span>
      <span className="timeline-editor__row-label" style={{ paddingLeft: `${Math.max(0, row.depth) * 10}px` }}>{row.label}</span>
      {row.bindingId && <span className="timeline-editor__row-binding">{String(row.bindingId).replace(/^binding-/, "")}</span>}
      {row.muted && <span className="timeline-editor__row-state">M</span>}
      {row.locked && <span className="timeline-editor__row-state">L</span>}
    </div>
  );
}

export type { TimelineDataSource, TimelinePlaybackController, TimelinePlaybackSnapshot };
