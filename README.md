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
- `@yohawing/timeline-editor/styles.css` exports standalone dark-theme defaults using `--timeline-*` variables.

`TimelineDataSource` is synchronous for reads and uses `subscribe` for revision changes. `TimelinePlaybackController` is transport-neutral: it exposes `getSnapshot`, `subscribe`, and `dispatch`. When no controller is provided, the editor still renders and scrubs but transport buttons stay disabled. The package does not inspect Tauri globals, call IPC, or listen to app-specific window events.

### Playback rate

`TimelinePlaybackSnapshot.rate` is an optional multiplier applied to elapsed time (`1` = normal speed). `TimelinePlaybackCommand` accepts a matching `setRate` command. Both are additive and backward compatible: a controller that never reports `rate` is treated as fixed at `1x` by `projectTimelinePlaybackTime` and by the transport UI, and dispatching `setRate` to a controller that ignores it is a no-op. `createLocalPlaybackController` implements `rate`, defaulting to `1` and scaling its internal timer's elapsed time by the current rate. The transport UI always renders a rate control (next to Loop) that cycles `0.25x / 0.5x / 1x / 2x` on click and displays `1x` whenever the active snapshot omits `rate`; the control is not hidden for legacy controllers, since dispatch failures are already swallowed and reported through `onDiagnostic`.

## v0 boundaries

This release is a read-only projection with Play/Pause/Seek/Loop/Rate UI. TemporalDocument, editing commands, selection mutation, Undo/Redo, Graph Editor, Rust crates, asset importers, audio/video decoding, and a Tauri adapter are intentionally out of scope.

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
