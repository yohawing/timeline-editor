# @yohawing/timeline-editor

Transport-neutral React and Canvas Timeline UI for read-only animation and media projections.

```tsx
import { TimelineEditor } from "@yohawing/timeline-editor";
import "@yohawing/timeline-editor/styles.css";

<TimelineEditor dataSource={projection} frameRate={24} variant="full" />
```

The package owns rendering, row/time virtualization, Canvas device-pixel-ratio handling, DOM playhead positioning, scrubbing with pointer capture/cancel, zoom, and display-only frame/seconds formatting. Time values are finite canonical seconds. `frameRate` controls display and explicit frame snapping; it never converts or mutates stored values. Time ranges use the half-open interval `[start, end)`.

## Public entrypoints

- `@yohawing/timeline-editor` exports `TimelineEditor`, public props, and playback types.
- `@yohawing/timeline-editor/core` exports the synchronous `TimelineDataSource` contracts, display/layout helpers, and the optional local browser playback controller.
- `@yohawing/timeline-editor/audio` exports the optional Web Audio follower (no React or Tauri dependency).
- `@yohawing/timeline-editor/styles.css` exports standalone dark-theme defaults using `--timeline-*` variables.

`TimelineDataSource` is synchronous for reads and uses `subscribe` for revision changes. `TimelinePlaybackController` is transport-neutral: it exposes `getSnapshot`, `subscribe`, and `dispatch`. When no controller is provided, the editor still renders and scrubs but transport buttons stay disabled. The package does not inspect Tauri globals, call IPC, or listen to app-specific window events.

### Scrubbing

Dragging on the ruler or the track area scrubs **live**: every pointer sample dispatches a `seek` to the playback controller (so a host viewport follows the drag), the playhead is moved imperatively without re-rendering, and a controller that was playing is paused for the drag and resumed on release. Without a controller the local time is committed on release only.

### View range, zoom and wheel

The track viewport has no zoom slider and no native horizontal scrollbar. A **view range bar** under the tracks (UE Sequencer style) shows the whole clip as the bar and the visible window as a thumb: drag the thumb to pan, drag either end to zoom that side, click the empty bar to centre the view there, double-click to fit the whole clip. The view fits the whole clip whenever the data source's range changes.

Wheel over the ruler or the tracks: **wheel** zooms the time axis around the pointer (wheel down = zoom in), **Shift+wheel** (or a trackpad's horizontal delta) pans, **Ctrl+wheel** zooms the row height (`--timeline-row-zoom`, 0.6×–3×). Zoomed in far enough (≥ 6px per frame) the track grid switches to one line per frame and the ruler labels frames; `timelineGridSteps` in `core/viewRange.ts` decides the steps. The zoom math lives in `core/viewRange.ts` and is exported from `@yohawing/timeline-editor/core`.

### Frame-rate picker

`frameRateOptions` (`{ value: string; label: string }[]`) turns the toolbar's read-only "N fps" label into a `<select>`; `frameRateValue` names the current choice and `onFrameRateChange(value)` reports a pick. Values are opaque strings so a host can offer an "auto" entry next to numbers; `frameRate` remains the number used for display and frame snapping.

### Playback rate

`TimelinePlaybackSnapshot.rate` is an optional multiplier applied to elapsed time (`1` = normal speed). `TimelinePlaybackCommand` accepts a matching `setRate` command. Both are additive and backward compatible: a controller that never reports `rate` is treated as fixed at `1x` by `projectTimelinePlaybackTime` and by the transport UI, and dispatching `setRate` to a controller that ignores it is a no-op. `createLocalPlaybackController` implements `rate`, defaulting to `1` and scaling its internal timer's elapsed time by the current rate. The transport UI always renders a rate control (next to Loop) that cycles `0.25x / 0.5x / 1x / 2x` on click and displays `1x` whenever the active snapshot omits `rate`; the control is not hidden for legacy controllers, since dispatch failures are already swallowed and reported through `onDiagnostic`.

## v0 boundaries

This release is a read-only projection with Play/Pause/Seek/Loop/Rate UI. TemporalDocument, editing commands, selection mutation, Undo/Redo, Graph Editor, Rust crates, native asset importers, video decoding, and a Tauri adapter are intentionally out of scope.

The Vite fixture under `examples/react-vite` demonstrates a local DataSource and local playback controller without a desktop shell. The package targets modern Chromium/WebView2 and React 18.2 or 19.

## Extraction provenance

This repository was extracted from `yohawing/tauri_3dapp_template` at source commit `c090602861a174a8068fef5119e0f2371a64d741`. The original application remains the owner of Tauri IPC, runtime projection, native renderer lifecycle, and host diagnostics.

## Development

```sh
npm ci
npm run verify
npm run dev
```

`npm run verify` runs the focused Vitest contracts, strict declaration build, Vite library build, standalone example build, and `npm pack --dry-run`.

The verify command also runs Chromium interaction coverage. Install the browser once with `npx playwright install chromium`; the separate `npm run test:perf` reference gate exercises the deterministic 500-row/100,000-key fixture and asserts Canvas paint p95 <= 8ms on the local Chromium reference environment. Git consumers receive a built `dist` through the `prepare` lifecycle script.

## Optional audio follower and standalone demo

Run `npm run build` then `npm run dev`. Drop one audio file onto the timeline,
choose a file, or press **クリック音で試す** for a generated 12-second WAV.
Use the existing Play/Pause, ruler scrub, Loop and rate controls. The marker
flashes at each integer second, matching the generated clicks. Audio appears
as one row; a successful new drop replaces it, and **音声を解除** releases it.
Decode errors retain the previous asset. The browser decides which codecs it
can decode; the demo does not promise support based on a filename extension.

```ts
import { createTimelineAudio } from "@yohawing/timeline-editor/audio";

const context = new AudioContext(); // host-owned; create lazily
const audio = createTimelineAudio(context);
await audio.load(file.arrayBuffer()); // latest request wins, including file reads
// In a user gesture, call context.resume() before awaiting anything.
// On each animation frame, pass the actual host time (not throttled React state):
audio.sync(snapshot);
// After an explicit seek, force even a sub-tolerance discontinuity:
audio.sync(snapshotAfterSeek, true);
// On close:
audio.dispose();
await context.close();
```

The host clock remains authoritative. `sync` does not extrapolate timestamps;
`time` must be current. Audio zero maps to `range.start` (zero when absent).
It stops at the animation/loop boundary and restarts on the next host wrap
sample. Keep feeding samples during playback; loops can have a frame-sized gap
and background-tab throttling can delay their restart. Stop/pause on host
visibility or session changes when that is required by the application.
Normal frames reuse the source. Explicit seeks, rate/boundary changes, backwards
time and drift exceeding 80 ms restart it. The tolerance is configurable in
canonical timeline seconds. `clear` and `dispose` invalidate pending loads.
`dispose` does not close the caller-owned AudioContext.

Decoded audio occupies full PCM memory; rate changes also change pitch.
Short audio becomes silent at its end, and long audio never extends the timeline.
There is no mixing, offset editing, waveform, persistence or export.
The demo marker is driven by the same host sample as audio, not by an audio clock.
Browser tests check real WAV decoding and offline PCM offset/rate output; they
do not measure physical speaker/display latency. Listen to the clicks against
the marker to inspect your device; hardware latency compensation is not applied.
