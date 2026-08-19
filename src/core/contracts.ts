/** Canonical timeline time. v0 stores finite seconds only. */
export type TimeValue = number;

export interface TimeDomain {
  readonly kind: "seconds";
}

export interface TimeRange {
  readonly start: TimeValue;
  readonly end: TimeValue;
}

export interface ViewTransform {
  readonly startTime: TimeValue;
  readonly pixelsPerTimeUnit: number;
  timeToX(time: TimeValue): number;
  xToTime(x: number): TimeValue;
}

type TimelineId<Kind extends string> = string & { readonly __timelineIdKind: Kind };

export type RowId = TimelineId<"row">;
export type GroupId = TimelineId<"group">;
export type BindingId = TimelineId<"binding">;
export type ClipId = TimelineId<"clip">;
export type CueId = TimelineId<"cue">;
export type MarkerId = TimelineId<"marker">;
export type ChannelId = TimelineId<"channel">;
export type KeyId = TimelineId<"key">;

export interface TimelinePlaybackTarget {
  instanceId: string;
  clipIndex: number;
}

export function timelineId<Kind extends string>(value: string): TimelineId<Kind> {
  return value as TimelineId<Kind>;
}

export interface TimelineGroup {
  id: GroupId;
  label: string;
  color: string;
}

export interface TimelineBinding {
  id: BindingId;
  label: string;
  targetKind: "actor" | "property" | "audio-output";
}

export interface TimelineRow {
  id: RowId;
  label: string;
  kind: "group" | "track" | "channel";
  depth: number;
  groupId?: GroupId;
  bindingId?: BindingId;
  color?: string;
  muted?: boolean;
  locked?: boolean;
  expanded?: boolean;
}

interface TimelineItemBase {
  rowId: RowId;
  label: string;
  selected?: boolean;
}

export interface TimelineClip extends TimelineItemBase {
  kind: "clip";
  id: ClipId;
  range: TimeRange;
  color: string;
}

export interface TimelineCue extends TimelineItemBase {
  kind: "cue";
  id: CueId;
  time: TimeValue;
  color: string;
}

export interface TimelineMarker extends TimelineItemBase {
  kind: "marker";
  id: MarkerId;
  time: TimeValue;
  color: string;
}

export interface TimelineEventCue extends TimelineItemBase {
  kind: "event-cue";
  id: CueId;
  time: TimeValue;
  color: string;
  eventType: string;
}

export interface TimelineChannel {
  id: ChannelId;
  rowId: RowId;
  label: string;
  valueType: "number" | "vector3" | "quaternion";
}

export interface TimelineKey {
  kind: "key";
  id: KeyId;
  rowId: RowId;
  channelId: ChannelId;
  time: TimeValue;
  selected?: boolean;
}

export interface TimelineKeyColumn {
  rowId: RowId;
  channelId: ChannelId;
  time: TimeValue;
  count: number;
}

export type TimelineItem = TimelineClip | TimelineCue | TimelineMarker | TimelineEventCue;

export interface RowRangeQuery {
  start: number;
  count: number;
}

/** Time ranges are half-open: start <= t < end. */
export interface VisibleTimeQuery {
  rowIds: readonly RowId[];
  range: TimeRange;
}

/**
 * Synchronous projection read API. Implementations should return stable IDs and
 * avoid mutating the projection while a query is in progress.
 */
export interface TimelineDataSource {
  subscribe(listener: () => void): () => void;
  getRevision(): number;
  getDomain(): TimeDomain;
  getRange(): TimeRange;
  getGroups(): readonly TimelineGroup[];
  getBindings(): readonly TimelineBinding[];
  getRowCount(): number;
  getRows(query: RowRangeQuery): readonly TimelineRow[];
  /** Optional stable runtime target associated with a selectable row. */
  getPlaybackTarget?(rowId: RowId): TimelinePlaybackTarget | null;
  getItems(query: VisibleTimeQuery): readonly TimelineItem[];
  getKeys(query: VisibleTimeQuery): readonly TimelineKey[];
  getKeyColumns?(query: VisibleTimeQuery, pixelsPerTimeUnit: number): readonly TimelineKeyColumn[];
}

export function createViewTransform(startTime: TimeValue, pixelsPerTimeUnit: number): ViewTransform {
  if (!Number.isFinite(startTime)) throw new RangeError("Timeline start time must be finite");
  if (!Number.isFinite(pixelsPerTimeUnit) || pixelsPerTimeUnit <= 0) {
    throw new RangeError("Timeline scale must be a finite positive number");
  }
  return {
    startTime,
    pixelsPerTimeUnit,
    timeToX: (time) => (time - startTime) * pixelsPerTimeUnit,
    xToTime: (x) => startTime + x / pixelsPerTimeUnit,
  };
}

export function overlapsHalfOpen(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function normalizeTime(value: number): TimeValue {
  if (!Number.isFinite(value)) throw new RangeError("Timeline time must be finite seconds");
  return value;
}

export function normalizeTimeRange(range: TimeRange): TimeRange {
  const start = normalizeTime(range.start);
  const end = normalizeTime(range.end);
  if (start < 0 || end < start) throw new RangeError("Timeline range must satisfy 0 <= start <= end");
  return { start, end };
}
