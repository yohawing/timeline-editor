import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { TimelineEditor } from "@yohawing/timeline-editor";
import {
  createFixtureTimelineDataSource,
  createLocalPlaybackController,
  createStressTimelineDataSource,
  type TimelinePlaybackController,
} from "@yohawing/timeline-editor/core";
import "@yohawing/timeline-editor/styles.css";
import "./example.css";

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

function Example(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const stress = params.get("stress") === "1";
  const variant = params.get("variant") === "compact" ? "compact" : "full";
  const fps = Number(params.get("fps") ?? 24);
  const malformed = params.get("malformed") === "1";
  const reject = params.get("reject") === "1";
  const dataSource = useMemo(() => stress ? createStressTimelineDataSource() : createFixtureTimelineDataSource(), [stress]);
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
  return (
    <main className="example-shell">
      <header className="example-heading">
        <div><strong>Timeline Editor</strong><span>standalone projection example</span></div>
        <span>React + Canvas · no Tauri runtime</span>
      </header>
      <div className="example-editor">
        <TimelineEditor
          dataSource={dataSource}
          playbackController={playbackController}
          frameRate={Number.isFinite(fps) && fps > 0 ? fps : 24}
          variant={variant}
          slots={{ toolbarEnd: <span className="example-badge">local transport</span> }}
          onDiagnostic={(diagnostic) => console.warn(diagnostic.message, diagnostic.error)}
          onPerformanceSummary={(summary) => {
            const runtime = globalThis as { __timelinePerf?: unknown; __timelinePerfSamples?: unknown[] };
            runtime.__timelinePerf = summary;
            runtime.__timelinePerfSamples = [...(runtime.__timelinePerfSamples ?? []), summary].slice(-120);
          }}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Example /></StrictMode>);
