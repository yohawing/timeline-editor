import {
  timelineId,
  type TimelineDataSource,
  type TimelineGroup,
  type TimelineBinding,
  type TimelineItem,
  type TimelineKey,
  type TimelineRow,
  type TimelinePlaybackTarget,
  type VisibleTimeQuery,
} from "./contracts";

const groupCharacter = timelineId<"group">("group-character");
const groupCamera = timelineId<"group">("group-camera");
const bindingActor = timelineId<"binding">("binding-actor");
const bindingCamera = timelineId<"binding">("binding-camera");
const rowCharacter = timelineId<"row">("row-character");
const rowBody = timelineId<"row">("row-body");
const rowFace = timelineId<"row">("row-face");
const rowEvents = timelineId<"row">("row-events");
const rowCamera = timelineId<"row">("row-camera");

const groups: TimelineGroup[] = [
  { id: groupCharacter, label: "Character", color: "#7c8cff" },
  { id: groupCamera, label: "Camera", color: "#57a6ff" },
];

const bindings: TimelineBinding[] = [
  { id: bindingActor, label: "Actor", targetKind: "actor" },
  { id: bindingCamera, label: "Shot Camera", targetKind: "actor" },
];

const rows: TimelineRow[] = [
  { id: timelineId("row-character-group"), label: "CHARACTER", kind: "group", depth: 0, groupId: groupCharacter, color: "#7c8cff", expanded: true },
  { id: rowCharacter, label: "Root Motion", kind: "track", depth: 1, groupId: groupCharacter, bindingId: bindingActor, color: "#7c8cff" },
  { id: rowBody, label: "Body Motion", kind: "track", depth: 1, groupId: groupCharacter, bindingId: bindingActor, color: "#9b8cff" },
  { id: rowFace, label: "Face", kind: "track", depth: 1, groupId: groupCharacter, bindingId: bindingActor, color: "#d47cff", muted: true },
  { id: rowEvents, label: "Events & Markers", kind: "track", depth: 0, color: "#ffb454" },
  { id: timelineId("row-camera-group"), label: "CAMERA", kind: "group", depth: 0, groupId: groupCamera, color: "#57a6ff", expanded: true },
  { id: rowCamera, label: "Shot Camera", kind: "track", depth: 1, groupId: groupCamera, bindingId: bindingCamera, color: "#57a6ff", locked: true },
];

const items: TimelineItem[] = [
  { kind: "clip", id: timelineId("clip-intro"), rowId: rowCharacter, label: "Walk In", range: { start: .45, end: 4.2 }, color: "#6677df" },
  { kind: "clip", id: timelineId("clip-turn"), rowId: rowCharacter, label: "Turn", range: { start: 4.55, end: 7.1 }, color: "#7b6ee6", selected: true },
  { kind: "clip", id: timelineId("clip-performance"), rowId: rowBody, label: "Performance_A", range: { start: .8, end: 8.8 }, color: "#8b69d2" },
  { kind: "clip", id: timelineId("clip-face"), rowId: rowFace, label: "Lip Sync", range: { start: 1.15, end: 9.35 }, color: "#b964c5" },
  { kind: "clip", id: timelineId("clip-camera"), rowId: rowCamera, label: "Medium to Close Up", range: { start: 0, end: 11.1 }, color: "#397ebc" },
  { kind: "marker", id: timelineId("marker-beat"), rowId: rowEvents, label: "Beat", time: 2.5, color: "#ffd166" },
  { kind: "event-cue", id: timelineId("cue-light"), rowId: rowEvents, label: "Light Hit", eventType: "lighting.trigger", time: 5.25, color: "#ff7a69" },
  { kind: "cue", id: timelineId("cue-review"), rowId: rowEvents, label: "Review", time: 8.15, color: "#70d6ff" },
];

const keys: TimelineKey[] = [
  ...[.45, 1.25, 2.1, 3.15, 4.2, 4.55, 5.4, 6.2, 7.1].map((time, index) => ({ kind: "key" as const, id: timelineId<"key">(`key-root-${index}`), rowId: rowCharacter, channelId: timelineId<"channel">("channel-root"), time, selected: time === 4.55 })),
  ...[.8, 1.7, 2.8, 4.1, 5.5, 7.2, 8.8].map((time, index) => ({ kind: "key" as const, id: timelineId<"key">(`key-body-${index}`), rowId: rowBody, channelId: timelineId<"channel">("channel-body"), time })),
  ...[1.15, 2.35, 3.6, 5.8, 7.4, 9.35].map((time, index) => ({ kind: "key" as const, id: timelineId<"key">(`key-face-${index}`), rowId: rowFace, channelId: timelineId<"channel">("channel-face"), time })),
];

function visible(query: VisibleTimeQuery, rowId: TimelineRow["id"], time: number): boolean {
  return query.rowIds.includes(rowId) && time >= query.range.start && time < query.range.end;
}

export function createFixtureTimelineDataSource(): TimelineDataSource {
  let revision = 1;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getRevision: () => revision,
    getDomain: () => ({ kind: "seconds" }),
    getRange: () => ({ start: 0, end: 12 }),
    getGroups: () => groups,
    getBindings: () => bindings,
    getRowCount: () => rows.length,
    getRows: ({ start, count }) => rows.slice(start, start + count),
    getPlaybackTarget: (rowId): TimelinePlaybackTarget | null => {
      if (rowId === rowCharacter) return { instanceId: "fixture-character", clipIndex: 0 };
      if (rowId === rowCamera) return { instanceId: "fixture-camera", clipIndex: 0 };
      return null;
    },
    getItems: (query) => items.filter((item) => item.kind === "clip"
      ? query.rowIds.includes(item.rowId) && item.range.start < query.range.end && query.range.start < item.range.end
      : visible(query, item.rowId, item.time)),
    getKeys: (query) => keys.filter((key) => visible(query, key.rowId, key.time)),
  };
}

export const fixtureTimelineDataSource = createFixtureTimelineDataSource();

/** Deterministic browser performance projection: 500 rows and 100k keys. */
export function createStressTimelineDataSource(rowCount = 500, keyCount = 100_000): TimelineDataSource {
  const rows: TimelineRow[] = Array.from({ length: rowCount }, (_, index) => ({
    id: timelineId<"row">(`stress-row-${index}`),
    label: `Track ${String(index + 1).padStart(3, "0")}`,
    kind: "track",
    depth: 0,
    color: index % 2 === 0 ? "#6677df" : "#57a6ff",
  }));
  const keys: TimelineKey[] = Array.from({ length: keyCount }, (_, index) => ({
    kind: "key",
    id: timelineId<"key">(`stress-key-${index}`),
    rowId: rows[index % rows.length].id,
    channelId: timelineId<"channel">(`stress-channel-${index % rows.length}`),
    time: (index % 12_000) / 1_000,
  }));
  const keysByRow = new Map<string, TimelineKey[]>();
  for (const key of keys) {
    const rowKeys = keysByRow.get(key.rowId) ?? [];
    rowKeys.push(key);
    keysByRow.set(key.rowId, rowKeys);
  }
  return {
    subscribe: () => () => undefined,
    getRevision: () => 1,
    getDomain: () => ({ kind: "seconds" }),
    getRange: () => ({ start: 0, end: 12 }),
    getGroups: () => [],
    getBindings: () => [],
    getRowCount: () => rows.length,
    getRows: ({ start, count }) => rows.slice(start, start + count),
    getPlaybackTarget: (rowId) => rowId === rows[0].id ? { instanceId: "stress", clipIndex: 0 } : null,
    getItems: () => [],
    getKeys: (query) => query.rowIds.flatMap((rowId) => (keysByRow.get(rowId) ?? []).filter((key) => key.time >= query.range.start && key.time < query.range.end)),
  };
}
