# @yohawing/timeline-editor

Transport-neutral React and Canvas Timeline UI for animation and media projections, with optional host-owned clip editing.

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

Wheel over the ruler or the tracks: **wheel** zooms the time axis around the pointer (wheel up = zoom in), **Shift+wheel** (or a trackpad's horizontal delta) pans, **Ctrl+wheel** zooms the row height (`--timeline-row-zoom`, 0.6×–3×). Zoomed in far enough (≥ 6px per frame) the track grid switches to one line per frame and the ruler labels frames; `timelineGridSteps` in `core/viewRange.ts` decides the steps. The zoom math lives in `core/viewRange.ts` and is exported from `@yohawing/timeline-editor/core`.

### Frame-rate picker

`frameRateOptions` (`{ value: string; label: string }[]`) turns the toolbar's read-only "N fps" label into a `<select>`; `frameRateValue` names the current choice and `onFrameRateChange(value)` reports a pick. Values are opaque strings so a host can offer an "auto" entry next to numbers; `frameRate` remains the number used for display and frame snapping.

### Playback rate

`TimelinePlaybackSnapshot.rate` is an optional multiplier applied to elapsed time (`1` = normal speed). `TimelinePlaybackCommand` accepts a matching `setRate` command. Both are additive and backward compatible: a controller that never reports `rate` is treated as fixed at `1x` by `projectTimelinePlaybackTime` and by the transport UI, and dispatching `setRate` to a controller that ignores it is a no-op. `createLocalPlaybackController` implements `rate`, defaulting to `1` and scaling its internal timer's elapsed time by the current rate. The transport UI always renders a rate control (next to Loop) that cycles `0.25x / 0.5x / 1x / 2x` on click and displays `1x` whenever the active snapshot omits `rate`; the control is not hidden for legacy controllers, since dispatch failures are already swallowed and reported through `onDiagnostic`.

## v0 boundaries

The default remains a read-only projection with Play/Pause/Seek/Loop/Rate UI. The optional `editing` prop adds controlled clip selection, movement, file-drop targeting and edit shortcuts. The host owns mutation and history. TemporalDocument, Graph Editor, Rust crates, native asset importers, video decoding, and a Tauri adapter remain out of scope.

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

Run `npm run build` then `npm run dev`. The standalone demo has a Canvas
animation preview above the Timeline. Drop audio onto **Audio 1** at the desired
pointer time: the insertion line shows the target track and time before release.
Use **＋** in the TRACKS heading, then choose **Audio Track**, for another track.
The menu creates Audio, Animation or Event tracks. New Animation and Event tracks start empty. The preview motion clip supports
selection, dragging between Animation tracks, frame nudging, deletion and undo/redo;
its edited start drives the Canvas animation. Animation asset import and event
authoring/execution are not implemented. Only Audio tracks accept audio drops. Every successful drop adds clips; existing
clips are retained on decode failure. Multiple/overlapping clips mix during playback.
File formats depend on the browser decoder, not the extension.

Clips display a bounded peak envelope generated from every decoded PCM channel.
Drag a clip to change its start or move it to another Audio Track. Position changes
preserve its duration and PCM alignment. Dragging previews the edit; release commits
one undo step. **Esc** cancels. Frame snapping is enabled initially; **Alt-drag**
bypasses it, and **Snap** toggles it. Clips may extend beyond the independently
editable playback range; the view includes the clips and configured range.

The demo holds up to 50 undo steps, including file addition, movement, deletion and
track creation. Audio resources are retained while reachable from current/undo/redo
states, then released. Project persistence and trimming are supported;
multi-selection and project export are not implemented.

Shortcuts apply in the Timeline viewport and track area. Native inputs and
toolbar buttons retain their own keyboard behavior:

| Key | Action |
| --- | --- |
| Space / Down / K | Toggle playback / play / pause |
| Up / Ctrl+Up | Jump to sequence start / end |
| Left / Right | Step one frame |
| Ctrl+Left / Ctrl+Right | Move selected clip one frame |
| Delete / Backspace | Delete selected clip |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Home | Fit the timeline view |
| Esc | Cancel drag and clear selection |

Playback and frame-step bindings follow the supported subset of
[Epic's Sequencer hotkeys](https://dev.epicgames.com/documentation/en-us/unreal-engine/sequencer-hotkeys-in-unreal-engine).
Reverse shuttle, keys and trimming commands are not implemented. Existing wheel
navigation is unchanged. `TimelineEditing` callbacks let other hosts supply their
own data/history; omitting `editing` preserves read-only behavior.

```ts
import { createTimelineAudio } from "@yohawing/timeline-editor/audio";

const context = new AudioContext(); // host-owned; create lazily
const audio = createTimelineAudio(context);
await audio.load(file.arrayBuffer()); // latest request wins, including file reads
// In a user gesture, call context.resume() before awaiting anything.
// On each animation frame, pass the actual host time (not throttled React state):
audio.sync(snapshot, false, clip.range); // omit placement for range.start alignment
// After an explicit seek, force even a sub-tolerance discontinuity:
audio.sync(snapshotAfterSeek, true);
// On close:
audio.dispose();
await context.close();
```

The host clock remains authoritative. `sync` does not extrapolate timestamps;
`time` must be current. Audio zero maps to the optional placement start, otherwise `range.start` (zero when absent).
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
The preview is driven by the same host sample as audio, not by an audio clock.
Browser tests check real WAV decoding and offline PCM offset/rate output; they
do not measure physical speaker/display latency. Use an audio reference against
the preview to inspect your device; hardware latency compensation is not applied.

### Clip properties

Double-click an editable clip to open the demo's right-side inspector. Mute and
Solo live on each track row and affect every clip on that track. Solo applies
within the same media type, so soloing audio does not hide animation. Mute takes
precedence over solo. Clips have an independent Disable property.
Audio volume is a linear 0–200% gain; a slider drag is one undo step and keyboard
steps are individual edits. Gain changes do not restart the audio source.
The optional `TimelineEditing.onOpenClipProperties(id)` callback requests a
host-owned inspector. The core does not impose a panel, property schema or solo
policy. `createTimelineAudio().setVolume(value)` supplies only the gain primitive.

The track/timeline separator supports pointer dragging, Left/Right (10px),
Home or double-click (reset), and Escape during dragging (cancel). A host can
supply row controls with `slots.rowActions(row)`; the library does not impose
track mute/solo state or an add-clip policy. In the demo, each row's + adds a clip
at the playhead: audio opens a file chooser; Animation adds a procedural preview
motion; Event adds an editable placeholder section (no event dispatch runtime).

In the standalone demo, drag the Timeline top edge to resize the preview/Timeline
panes. Up/Down changes the split by 10px, Home or double-click resets it, and
Escape cancels a drag. The inspector stays independent; this is host layout,
not an additional TimelineEditor API.

Track labels support optional `onRenameRow(rowId, label)` for double-click editing
(Enter/blur commits, Escape cancels, blank labels are ignored). The host owns
renaming and undo. `--timeline-track-font-size` adjusts label text (default 0.75rem).

Use `initialViewState` and `onViewStateChange` to restore and observe track width,
time zoom, row zoom, Snap and frames/seconds display preferences. Initial values
are read on mount. The demo persists these and its pane split in LocalStorage
(`timeline-editor.demo.ui.v1`); project data is stored separately as described below. Invalid or unavailable storage falls back to defaults without blocking use.

The standalone demo automatically saves tracks, clips (including positions,
Disable and volume), track names and mute/solo state, and the original dropped
audio files in IndexedDB (`timeline-editor.demo`). The toolbar shows the project name (initially `Untitled`) with `*` while loading,
saving or unsaved. Hover for the detailed status; wait for `*` to disappear before
closing/reloading. Restoring
also decodes the audio so waveforms and synchronized playback work again; playback
starts only after a user gesture. Undo/redo history and playback position are not
persisted. Stress fixtures use a separate project key.

This is local browser storage, not a project export or a backup: clearing site
data removes it, and a different origin/browser has separate storage. Failed
writes retain the previous saved project and display an error. A failed project
read or audio decode disables saving for that session to avoid replacing unreadable data.

`slots.rowIcon(row)` supplies an optional track-type icon before each label.
The demo provides Audio, Animation (including Root Motion), and Event icons.

Clip edge dragging calls optional `editing.onResizeClip(id, range)`; numeric Start
and End fields are also available in the demo inspector. Left trimming advances
`sourceOffset` without moving the media content. `sourceDuration` describes the
full asset and `loop` repeats that source until the clip end. Waveforms use the
same source mapping; moving the clip preserves its offset. Turning Loop off
limits the section to the remaining source. Clip looping is independent of the
transport Loop button. Both trim and inspector edits support undo and persistence.

The demo In/Out fields edit an independent playback range in the selected display
unit. Frames mode uses whole-frame inputs at the current FPS; seconds mode uses
seconds. Clip Start/End, duration, source offset and drag/drop/trim feedback follow
the same mode. Display switching never converts or rounds stored canonical seconds. The local
controller accepts `setPlaybackRange`; other host controllers may handle this
optional command when exposing their own range UI. Timeline view bounds include
clips and the playback range, while playback stops/loops at the configured bounds.

Add a Group from the Tracks menu. Drag a track label onto a Group to parent it,
or onto the Tracks heading to ungroup it. Groups support nesting, naming, Mute,
and adding child tracks through +. Their disclosure buttons collapse/expand the
rows without stopping playback. Membership is project data; collapsed group IDs
are UI preferences in LocalStorage. Hosts opt in with `onMoveRow` and
`onToggleRow` and provide the visible flattened rows/depth/expanded state.

Playback start/end handles appear in the ruler when the host provides
`onChangePlaybackRange(range)`. Drag previews the boundaries; release commits once.
Escape or pointer cancellation restores the original range. Left/Right moves a
focused handle by one frame; Alt-drag bypasses frame snapping. The demo connects
this callback to the same undo/persistence path as its In/Out fields.

Middle-button dragging over the ruler or clips pans horizontally and vertically
without seeking or editing clips. Escape cancels the pan. Looped clips show source
wrap boundaries, including trimmed source offsets; boundaries closer than 6px are
omitted at distant zoom levels to avoid dense overlapping lines. Disabled clips
are translucent but remain selectable and editable. Read-only Canvas clips use
the same disabled appearance and source-wrap positions.
