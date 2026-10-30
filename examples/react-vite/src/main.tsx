import { StrictMode, useEffect, useMemo, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { TimelineEditor } from "@yohawing/timeline-editor";
import {
  createFixtureTimelineDataSource,
  createLocalPlaybackController,
  createStressTimelineDataSource,
  type TimelinePlaybackController,
  type TimelineDataSource,
  timelineId,
} from "@yohawing/timeline-editor/core";
import "@yohawing/timeline-editor/styles.css";
import "./example.css";
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
  return { ...base, getRowCount: () => 1, getRows: ({ start, count }) => [row].slice(start, start + count),
    getGroups: () => [], getKeys: () => [], getKeyColumns: () => [],
    getItems: query => query.rowIds.includes(row.id) ? [{ kind: "clip", id: timelineId<"clip">("preview-animation"), rowId: row.id, label: "Animation", range: { start: 0, end: 12 }, color: "#58658d" }] : [],
  };
}

function Example(): JSX.Element {
  useEffect(() => { document.querySelector<HTMLElement>(".timeline-editor__viewport")?.focus({ preventScroll: true }); }, []);
  const params = new URLSearchParams(window.location.search);
  const stress = params.get("stress") === "1";
  const variant = params.get("variant") === "compact" ? "compact" : "full";
  const fps = Number(params.get("fps") ?? 24);
  const malformed = params.get("malformed") === "1";
  const reject = params.get("reject") === "1";
  const dataSource = useMemo(() => stress ? createStressTimelineDataSource() : createPreviewTimeline(), [stress]);
  const playbackController = useMemo(() => {
    if (malformed) return createMalformedPlaybackController();
    const local = createLocalPlaybackController(12, 0);
    if (!reject) return local;
    return {
      getSnapshot: local.getSnapshot,
      subscribe: local.subscribe,
      dispatch: () => Promise.reject(new Error("example transport rejected")),
    } satisfies TimelinePlaybackController;
  }, [malformed, reject]);
  const audio = useAudioDemo(playbackController);
  const audioData = useMemo(() => withAudioRows(dataSource, audio.document), [dataSource, audio.document]);
  return (
    <main className="example-shell">
      <div className="example-preview" onPointerDown={() => document.querySelector<HTMLElement>(".timeline-editor__viewport")?.focus()}>
        <canvas ref={audio.preview} aria-label="Animation preview" />
      </div>
      <div className="example-editor" onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
        <TimelineEditor
          dataSource={audioData}
          editing={audio.editing}
          showTitle={false}
          playbackController={audio.controller}
          frameRate={Number.isFinite(fps) && fps > 0 ? fps : 24}
          variant={variant}
          slots={{ toolbarStart: audio.toolbar }}
          onDiagnostic={(diagnostic) => console.warn(diagnostic.message, diagnostic.error)}
          onPerformanceSummary={(summary) => {
            const runtime = globalThis as { __timelinePerf?: unknown; __timelinePerfSamples?: unknown[] };
            runtime.__timelinePerf = summary;
            runtime.__timelinePerfSamples = [...(runtime.__timelinePerfSamples ?? []), summary].slice(-120);
          }}
        />
        {audio.error && <div className="example-error" role="alert">{audio.error}<button aria-label="Dismiss error" onClick={audio.dismissError}>×</button></div>}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Example /></StrictMode>);
