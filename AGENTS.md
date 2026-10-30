# Project direction

- Use Unreal Engine Sequencer as the reference for timeline interaction and keyboard shortcuts. Preserve explicit user deviations and existing transport contracts.
- Keep the standalone demo to two panes: Canvas preview above, Timeline below. Put editing controls in the Timeline toolbar; avoid separate demo/control panels.
- Audio drops belong to the targeted Audio Track at the pointer time, with an insertion preview. Audio clips show waveforms and support position editing.
- Keep host data ownership and optional editing callbacks separate from playback/rendering. Verify position edits against audio playback, not only the displayed rectangle.
- Respond in Japanese. Read TODO.md when present. Computer Use requires user permission.
