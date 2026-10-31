import { StrictMode, useEffect, useMemo, useState, useCallback, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { TimelineEditor, type TimelineViewState } from "@yohawing/timeline-editor";
import {
  createFixtureTimelineDataSource,
  createLocalPlaybackController,
  createStressTimelineDataSource,
  type TimelinePlaybackController,
  type TimelineDataSource,
  type TimelineClip,
  timelineId,
} from "@yohawing/timeline-editor/core";
import "@yohawing/timeline-editor/styles.css";
import "./example.css";
import { useUiPreferences } from "./uiPreferences";
import { usePaneResize } from "./usePaneResize";
import { useAudioDemo, withAudioRows } from "./audioDemo";

function createMalformedPlaybackController(): TimelinePlaybackController {
  const snapshot = {
    available: true,
    time: Number.NaN,
    duration: -4,
    playing: true,
    looping: true,
    target: { instanceId: "", clipIndex: -1 },
    sampledAtUnixMs: Number.NaN,
  } as const;
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    dispatch: () => undefined,
  };
}

function createPreviewTimeline(): TimelineDataSource {
  const base = createFixtureTimelineDataSource();
  const row = base.getRows({ start: 0, count: base.getRowCount() }).find(row => row.label === "Root Motion")!;
  return { ...base, getRowCount: () => 1, getRows: ({ start, count }) => [{ ...row, depth: 0, groupId: undefined }].slice(start, start + count),
    getGroups: () => [], getKeys: () => [], getKeyColumns: () => [],
    getItems: query => query.rowIds.includes(row.id) ? [{ kind: "clip", id: timelineId<"clip">("preview-animation"), rowId: row.id, label: "Animation", range: { start: 0, end: 12 }, color: "#58658d" }] : [],
  };
}

function Example(): JSX.Element {
  const preferences = useUiPreferences();
  const panes = usePaneResize(preferences.initial.previewRatio, preferences.saveRatio);
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<"dark" | "light">(params.get("theme") === "light" ? "light" : "dark");
  const stress = params.get("stress") === "1";
  const variant = params.get("variant") === "compact" ? "compact" : "full";
  const requestedFps = Number(params.get("fps") ?? 24);
  const [fps, setFps] = useState(Number.isFinite(requestedFps) && requestedFps > 0 ? requestedFps : 24);
  const [displayMode, setDisplayMode] = useState<"frames" | "seconds">(preferences.initial.timeline?.displayMode === "seconds" ? "seconds" : "frames");
  const onViewStateChange = useCallback((state: TimelineViewState) => {
    setDisplayMode(state.displayMode);
    preferences.saveTimeline(state);
  }, [preferences.saveTimeline]);
  const malformed = params.get("malformed") === "1";
  const reject = params.get("reject");
  const dataSource = useMemo(() => stress ? createStressTimelineDataSource() : createPreviewTimeline(), [stress]);
  const playbackController = useMemo(() => {
    if (malformed) return createMalformedPlaybackController();
    const local = createLocalPlaybackController(12, 0);
    if (!reject) return local;
    return {
      getSnapshot: local.getSnapshot,
      subscribe: local.subscribe,
      dispatch: () => { if (reject === "sync") throw new Error("example transport rejected synchronously"); return Promise.reject(new Error("example transport rejected")); },
    } satisfies TimelinePlaybackController;
  }, [malformed, reject]);
  const motion = useMemo(() => stress ? null : dataSource.getItems({ rowIds: dataSource.getRows({ start: 0, count: dataSource.getRowCount() }).map(row => row.id), range: dataSource.getRange() }).find((item): item is TimelineClip => item.kind === "clip" && item.id === "preview-animation") ?? null, [dataSource, stress]);
  const audio = useAudioDemo(playbackController, motion, { displayMode, fps });
  useEffect(() => { if (audio.ready) document.querySelector<HTMLElement>(".timeline-editor__viewport")?.focus({ preventScroll: true }); }, [audio.ready]);
  const audioData = useMemo(() => withAudioRows(dataSource, audio.document, audio.collapsed), [dataSource, audio.document, audio.collapsed]);
  return (
    <main data-project-state={!audio.ready ? "loading" : audio.saving ? "saving" : "ready"} ref={panes.shell} style={panes.style} className="example-shell">
      {panes.divider}
      <div className="example-preview" onPointerDown={() => document.querySelector<HTMLElement>(".timeline-editor__viewport")?.focus()}>
        <canvas ref={audio.preview} aria-label="Animation preview" />
      </div>
      <div inert={!audio.ready} className="example-editor" onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
        <TimelineEditor
          theme={theme}
          dataSource={audioData}
          editing={audio.editing}
          eventEditing={audio.eventEditing}
          initialViewState={preferences.initial.timeline}
          onViewStateChange={onViewStateChange}
          onChangePlaybackRange={audio.changePlaybackRange}
          onRenameRow={stress ? undefined : audio.renameRow}
          onMoveRow={stress ? undefined : audio.moveRow}
          onReorderRow={stress ? undefined : audio.reorderRow}
          onToggleRow={stress ? undefined : audio.toggleRow}
          showTitle={false}
          playbackController={audio.controller}
          frameRate={fps}
          frameRateOptions={Array.from(new Set([24, 25, 30, 48, 50, 60, fps])).sort((a, b) => a - b).map(rate => ({ value: String(rate), label: `${rate} fps` }))}
          frameRateValue={String(fps)}
          onFrameRateChange={value => setFps(Number(value))}
          variant={variant}
          slots={{ toolbarEnd: <select aria-label="Theme" title="Theme" value={theme} onChange={event => setTheme(event.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select>, inspector: audio.properties, toolbarStart: audio.toolbar, tracksHeaderEnd: audio.addTrack, rowActions: audio.rowActions, rowIcon: audio.rowIcon }}
          onDiagnostic={(diagnostic) => console.warn(diagnostic.message, diagnostic.error)}
          onPerformanceSummary={(summary) => {
            const runtime = globalThis as { __timelinePerf?: unknown; __timelinePerfSamples?: unknown[] };
            runtime.__timelinePerf = summary;
            runtime.__timelinePerfSamples = [...(runtime.__timelinePerfSamples ?? []), summary].slice(-120);
          }}
        />
        {audio.error && <div className="example-error" role="alert">{audio.error}<button title="Dismiss error" aria-label="Dismiss error" onClick={audio.dismissError}>×</button></div>}
      </div>
      {audio.filePicker}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Example /></StrictMode>);
