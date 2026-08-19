import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { TimelineEditor } from "@yohawing/timeline-editor";
import {
  createFixtureTimelineDataSource,
  createLocalPlaybackController,
  createStressTimelineDataSource,
} from "@yohawing/timeline-editor/core";
import "@yohawing/timeline-editor/styles.css";
import "./example.css";

function Example(): JSX.Element {
  const params = new URLSearchParams(window.location.search);
  const stress = params.get("stress") === "1";
  const variant = params.get("variant") === "compact" ? "compact" : "full";
  const fps = Number(params.get("fps") ?? 24);
  const dataSource = useMemo(() => stress ? createStressTimelineDataSource() : createFixtureTimelineDataSource(), [stress]);
  const playbackController = useMemo(() => createLocalPlaybackController(12, 0), []);
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
