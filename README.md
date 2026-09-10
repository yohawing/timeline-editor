# @yohawing/timeline-editor

Transport-neutral React and Canvas Timeline UI for animation and media projections, with optional host-controlled editing.

```tsx
import { TimelineEditor } from "@yohawing/timeline-editor";
import "@yohawing/timeline-editor/styles.css";

<TimelineEditor dataSource={projection} frameRate={24} variant="full" />
```

The package owns rendering, row/time virtualization, Canvas device-pixel-ratio handling, DOM playhead positioning, scrubbing with pointer capture/cancel, zoom, and display-only frame/seconds formatting. Time values are finite canonical seconds. `frameRate` controls display and explicit frame snapping; it never converts or mutates stored values. Time ranges use the half-open interval `[start, end)`.

## Public entrypoints

- `@yohawing/timeline-editor` exports `TimelineEditor`, public props, and playback types.
- `@yohawing/timeline-editor/core` exports the synchronous `TimelineDataSource` contracts, display/layout helpers, and the optional local browser playback controller.
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

### Optional item editing

Omit `editing` to retain the default read-only projection. Opt in with callbacks:

```tsx
<TimelineEditor
  dataSource={projection}
  frameRate={24}
  editing={{
    onSelect: item => selectItem(item.id),
    onStart: () => pausePlayback(),
    onCommit: edit => validateAndApply(edit.item, edit.next),
  }}
/>
```

Drag an item to move it in time; drag within 6 pixels of either clip edge to resize it. Cues, markers and event cues move without resizing. Locked rows stay read-only. The ruler and empty track space still scrub. `onSelect` and `onStart` run on pointer down; the host decides whether to pause playback. A timing readout previews the proposal, and release after a drag emits one `onCommit`. Escape and pointer cancellation discard the proposal. Changing the data source or its revision during a drag prevents its commit.

The exported core helper `proposeTimelineItemEdit` and `TimelineItemEdit` describe the same operation without mutating the source. Movement deltas snap to `frameRate`, preserving an item's existing fractional offset, and proposals stay within the source time range. Clip resizing keeps the opposite edge and a minimum length of one frame (or the original length for shorter clips).

The host owns validation, applying the proposal, publishing a new data-source revision, selection state, Undo/Redo and persistence. A synchronous exception from `onCommit` is reported through `onDiagnostic`. Cross-row moves and keyboard item editing are not provided; hosts can use their own property forms.

## Boundaries

The default projection has Play/Pause/Seek/Loop/Rate UI. Optional editing emits proposals to the host. TemporalDocument, document mutation, Undo/Redo, Graph Editor, Rust crates, asset importers, audio/video decoding, and a Tauri adapter are intentionally out of scope.

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
