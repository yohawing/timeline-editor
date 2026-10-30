import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  clampTimelineLoopRange,
  clampTimelineTime,
  createViewTransform,
  formatCompactTimelineReadout,
  formatTimelineReadout,
  formatTimelineTick,
  normalizeFrameRate,
  resolveTimelineSeekTime,
  visibleTimelineTicks,
  timelineRulerStep,
  type TimeRange,
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
import {
  clampPixelsPerSecond,
  clampRowZoom,
  fitPixelsPerSecond,
  panViewByFraction,
  timelineGridSteps,
  viewRangeFromThumb,
  viewRangeThumb,
  wheelRowZoomFactor,
  wheelZoomFactor,
  zoomAroundAnchor,
  type ViewRange,
  type ViewRangeThumb,
} from "../core/viewRange";
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
import { PlaybackRangeHandles } from "./PlaybackRangeHandles";
import { useMiddlePan } from "./useMiddlePan";
import { RowLabel } from "./RowLabel";
import { TrackDivider } from "./TrackDivider";
import { EventCue, type TimelineEventEditing } from "./EventCue";
export type { TimelineEventEditing } from "./EventCue";
import { useClipEditing, type TimelineEditing } from "./clipEditing";
export type { TimelineEditing } from "./clipEditing";
import {
  NavigateBeforeIcon,
  NavigateNextIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipNextIcon,
  SkipPreviousIcon,
} from "./icons";

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
  /** Optional host-owned properties panel, laid out inside the editor. */
  inspector?: ReactNode;
  tracksHeaderEnd?: ReactNode;
  /** Host-owned controls for each visible row. */
  rowActions?: (row: TimelineRow) => ReactNode;
  /** Optional host-owned track type icon before the row label. */
  rowIcon?: (row: TimelineRow) => ReactNode;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  emptyState?: ReactNode;
  diagnosticAction?: ReactNode;
}

export interface TimelineViewState {
  /** Expanded browsing bounds, separate from project/playback data. */
  viewExtent?: TimeRange | null;
  treeWidth: number | null;
  pixelsPerSecond: number | null;
  rowZoom: number;
  snap: boolean;
  displayMode: "frames" | "seconds";
}

export interface TimelineEditorProps {
  /** Commit a playback-boundary gesture; the host owns transport, persistence and undo. */
  onChangePlaybackRange?: (range: TimeRange) => void;
  /** Initial view preferences; persistence remains owned by the host. */
  initialViewState?: Partial<TimelineViewState>;
  onViewStateChange?: (state: TimelineViewState) => void;
  dataSource: TimelineDataSource;
  editing?: TimelineEditing;
  eventEditing?: TimelineEventEditing;
  /** Request insertion beside a row; the host owns hierarchy, order and undo. */
  onReorderRow?: (rowId: TimelineRow["id"], targetRowId: TimelineRow["id"], position: "before" | "after") => void;
  onMoveRow?: (rowId: TimelineRow["id"], parentId: TimelineRow["id"] | null) => void;
  onToggleRow?: (rowId: TimelineRow["id"]) => void;
  onRenameRow?: (rowId: TimelineRow["id"], label: string) => void;
  playbackController?: TimelinePlaybackController;
  frameRate?: number;
  displayMode?: "frames" | "seconds";
  variant?: "compact" | "full";
  /**
   * Whether TimelineEditor renders its own "Timeline" title strip. Defaults to
   * true (current behavior). Set false when a host already provides an
   * equivalent tab/heading (e.g. a docking layout) to avoid a duplicate title.
   */
  showTitle?: boolean;
  /**
   * Frame-rate picker in the toolbar, replacing the read-only "N fps" label.
   * Fully controlled: the host lists the choices, names the current one
   * (`frameRateValue`) and receives the pick. Values are opaque strings so a
   * host can offer entries like "auto" next to numbers; `frameRate` itself
   * stays the number used for display/snapping. Omit `frameRateOptions` to
   * keep the read-only label.
   */
  frameRateOptions?: ReadonlyArray<{ value: string; label: string }>;
  frameRateValue?: string;
  onFrameRateChange?: (value: string) => void;
  className?: string;
  onDiagnostic?: (diagnostic: TimelineDiagnostic) => void;
  onPerformanceSummary?: (summary: TimelinePerformanceSummary) => void;
  slots?: TimelineEditorSlots;
}

interface CanvasViewport {
  width: number;
  height: number;
}

const EMPTY_PLAYBACK: TimelinePlaybackSnapshot = {
  available: false,
  time: 0,
  duration: 0,
  playing: false,
  looping: false,
  loopRange: null,
};

const TIMELINE_RATE_STEPS = [0.25, 0.5, 1, 2] as const;

function nextTimelineRate(rate: number): number {
  const index = TIMELINE_RATE_STEPS.indexOf(rate as (typeof TIMELINE_RATE_STEPS)[number]);
  const fallback = TIMELINE_RATE_STEPS.indexOf(1);
  return TIMELINE_RATE_STEPS[(index === -1 ? fallback : index + 1) % TIMELINE_RATE_STEPS.length];
}

function formatTimelineRate(rate: number): string {
  return `${rate}x`;
}

function safeRange(dataSource: TimelineDataSource): { start: number; end: number } {
  const range = dataSource.getRange();
  const start = Number.isFinite(range.start) ? range.start : 0;
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

function isFiniteTimeRange(value: unknown): value is TimeRange {
  if (!value || typeof value !== "object") return false;
  const range = value as { start?: unknown; end?: unknown };
  return typeof range.start === "number" && Number.isFinite(range.start) &&
    typeof range.end === "number" && Number.isFinite(range.end);
}

/** Keep malformed host snapshots away from layout, Canvas, and transport controls. */
function normalizePlaybackSnapshot(value: unknown): TimelinePlaybackSnapshot {
  if (!value || typeof value !== "object") return EMPTY_PLAYBACK;
  const raw = value as Partial<Record<keyof TimelinePlaybackSnapshot, unknown>>;
  const durationIsValid = typeof raw.duration === "number" && Number.isFinite(raw.duration) && raw.duration >= 0;
  const timeIsValid = typeof raw.time === "number" && Number.isFinite(raw.time);
  const targetIsValid = raw.target === undefined || raw.target === null || isPlaybackTarget(raw.target);
  const available = raw.available === true && durationIsValid && timeIsValid && targetIsValid;
  const duration = durationIsValid ? raw.duration as number : 0;
  const range = isFiniteTimeRange(raw.range) && raw.range.start <= raw.range.end ? raw.range : { start: 0, end: duration };
  const time = available ? clampTimelineTime(raw.time as number, range) : 0;
  const sampledAtUnixMs = typeof raw.sampledAtUnixMs === "number" && Number.isFinite(raw.sampledAtUnixMs) && raw.sampledAtUnixMs >= 0
    ? raw.sampledAtUnixMs
    : undefined;
  const rate = available && typeof raw.rate === "number" && Number.isFinite(raw.rate) && raw.rate > 0
    ? raw.rate
    : undefined;
  const loopRange = available && isFiniteTimeRange(raw.loopRange) ? clampTimelineLoopRange(raw.loopRange, range) : null;
  return {
    available,
    time,
    duration: available ? range.end - range.start : 0,
    range,
    playing: available && raw.playing === true,
    looping: available && raw.looping === true,
    loopRange,
    target: available && isPlaybackTarget(raw.target) ? raw.target : null,
    ...(sampledAtUnixMs === undefined ? {} : { sampledAtUnixMs }),
    ...(rate === undefined ? {} : { rate }),
  };
}

function samePlaybackSnapshot(left: TimelinePlaybackSnapshot, right: TimelinePlaybackSnapshot): boolean {
  return left.available === right.available &&
    left.time === right.time &&
    left.duration === right.duration &&
    left.range?.start === right.range?.start && left.range?.end === right.range?.end &&
    left.playing === right.playing &&
    left.looping === right.looping &&
    (left.rate ?? 1) === (right.rate ?? 1) &&
    (left.loopRange?.start ?? null) === (right.loopRange?.start ?? null) &&
    (left.loopRange?.end ?? null) === (right.loopRange?.end ?? null) &&
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
  rowHeight: number,
  visibleRange: TimeRange,
): void {
  const rowY = rowIndex * rowHeight;
  // Every pixel constant below was drawn for the 26px design row; scale them
  // with the *rendered* row height (host UI scale, Ctrl+wheel row zoom) so
  // the clip band and the DOM row strip keep the same proportions.
  const s = rowHeight / TIMELINE_ROW_HEIGHT;
  if (item.kind === "clip") {
    context.save();
    const opacity = item.disabled ? 0.4 : 1;
    const x = timeToX(item.range.start);
    const width = Math.max(3, timeToX(item.range.end) - x);
    roundedRect(context, x + 1, rowY + 4 * s, width - 2, 18 * s, 3 * s);
    context.globalAlpha = 0.82 * opacity;
    context.fillStyle = item.color;
    context.fill();
    context.globalAlpha = opacity;
    context.strokeStyle = item.selected ? "#f1f3ff" : "rgba(255,255,255,.16)";
    context.lineWidth = item.selected ? 1.5 : 1;
    context.stroke();
    context.save();
    context.beginPath();
    context.rect(x + 7 * s, rowY + 4 * s, Math.max(0, width - 14 * s), 18 * s);
    context.clip();
    context.fillStyle = "rgba(255,255,255,.9)";
    context.font = `500 ${10 * s}px Inter, Segoe UI, sans-serif`;
    context.textBaseline = "middle";
    context.fillText(item.label, x + 8 * s, rowY + 13 * s);
    context.restore();
    const period = item.sourceDuration ?? (item.range.end - item.range.start);
    if (item.loop && period > 0 && timeToX(period) - timeToX(0) >= 6) {
      const offset = item.sourceOffset ?? 0;
      const first = Math.max(1, Math.ceil((offset + Math.max(0, visibleRange.start - item.range.start)) / period));
      const last = Math.floor((offset + Math.min(item.range.end, visibleRange.end) - item.range.start) / period);
      context.strokeStyle = "rgba(255,255,255,.75)";
      for (let cycle = first; cycle <= last; cycle++) {
        const time = item.range.start + cycle * period - offset;
        if (time <= item.range.start || time >= item.range.end) continue;
        const boundary = timeToX(time);
        context.beginPath(); context.moveTo(boundary, rowY + 4 * s); context.lineTo(boundary, rowY + 22 * s); context.stroke();
      }
    }
    context.restore();
    return;
  }

  context.save();
  context.globalAlpha = item.disabled ? 0.4 : 1;
  const x = timeToX(item.time);
  context.fillStyle = item.color;
  if (item.kind === "marker") {
    context.fillRect(x, rowY + 7 * s, 1, 15 * s);
    context.beginPath();
    context.moveTo(x - 5 * s, rowY + 5 * s);
    context.lineTo(x + 5 * s, rowY + 5 * s);
    context.lineTo(x, rowY + 11 * s);
    context.closePath();
    context.fill();
  } else if (item.kind === "event-cue") {
    context.beginPath();
    context.moveTo(x, rowY + 13 * s - 4);
    context.lineTo(x + 4, rowY + 13 * s);
    context.lineTo(x, rowY + 13 * s + 4);
    context.lineTo(x - 4, rowY + 13 * s);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(x, rowY + 13 * s, 5 * s, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = "rgba(238,238,244,.78)";
  context.font = `500 ${9 * s}px Inter, Segoe UI, sans-serif`;
  context.textBaseline = "middle";
  if (item.kind !== "event-cue") context.fillText(item.label, x + 9 * s, rowY + 13 * s);
  context.restore();
}

function drawKey(
  context: CanvasRenderingContext2D,
  key: TimelineKey,
  rowIndex: number,
  timeToX: (time: number) => number,
  rowHeight: number,
): void {
  const s = rowHeight / TIMELINE_ROW_HEIGHT;
  const x = timeToX(key.time);
  const y = rowIndex * rowHeight + 19 * s;
  const radius = (key.selected ? 4.5 : 3.5) * s;
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
  rowHeight: number,
): void {
  if (column.count <= 1) {
    drawKey(context, {
      kind: "key",
      id: `aggregate:${column.channelId}:${column.time}` as TimelineKey["id"],
      rowId: column.rowId,
      channelId: column.channelId,
      time: column.time,
    }, rowIndex, timeToX, rowHeight);
    return;
  }
  const x = Math.round(timeToX(column.time)) + 0.5;
  const y = rowIndex * rowHeight + 13;
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
  editing,
  eventEditing,
  onRenameRow,
  onChangePlaybackRange,
  onMoveRow,
  onReorderRow,
  onToggleRow,
  initialViewState,
  onViewStateChange,
  playbackController,
  frameRate = 24,
  displayMode: initialDisplayMode = "frames",
  variant = "full",
  frameRateOptions,
  frameRateValue,
  onFrameRateChange,
  showTitle = true,
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
  const dataRange = useMemo(() => safeRange(dataSource), [dataSource, revision]);
  const [viewExtent, setViewExtent] = useState<TimeRange | null>(() => isFiniteTimeRange(initialViewState?.viewExtent) && initialViewState!.viewExtent!.end > initialViewState!.viewExtent!.start ? initialViewState!.viewExtent! : null);
  const range = useMemo(() => ({ start: Math.min(dataRange.start, viewExtent?.start ?? dataRange.start), end: Math.max(dataRange.end, viewExtent?.end ?? dataRange.end) }), [dataRange.start, dataRange.end, viewExtent]);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const duration = Math.max(0, range.end - range.start);
  const [playbackRangePreview, setPlaybackRangePreview] = useState<TimeRange | null>(null);
  const playbackRange = playbackSnapshot.available ? (playbackSnapshot.range ?? dataRange) : dataRange;
  const [displayMode, setDisplayMode] = useState<"frames" | "seconds">(initialViewState?.displayMode === "seconds" || initialViewState?.displayMode === "frames" ? initialViewState.displayMode : initialDisplayMode);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState<CanvasViewport>({ width: 0, height: 0 });
  /**
   * Horizontal zoom. `null` = "fit the whole clip to the viewport" — the
   * default, re-applied whenever the clip's range changes (a new clip shows
   * in full, like UE's Sequencer). A number is a user zoom (wheel / range
   * bar). User gestures may expand browsing bounds beyond the data without
   * editing playback bounds. See core/viewRange.ts.
   */
  const [zoomPixelsPerSecond, setZoomPixelsPerSecond] = useState<number | null>(() => Number.isFinite(initialViewState?.pixelsPerSecond) && initialViewState!.pixelsPerSecond! > 0 ? initialViewState!.pixelsPerSecond! : null);
  const pixelsPerSecond = zoomPixelsPerSecond === null
    ? fitPixelsPerSecond(duration, viewport.width)
    : clampPixelsPerSecond(zoomPixelsPerSecond, duration, viewport.width, true);
  /**
   * Vertical zoom (Ctrl+wheel): a multiplier on `--timeline-row-height`,
   * applied as `--timeline-row-zoom` on the root element. The row-height
   * probe below measures the scaled result, so the canvas and the DOM row
   * strip follow it with no further plumbing.
   */
  const [treeWidth, setTreeWidth] = useState<number | null>(() => Number.isFinite(initialViewState?.treeWidth) && initialViewState!.treeWidth! >= 120 ? initialViewState!.treeWidth! : null);
  const [snap, setSnap] = useState(initialViewState?.snap !== false);
  const [rowZoom, setRowZoom] = useState(() => clampRowZoom(initialViewState?.rowZoom ?? 1));
  const viewStateCallback = useRef(onViewStateChange);
  useEffect(() => { viewStateCallback.current = onViewStateChange; }, [onViewStateChange]);
  useEffect(() => { viewStateCallback.current?.({ treeWidth, pixelsPerSecond: zoomPixelsPerSecond, rowZoom, snap, displayMode, viewExtent }); }, [treeWidth, zoomPixelsPerSecond, rowZoom, snap, displayMode, viewExtent]);
  // A scrollLeft to apply after the next commit — set together with a zoom
  // change so the browser clamps it against the NEW content width, not the
  // one still in the DOM at event time.
  const pendingScrollLeftRef = useRef<number | null>(null);
  // The view most recently handed to `applyView` and not yet rendered —
  // several wheel events in one frame must each build on the previous one,
  // not on the state the last render saw.
  const pendingViewRef = useRef<ViewRange | null>(null);
  const rangeBarRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const rangeDragRef = useRef<{ pointerId: number; mode: "pan" | "start" | "end"; originX: number; view: ViewRange; thumb: ViewRangeThumb; range: TimeRange } | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(safeDevicePixelRatio);
  const [localTime, setLocalTime] = useState(range.start);
  const [scrubbing, setScrubbing] = useState(false);
  const [localLoopRange, setLocalLoopRange] = useState<TimeRange | null>(null);
  const [loopDragPreview, setLoopDragPreview] = useState<TimeRange | null>(null);
  const scrubOriginRef = useRef(range.start);
  const scrubPreviewRef = useRef(range.start);
  // Live scrubbing: the controller was playing when the scrub started, so it
  // is paused for the drag and resumed when the pointer is released.
  const scrubWasPlayingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const loopPointerIdRef = useRef<number | null>(null);
  const loopDragOriginRef = useRef(range.start);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const panHandlers = useMiddlePan(timelineViewportRef);
  const treeViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLButtonElement>(null);
  const rowHeightProbeRef = useRef<HTMLDivElement>(null);
  const tickWidthProbeRef = useRef<HTMLSpanElement>(null);
  const [selectedTarget, setSelectedTarget] = useState<TimelinePlaybackTarget | null>(null);
  const [measuredRowHeight, setMeasuredRowHeight] = useState(0);
  const [tickCharacterWidth, setTickCharacterWidth] = useState(6);
  /**
   * `--timeline-row-height` is a rem value, so it tracks a host's root
   * font-size (UI scale). Canvas drawing and the virtualized row transform
   * below work in raw pixels, so they must follow the same *rendered* pixel
   * height rather than the `TIMELINE_ROW_HEIGHT` constant, or rows painted on
   * the canvas would drift out of alignment with the DOM row strip whenever
   * the host scales its UI. `measuredRowHeight` reads that rendered height
   * from an always-mounted, invisible probe box; it falls back to the
   * constant (and stays 0 -> constant in jsdom, where ResizeObserver is
   * stubbed and ResizeObserver never fires) so this has no effect outside a
   * real browser layout.
   */
  const rowHeight = measuredRowHeight > 0 ? measuredRowHeight : TIMELINE_ROW_HEIGHT;

  useEffect(() => {
    setLocalTime((time) => clampTimelineTime(time, playbackRange));
    setLocalLoopRange((loop) => clampTimelineLoopRange(loop, playbackRange));
  }, [playbackRange.start, playbackRange.end]);

  const previousRange = useRef(dataRange);
  const previousDisplayMode = useRef(initialDisplayMode);
  // A different clip (range) -> back to "fit the whole clip".
  useEffect(() => {
    if (previousRange.current.start !== dataRange.start || previousRange.current.end !== dataRange.end) { setZoomPixelsPerSecond(null); setViewExtent(null); }
    previousRange.current = dataRange;
  }, [dataRange.start, dataRange.end]);

  useLayoutEffect(() => {
    pendingViewRef.current = null;
    const pending = pendingScrollLeftRef.current;
    const element = timelineViewportRef.current;
    if (pending === null || !element) return;
    pendingScrollLeftRef.current = null;
    element.scrollLeft = pending;
  });

  useEffect(() => {
    if (previousDisplayMode.current !== initialDisplayMode) setDisplayMode(initialDisplayMode);
    previousDisplayMode.current = initialDisplayMode;
  }, [initialDisplayMode]);

  useEffect(() => {
    const element = rowHeightProbeRef.current;
    const tickProbe = tickWidthProbeRef.current;
    if (!element || !tickProbe) return;
    const update = () => {
      setMeasuredRowHeight(element.getBoundingClientRect().height);
      const width = tickProbe.getBoundingClientRect().width;
      if (width > 0) setTickCharacterWidth(width / 8);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(tickProbe);
    return () => observer.disconnect();
  }, []);

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
  const rowQuery = visibleTimelineRowQuery(rowCount, scroll.top, viewport.height, rowHeight);
  const rows = useMemo(
    () => dataSource.getRows(rowQuery),
    [dataSource, revision, rowQuery.start, rowQuery.count],
  );
  const totalHeight = rowCount * rowHeight;
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
  const clipEditing = useClipEditing({ editing, dataSource, viewport: timelineViewportRef, scale: pixelsPerSecond, rowHeight, range, fps, displayMode, snap, scrollLeft: scroll.left, width: viewport.width });
  const editableClips = editing ? dataSource.getItems(visibleQuery).filter(item => item.kind === "clip" && editing.canEditClip(item)) : [];
  const commandTarget = resolveTimelinePlaybackTarget(selectedTarget, playbackSnapshot);
  const loopRange = canTransport ? (playbackSnapshot.loopRange ?? null) : localLoopRange;

  const updateReadout = useCallback((nextTime: number) => {
    if (readoutRef.current) {
      readoutRef.current.textContent = variant === "compact"
        ? formatCompactTimelineReadout(nextTime, playbackRange, displayMode, fps)
        : formatTimelineReadout(nextTime, playbackRange, displayMode, fps);
    }
  }, [displayMode, fps, playbackRange.start, playbackRange.end, variant]);

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
      playbackRange,
      "frame-snap",
      fps,
    );
    scrubPreviewRef.current = next;
    updatePlayhead(next);
    // Live scrub: every pointer sample seeks the controller so the host
    // (a 3D viewport, an audio engine) follows the drag, not just the
    // playhead line. Without a controller the local time is only committed
    // on release (a state update per move would re-render the whole editor).
    if (playbackController && playbackSnapshot.available) {
      dispatchSafely(playbackController, { type: "seek", time: next, target: commandTarget }, onDiagnostic);
    }
  }, [commandTarget, fps, onDiagnostic, pixelsPerSecond, playbackController, playbackSnapshot.available, range.start, playbackRange, updatePlayhead]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    timelineViewportRef.current?.focus();
    pointerIdRef.current = event.pointerId;
    scrubOriginRef.current = time;
    scrubPreviewRef.current = time;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    scrubWasPlayingRef.current = Boolean(playbackController && playbackSnapshot.available && playbackSnapshot.playing);
    if (scrubWasPlayingRef.current && playbackController) {
      dispatchSafely(playbackController, { type: "pause", target: commandTarget }, onDiagnostic);
    }
    seekFromClientX(event.clientX);
  }, [commandTarget, onDiagnostic, playbackController, playbackSnapshot.available, playbackSnapshot.playing, seekFromClientX, time]);

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
    if (scrubWasPlayingRef.current && playbackController && playbackSnapshot.available) {
      dispatchSafely(playbackController, { type: "play", target: commandTarget }, onDiagnostic);
    }
    scrubWasPlayingRef.current = false;
    pointerIdRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, [commandTarget, onDiagnostic, playbackController, playbackSnapshot.available, updatePlayhead]);

  /** Seek transport (skip-to-start/end, frame step) shares scrub's dispatch-or-local-set split. */
  const seekTo = useCallback((nextTime: number) => {
    const clamped = resolveTimelineSeekTime(nextTime, playbackRange, "frame-snap", fps);
    if (playbackController && playbackSnapshot.available) {
      dispatchSafely(playbackController, { type: "seek", time: clamped, target: commandTarget }, onDiagnostic);
    } else if (!playbackController) {
      setLocalTime(clamped);
    }
  }, [commandTarget, fps, onDiagnostic, playbackController, playbackSnapshot.available, playbackRange]);

  const stepFrame = useCallback((direction: -1 | 1) => {
    const stepped = resolveTimelineSeekTime(time + direction / fps, playbackRange, "frame-snap", fps);
    seekTo(stepped);
  }, [fps, playbackRange, seekTo, time]);

  /**
   * ArrowLeft/ArrowRight step the playhead one frame while the timeline has
   * focus. Bound only to the track viewport (not window/document), so typing
   * arrow keys in an unrelated input elsewhere in the host app is untouched.
   */
  const onViewportKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".timeline-editor__event-cue") && (event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      clipEditing.onKeyDown(event);
      return;
    }
    if (target.closest(".timeline-editor__inspector") || target.isContentEditable || target.closest("input, textarea, select, button") || event.defaultPrevented) return;
    if (clipEditing.onKeyDown(event)) return;
    if (duration <= 0 || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    const transport = (type: "play" | "pause") => dispatchSafely(playbackController, { type, target: commandTarget }, onDiagnostic);
    if (event.ctrlKey && key !== "arrowup") return;
    if (key === " ") { if (!event.repeat) transport(playbackSnapshot.playing ? "pause" : "play"); }
    else if (key === "arrowdown") transport("play");
    else if (key === "k") transport("pause");
    else if (key === "arrowup") seekTo(event.ctrlKey ? playbackRange.end : playbackRange.start);
    else if (key === "arrowleft" && !event.ctrlKey) stepFrame(-1);
    else if (key === "arrowright" && !event.ctrlKey) stepFrame(1);
    else if (key === "home") { setViewExtent(null); setZoomPixelsPerSecond(null); if (timelineViewportRef.current) timelineViewportRef.current.scrollLeft = 0; }
    else return;
    event.preventDefault();
  };

  const dispatchLoopRange = useCallback((next: TimeRange | null) => {
    if (playbackController && playbackSnapshot.available) {
      dispatchSafely(playbackController, { type: "setLoopRange", range: next, target: commandTarget }, onDiagnostic);
    } else if (!playbackController) {
      setLocalLoopRange(clampTimelineLoopRange(next, playbackRange));
    }
  }, [commandTarget, playbackRange, onDiagnostic, playbackController, playbackSnapshot.available]);

  const loopTimeFromClientX = useCallback((clientX: number) => {
    const element = timelineViewportRef.current;
    if (!element) return playbackRange.start;
    return resolveTimelineSeekTime(
      range.start + (clientX - element.getBoundingClientRect().left + element.scrollLeft) / pixelsPerSecond,
      playbackRange,
      "frame-snap",
      fps,
    );
  }, [fps, pixelsPerSecond, range.start, playbackRange]);

  const onLoopLanePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    loopPointerIdRef.current = event.pointerId;
    const origin = loopTimeFromClientX(event.clientX);
    loopDragOriginRef.current = origin;
    event.currentTarget.setPointerCapture(event.pointerId);
    setLoopDragPreview({ start: origin, end: origin });
  }, [loopTimeFromClientX]);

  const onLoopLanePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (loopPointerIdRef.current !== event.pointerId) return;
    const current = loopTimeFromClientX(event.clientX);
    const origin = loopDragOriginRef.current;
    setLoopDragPreview({ start: Math.min(origin, current), end: Math.max(origin, current) });
  }, [loopTimeFromClientX]);

  const finishLoopDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (loopPointerIdRef.current !== event.pointerId) return;
    loopPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setLoopDragPreview((preview) => {
      if (preview) dispatchLoopRange(clampTimelineLoopRange(preview, playbackRange));
      return null;
    });
  }, [dispatchLoopRange, playbackRange]);

  const clearLoopRange = useCallback((event: { stopPropagation(): void }) => {
    event.stopPropagation();
    dispatchLoopRange(null);
  }, [dispatchLoopRange]);

  /**
   * Sets zoom and horizontal scroll together. `scroll.left` is updated in the
   * same render (so the canvas, ticks and playhead already agree with the
   * new zoom), and the DOM scrollLeft is applied after commit (see
   * `pendingScrollLeftRef`); the resulting scroll event then re-reads the
   * same value.
   */
  const applyView = useCallback((desired: ViewRange) => {
    const current = rangeRef.current;
    const width = timelineViewportRef.current?.clientWidth ?? 0;
    const start = Math.min(current.start, current.start + desired.scrollLeft / desired.pixelsPerSecond);
    const end = Math.max(current.end, current.start + (desired.scrollLeft + width) / desired.pixelsPerSecond);
    const next = { ...desired, scrollLeft: desired.scrollLeft + (current.start - start) * desired.pixelsPerSecond };
    rangeRef.current = { start, end };
    setViewExtent({ start, end });
    pendingViewRef.current = next;
    setZoomPixelsPerSecond(next.pixelsPerSecond);
    pendingScrollLeftRef.current = next.scrollLeft;
    setScroll((current) => (current.left === next.scrollLeft ? current : { ...current, left: next.scrollLeft }));
  }, []);

  const viewRef = useRef<{ pixelsPerSecond: number; duration: number; width: number }>({ pixelsPerSecond, duration, width: viewport.width });
  viewRef.current = { pixelsPerSecond, duration, width: viewport.width };

  /**
   * Wheel over the ruler or the track viewport (UE Sequencer conventions):
   *   wheel        -> zoom the time axis around the pointer
   *   Ctrl+wheel   -> zoom row height (vertical)
   *   Shift+wheel  -> pan horizontally (a trackpad's horizontal delta pans too)
   * Native listener (not React's onWheel) so the default page/viewport
   * scroll can be prevented — React registers wheel as passive.
   */
  useEffect(() => {
    const viewportElement = timelineViewportRef.current;
    if (!viewportElement) return;
    const onWheel = (event: WheelEvent) => {
      if (event.altKey || event.metaKey) return;
      const { duration: clipDuration, width } = viewRef.current;
      const base: ViewRange = pendingViewRef.current ?? { pixelsPerSecond: viewRef.current.pixelsPerSecond, scrollLeft: viewportElement.scrollLeft };
      const pps = base.pixelsPerSecond;
      if (event.ctrlKey) {
        event.preventDefault();
        setRowZoom((zoom) => clampRowZoom(zoom * wheelRowZoomFactor(event.deltaY, event.deltaMode)));
        return;
      }
      const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (horizontal) {
        event.preventDefault();
        const raw = event.shiftKey ? (event.deltaY || event.deltaX) : event.deltaX;
        const delta = event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * width : raw;
        applyView({ pixelsPerSecond: pps, scrollLeft: base.scrollLeft + delta });
        return;
      }
      if (event.deltaY === 0) return;
      event.preventDefault();
      const anchorX = event.clientX - viewportElement.getBoundingClientRect().left;
      applyView(zoomAroundAnchor(
        base,
        wheelZoomFactor(event.deltaY, event.deltaMode),
        anchorX,
        clipDuration,
        width,
        true,
      ));
    };
    const rulerElement = rulerRef.current;
    viewportElement.addEventListener("wheel", onWheel, { passive: false });
    rulerElement?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewportElement.removeEventListener("wheel", onWheel);
      rulerElement?.removeEventListener("wheel", onWheel);
    };
  }, [applyView]);

  const thumb = viewRangeThumb({ pixelsPerSecond, scrollLeft: scroll.left }, duration, viewport.width);

  const rangeBarFraction = useCallback((clientX: number) => {
    const bar = rangeBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  }, []);

  // Range bar: drag the thumb to pan, drag either handle to zoom that side,
  // click the empty bar to centre the view there, double-click to fit.
  const onRangeBarPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bar = event.currentTarget;
    const { pixelsPerSecond: pps, duration: clipDuration, width } = viewRef.current;
    const view: ViewRange = { pixelsPerSecond: pps, scrollLeft: timelineViewportRef.current?.scrollLeft ?? scroll.left };
    const current = viewRangeThumb(view, clipDuration, width);
    const target = event.target as HTMLElement;
    const mode: "pan" | "start" | "end" = target.classList.contains("timeline-editor__range-handle--start")
      ? "start"
      : target.classList.contains("timeline-editor__range-handle--end")
        ? "end"
        : "pan";
    let startView = view;
    if (mode === "pan" && !target.closest(".timeline-editor__range-thumb")) {
      // Clicked the empty bar: centre the visible window on the click.
      const centre = rangeBarFraction(event.clientX);
      const half = (current.end - current.start) / 2;
      startView = panViewByFraction(view, centre - half - current.start, clipDuration, width);
      applyView(startView);
    }
    rangeDragRef.current = { pointerId: event.pointerId, mode, originX: event.clientX, view: startView, thumb: viewRangeThumb(startView, clipDuration, width), range: { ...rangeRef.current } };
    bar.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [applyView, rangeBarFraction, scroll.left]);

  const onRangeBarPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = rangeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bar = event.currentTarget.getBoundingClientRect();
    if (bar.width <= 0) return;
    const { width } = viewRef.current;
    const dx = (event.clientX - drag.originX) / bar.width;
    const dragDuration = drag.range.end - drag.range.start;
    const applyDrag = (view: ViewRange) => applyView({ ...view, scrollLeft: view.scrollLeft + (drag.range.start - rangeRef.current.start) * view.pixelsPerSecond });
    if (drag.mode === "pan") {
      const full = drag.thumb.end - drag.thumb.start >= 1 - 1e-6;
      applyDrag({ ...drag.view, scrollLeft: drag.view.scrollLeft + dx * dragDuration * drag.view.pixelsPerSecond * (full ? -1 : 1) });
      return;
    }
    const next: ViewRangeThumb = drag.mode === "start"
      ? { start: drag.thumb.start + dx, end: drag.thumb.end }
      : { start: drag.thumb.start, end: drag.thumb.end + dx };
    applyDrag(viewRangeFromThumb(next, dragDuration, width, drag.mode === "start" ? "end" : "start", true));
  }, [applyView]);

  const onRangeBarPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = rangeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    rangeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onRangeThumbKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const { pixelsPerSecond: pps, duration: clipDuration, width } = viewRef.current;
    const view: ViewRange = { pixelsPerSecond: pps, scrollLeft: timelineViewportRef.current?.scrollLeft ?? scroll.left };
    const current = viewRangeThumb(view, clipDuration, width);
    const step = (current.end - current.start) * 0.1 * (event.key === "ArrowLeft" ? -1 : 1);
    applyView(panViewByFraction(view, step, clipDuration, width));
  }, [applyView, scroll.left]);

  const fitView = useCallback(() => {
    setViewExtent(null);
    pendingViewRef.current = null;
    setZoomPixelsPerSecond(null);
    pendingScrollLeftRef.current = 0;
    setScroll((current) => (current.left === 0 ? current : { ...current, left: 0 }));
  }, []);

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
    // The canvas is absolutely positioned inside the scroll container, so it
    // would scroll away with the content; everything below is drawn in
    // viewport space (translate(-scroll)), so pin it back onto the visible
    // area. Without this, any horizontal scroll (zoom in, pan) left the
    // right part of the viewport blank (2026-09-03 FB: "clip cut off").
    canvas.style.transform = `translate(${scroll.left}px, ${scroll.top}px)`;
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
      const y = index * rowHeight;
      context.fillStyle = row.kind === "group" ? "#22242d" : index % 2 === 0 ? "#1c1e25" : "#191b21";
      context.fillRect(scroll.left, y, viewport.width, rowHeight);
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.beginPath();
      context.moveTo(scroll.left, y + rowHeight - .5);
      context.lineTo(scroll.left + viewport.width, y + rowHeight - .5);
      context.stroke();
    }
    // Grid: coarse second lines when zoomed out, a line per frame ("1F
    // grid") once a frame is at least 6px wide — with second boundaries kept
    // brighter so the rhythm stays readable. Iterated by index (not by
    // accumulating a float step) so frame lines land exactly on frames.
    const { gridStep, frameGrid } = timelineGridSteps(pixelsPerSecond, fps);
    const firstIndex = Math.ceil(visibleTimeRange.start / gridStep);
    const lastIndex = Math.floor(Math.min(range.end, visibleTimeRange.end) / gridStep);
    const transform = createViewTransform(range.start, pixelsPerSecond);
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const gridTime = index * gridStep;
      const x = Math.round(transform.timeToX(gridTime)) + .5;
      const onSecond = Math.abs(gridTime - Math.round(gridTime)) < gridStep * .01;
      context.strokeStyle = onSecond ? "rgba(255,255,255,.16)" : frameGrid ? "rgba(255,255,255,.085)" : "rgba(255,255,255,.045)";
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
      if (item.kind === "clip" && editing?.canEditClip(item)) continue;
      if (item.kind === "event-cue" && eventEditing?.canEdit(item)) continue;
      if (rowIndex != null && clippedRows.has(item.rowId)) drawItem(context, item, rowIndex, transform.timeToX, rowHeight, visibleTimeRange);
    }
    if (columns.length > 0) {
      for (const column of columns) {
        const rowIndex = rowIndexById.get(column.rowId);
        if (rowIndex != null) drawKeyColumn(context, column, rowIndex, transform.timeToX, rowHeight);
      }
    } else {
      for (const key of keys) {
        const rowIndex = rowIndexById.get(key.rowId);
        if (rowIndex != null) drawKey(context, key, rowIndex, transform.timeToX, rowHeight);
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
  }, [editing, eventEditing, dataSource, devicePixelRatio, pixelsPerSecond, range.end, range.start, revision, rowHeight, rowIds, rowQuery.start, rows, scroll.left, scroll.top, visibleQuery, viewport.height, viewport.width, onPerformanceSummary, visibleTimeRange.start, visibleTimeRange.end]);

  // Tick labels use a monospace font. Measuring a fixed sample tracks host font
  // size changes without coupling label layout to whichever ticks were rendered.
  const tickLabelWidth = Math.max(
    formatTimelineTick(visibleTimeRange.start, displayMode, fps).length,
    formatTimelineTick(visibleTimeRange.end, displayMode, fps).length,
  ) * tickCharacterWidth;
  const ticks = visibleTimelineTicks(
    range,
    scroll.left,
    viewport.width,
    pixelsPerSecond,
    timelineRulerStep(timelineGridSteps(pixelsPerSecond, fps).labelStep, pixelsPerSecond, tickLabelWidth),
  ).filter((tick) => (tick - range.start) * pixelsPerSecond >= scroll.left && (tick - range.start) * pixelsPerSecond <= scroll.left + viewport.width);
  const playbackReadout = variant === "compact"
    ? formatCompactTimelineReadout(time, playbackRange, displayMode, fps)
    : formatTimelineReadout(time, playbackRange, displayMode, fps);
  const rootClassName = ["timeline-editor", `timeline-editor--${variant}`, scrubbing ? "is-scrubbing" : "", slots?.inspector ? "has-inspector" : "", className ?? ""].filter(Boolean).join(" ");

  type UntargetedPlaybackCommand =
    | { type: "play" }
    | { type: "pause" }
    | { type: "seek"; time: number }
    | { type: "setLooping"; looping: boolean }
    | { type: "setRate"; rate: number };
  const dispatchTransport = (command: UntargetedPlaybackCommand) => {
    dispatchSafely(playbackController, { ...command, target: commandTarget } as TimelinePlaybackCommand, onDiagnostic);
  };
  const playbackRate = playbackSnapshot.rate ?? 1;
  const displayLoopRange = loopDragPreview ?? loopRange;
  const loopRangeStyle = displayLoopRange ? {
    left: `${(displayLoopRange.start - range.start) * pixelsPerSecond - scroll.left}px`,
    width: `${Math.max(1, (displayLoopRange.end - displayLoopRange.start) * pixelsPerSecond)}px`,
  } : undefined;

  return (
    <section data-view-start={range.start} data-view-end={range.end} onKeyDown={onViewportKeyDown} className={rootClassName} aria-label="Timeline editor" style={{ "--timeline-row-zoom": rowZoom, ...(treeWidth === null ? {} : { "--timeline-tree-width": `min(${treeWidth}px, max(120px, calc(100% - 160px)))` }) } as CSSProperties}>
      <div ref={rowHeightProbeRef} className="timeline-editor__row-height-probe" aria-hidden="true" />
      <header className="timeline-editor__header">
        <div className="timeline-editor__toolbar">
          {showTitle && (
            <div className="timeline-editor__tabs">
              <span className="timeline-editor__tab timeline-editor__tab--active">Timeline</span>
            </div>
          )}
          <div className="timeline-editor__slot">{slots?.toolbarStart}</div>
          <div className="timeline-editor__transport" role="group" aria-label="Playback controls">
            <button type="button" className="timeline-editor__button" disabled={duration <= 0} title="Skip to start (Up)" aria-label="Skip to start" onClick={() => seekTo(playbackRange.start)}><SkipPreviousIcon /></button>
            <button type="button" className="timeline-editor__button" disabled={duration <= 0} title="Previous frame (Left)" aria-label="Previous frame" onClick={() => stepFrame(-1)}><NavigateBeforeIcon /></button>
            <button
              type="button"
              className="timeline-editor__button"
              disabled={!canTransport}
              title="Play / Pause (Space)"
              aria-label={playbackSnapshot.playing ? "Pause" : "Play"}
              onClick={() => dispatchTransport(playbackSnapshot.playing ? { type: "pause" } : { type: "play" })}
            >
              {playbackSnapshot.playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="timeline-editor__button" disabled={duration <= 0} title="Next frame (Right)" aria-label="Next frame" onClick={() => stepFrame(1)}><NavigateNextIcon /></button>
            <button type="button" className="timeline-editor__button" disabled={duration <= 0} title="Skip to end (Ctrl+Up)" aria-label="Skip to end" onClick={() => seekTo(playbackRange.end)}><SkipNextIcon /></button>
            <button type="button" className={`timeline-editor__button${playbackSnapshot.looping ? " is-active" : ""}`} disabled={!canTransport} title="Toggle loop playback" aria-label="Loop" onClick={() => dispatchTransport({ type: "setLooping", looping: !playbackSnapshot.looping })}><RepeatIcon /></button>
            <button
              type="button"
              className={`timeline-editor__button timeline-editor__button--rate${playbackRate !== 1 ? " is-active" : ""}`}
              disabled={!canTransport}
              title="Cycle playback rate" aria-label="Playback rate"
              onClick={() => dispatchTransport({ type: "setRate", rate: nextTimelineRate(playbackRate) })}
            >
              {formatTimelineRate(playbackRate)}
            </button>
          </div>
          <button ref={readoutRef} type="button" className="timeline-editor__readout" onClick={() => setDisplayMode((mode) => mode === "frames" ? "seconds" : "frames")} title="Switch frames / seconds" aria-label="Toggle time display">{playbackReadout}</button>
          {frameRateOptions ? (
            <select
              className="timeline-editor__fps timeline-editor__fps-select"
              aria-label="Frame rate"
              value={frameRateValue ?? String(fps)}
              onChange={(event) => onFrameRateChange?.(event.target.value)}
            >
              {frameRateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <span className="timeline-editor__fps">{fps} fps</span>
          )}
          {editing && <button type="button" className="timeline-editor__button timeline-editor__button--text" aria-label="Snap to frames" aria-pressed={snap} title="Snap to frames · Alt-drag to bypass" onClick={() => setSnap(!snap)}>Snap</button>}
          <div className="timeline-editor__slot timeline-editor__slot--end">{slots?.toolbarEnd}</div>
        </div>
      </header>
      <div className="timeline-editor__body">
        <TrackDivider onResize={setTreeWidth} />
        <div className="timeline-editor__tree-heading" title={onMoveRow ? "Drop a track here to remove it from its group" : undefined}
          onDragOver={event => { if (onMoveRow && event.dataTransfer.types.includes("application/x-timeline-row")) event.preventDefault(); }}
          onDrop={event => { const id = event.dataTransfer.getData("application/x-timeline-row"); if (onMoveRow && id) { event.preventDefault(); onMoveRow(id as TimelineRow["id"], null); } }}><span>TRACKS</span><div className="timeline-editor__slot">{slots?.tracksHeaderEnd}</div></div>
        <div className="timeline-editor__tree-viewport" ref={treeViewportRef} onScroll={onTreeScroll}>
          <div className="timeline-editor__tree-content" style={{ height: totalHeight }}>
            {rows.map((row, index) => {
              const target = rowTargets.get(row.id);
              return <TimelineRowView key={row.id} row={row} index={rowQuery.start + index} target={target} selected={Boolean(target && timelinePlaybackTargetEquals(target, selectedTarget))} onSelect={setSelectedTarget} rowHeight={rowHeight} icon={slots?.rowIcon?.(row)} actions={slots?.rowActions?.(row)} onRename={onRenameRow} onMove={onMoveRow} onReorder={onReorderRow} onToggle={onToggleRow} />;
            })}
            {rowCount === 0 && <div className="timeline-editor__empty">{slots?.emptyState ?? "No timeline tracks"}</div>}
          </div>
        </div>
        {/*
          Ruler and track viewport share one positioning context so the
          playhead and loop-range band can be drawn as single elements that
          span both — the playhead extends up through the ruler, and the
          loop band highlights the same horizontal span in both rows.
        */}
        <div className="timeline-editor__ruler-and-tracks" {...panHandlers}>
          <div
            className="timeline-editor__ruler"
            ref={rulerRef}
            aria-label="Seek timeline"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishScrub(event, false)}
            onPointerCancel={(event) => finishScrub(event, true)}
          >
            {canTransport && onChangePlaybackRange && <PlaybackRangeHandles range={playbackRangePreview ?? playbackRange} viewStart={range.start} scale={pixelsPerSecond} scrollLeft={scroll.left} width={viewport.width} fps={fps} displayMode={displayMode} onPreview={setPlaybackRangePreview} onChange={onChangePlaybackRange} />}
            <span ref={tickWidthProbeRef} className="timeline-editor__tick timeline-editor__tick--measure" aria-hidden="true">00000000</span>
            {ticks.map((tick) => <span className="timeline-editor__tick" key={tick} style={{ left: `${Math.max(tickLabelWidth / 2, Math.min(viewport.width - tickLabelWidth / 2, ((tick - range.start) * pixelsPerSecond) - scroll.left))}px` }}>{formatTimelineTick(tick, displayMode, fps)}</span>)}
            <div
              className="timeline-editor__loop-lane"
              aria-label="Loop range"
              title="Drag to set a loop range. Double-click to clear."
              onPointerDown={onLoopLanePointerDown}
              onPointerMove={onLoopLanePointerMove}
              onPointerUp={finishLoopDrag}
              onPointerCancel={finishLoopDrag}
              onDoubleClick={clearLoopRange}
            />
          </div>
          <div
            className="timeline-editor__viewport"
            ref={timelineViewportRef}
            tabIndex={0}
            role="application"
            aria-label="Timeline scrubber"
            onScroll={onScroll}
            {...clipEditing.handlers}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finishScrub(event, false)}
            onPointerCancel={(event) => finishScrub(event, true)}
            onPointerLeave={(event) => { if (pointerIdRef.current === event.pointerId && !event.currentTarget.hasPointerCapture(event.pointerId)) finishScrub(event, true); }}
          >
            <div className="timeline-editor__content" style={{ width: totalWidth, height: totalHeight }} />
            <canvas className="timeline-editor__canvas" ref={canvasRef} />
            {editableClips.map(clip => clip.kind === "clip" ? clipEditing.renderClip(clip, rowQuery.start + rows.findIndex(row => row.id === clip.rowId)) : null)}
            {eventEditing && dataSource.getItems(visibleQuery).map(item => item.kind === "event-cue" && eventEditing.canEdit(item) ? <EventCue key={item.id} cue={item} editing={eventEditing} rowIndex={rowQuery.start + rows.findIndex(row => row.id === item.rowId)} rowHeight={rowHeight} scale={pixelsPerSecond} range={range} fps={fps} snap={snap} displayMode={displayMode} /> : null)}
            {clipEditing.indicator}
            {canTransport && [(playbackRangePreview ?? playbackRange).start, (playbackRangePreview ?? playbackRange).end].map((boundary, index) => <div key={index} className={`timeline-editor__playback-boundary timeline-editor__playback-boundary--${index === 0 ? "start" : "end"}`} title={index === 0 ? "Playback start" : "Playback end"} style={{ left: (boundary - range.start) * pixelsPerSecond, height: Math.max(totalHeight, viewport.height) }} />)}
            <div className="timeline-editor__range-action">{slots?.diagnosticAction}</div>
          </div>
          {loopRangeStyle && (
            <div className="timeline-editor__loop-region" style={loopRangeStyle}>
              {!loopDragPreview && (
                <button type="button" className="timeline-editor__loop-clear" title="Clear loop range" aria-label="Clear loop range" onClick={clearLoopRange}>×</button>
              )}
            </div>
          )}
          <div className="timeline-editor__playhead" ref={playheadRef} />
        </div>
        {/*
          View range bar (UE Sequencer style): the whole clip is the bar,
          the thumb is what the track viewport currently shows. Replaces
          both the zoom slider and the viewport's native horizontal
          scrollbar — drag the thumb to pan, drag a handle to zoom that
          side, click the bar to centre the view, double-click to fit.
        */}
        <div className="timeline-editor__range-corner" aria-hidden="true" />
        <div
          className="timeline-editor__range-bar"
          ref={rangeBarRef}
          title="Drag to pan. Drag the ends to zoom. Double-click to fit the clip. Wheel: zoom, Shift+wheel: pan, Ctrl+wheel: row height."
          onPointerDown={onRangeBarPointerDown}
          onPointerMove={onRangeBarPointerMove}
          onPointerUp={onRangeBarPointerUp}
          onPointerCancel={onRangeBarPointerUp}
          onDoubleClick={fitView}
        >
          <div
            className="timeline-editor__range-thumb"
            role="scrollbar"
            aria-label="Timeline view range"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(thumb.start * 100)}
            tabIndex={0}
            style={{ left: `${thumb.start * 100}%`, width: `${Math.max(0, thumb.end - thumb.start) * 100}%` }}
            onKeyDown={onRangeThumbKeyDown}
          >
            <span className="timeline-editor__range-handle timeline-editor__range-handle--start" />
            <span className="timeline-editor__range-handle timeline-editor__range-handle--end" />
          </div>
        </div>
      </div>
      {slots?.inspector && <div className="timeline-editor__inspector">{slots.inspector}</div>}
    </section>
  );
}

function TimelineRowView({
  row,
  index,
  target,
  selected,
  onSelect,
  rowHeight,
  actions,
  icon,
  onMove,
  onReorder,
  onToggle,
  onRename,
}: {
  row: TimelineRow;
  index: number;
  target?: TimelinePlaybackTarget;
  selected: boolean;
  onSelect: (target: TimelinePlaybackTarget) => void;
  rowHeight: number;
  actions?: ReactNode;
  icon?: ReactNode;
  onReorder?: TimelineEditorProps["onReorderRow"];
  onMove?: (rowId: TimelineRow["id"], parentId: TimelineRow["id"] | null) => void;
  onToggle?: (rowId: TimelineRow["id"]) => void;
  onRename?: (rowId: TimelineRow["id"], label: string) => void;
}): ReactElement {
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);
  const placement = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("application/x-timeline-row") || row.locked) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientY - rect.top) / rect.height;
    if (row.kind === "group" && onMove && (!onReorder || (fraction > 0.25 && fraction < 0.75))) return "inside";
    return onReorder ? (fraction < 0.5 ? "before" : "after") : null;
  };
  const targetProps = target ? {
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": selected,
    "aria-label": `Select playback target ${row.label}`,
    title: `Select playback target ${row.label}`,
    onClick: () => onSelect(target),
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(target);
      }
    },
  } : {};
  return (
    <div className={`timeline-editor__row timeline-editor__row--${row.kind}${target ? " timeline-editor__row--target" : ""}${selected ? " is-target-selected" : ""}${dropPosition === "inside" ? " is-drop-target" : ""}`}
      data-depth={row.depth} data-drop-position={dropPosition ?? undefined} draggable={Boolean((onMove || onReorder) && !row.locked)}
      onDragStart={event => { if ((event.target as HTMLElement).closest("input, button, .timeline-editor__row-actions")) { event.preventDefault(); return; } event.dataTransfer.setData("application/x-timeline-row", row.id); event.dataTransfer.effectAllowed = "move"; }}
      onDragOver={event => { const position = placement(event); setDropPosition(position); if (position) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition(null); }}
      onDragEnd={() => setDropPosition(null)}
      onDrop={event => {
        setDropPosition(null);
        const id = event.dataTransfer.getData("application/x-timeline-row") as TimelineRow["id"];
        const position = placement(event);
        if (!id || id === row.id || !position) return;
        event.preventDefault(); event.stopPropagation();
        if (position === "inside") onMove?.(id, row.id);
        else onReorder?.(id, row.id, position);
      }}
      style={{ transform: `translateY(${index * rowHeight}px)` }} {...(actions || onRename ? {} : targetProps)}>
      <span className="timeline-editor__row-color" style={{ backgroundColor: row.color ?? "#6c7284" }} />
      <span aria-hidden="true" style={{ flex: `0 0 ${Math.max(0, row.depth) * 16}px` }} />
      {row.kind === "group" && (onToggle ? <button type="button" className="timeline-editor__row-disclosure" title={row.expanded === false ? "Expand group" : "Collapse group"} aria-label={`${row.expanded === false ? "Expand" : "Collapse"} ${row.label}`} aria-expanded={row.expanded !== false} onClick={event => { event.stopPropagation(); onToggle(row.id); }}>{row.expanded === false ? "▸" : "▾"}</button> : <span className="timeline-editor__row-disclosure">▾</span>)}
      {icon && <span className="timeline-editor__row-icon">{icon}</span>}
      <RowLabel row={row} targetProps={actions || onRename ? targetProps : {}} onRename={onRename} style={{ paddingLeft: 0 }} />
      {actions && <span className="timeline-editor__row-actions" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{actions}</span>}
      {row.bindingId && <span className="timeline-editor__row-binding">{String(row.bindingId).replace(/^binding-/, "")}</span>}
      {row.muted && <span className="timeline-editor__row-state">M</span>}
      {row.locked && <span className="timeline-editor__row-state">L</span>}
    </div>
  );
}

export type { TimelineDataSource, TimelinePlaybackController, TimelinePlaybackSnapshot };
