import { test, expect } from "@playwright/test";

test("event tracks use point triggers with move, cancel, properties, mute and persistence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: "Event Track", exact: true }).click();
  await page.getByRole("button", { name: "Add event to Event 1", exact: true }).click();
  const event = page.getByRole("button", { name: "Event Event", exact: true });
  await expect(event).toHaveAttribute("data-time", "0");
  await expect(event).toHaveText("");
  await expect(event.locator("svg")).toHaveAttribute("width", "10");
  await expect(page.getByRole("button", { name: "Clip Event", exact: true })).toHaveCount(0);
  await event.focus(); await event.press("Space");
  await expect(event).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await event.dblclick();
  await expect(page.getByRole("complementary", { name: "Event properties" })).toBeVisible();
  const time = page.getByRole("spinbutton", { name: "Event time", exact: true });
  await time.fill("48"); await time.press("Enter");
  await expect(event).toHaveAttribute("data-time", "2");
  await expect(page.getByRole("spinbutton", { name: "Clip end", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close properties" }).click();
  const box = (await event.boundingBox())!;
  const width = (await page.locator(".timeline-editor__content").boundingBox())!.width;
  await page.mouse.move(box.x + 7, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 7 + width / 12, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(event).toHaveAttribute("data-time", "3");
  await event.press("Control+z"); await expect(event).toHaveAttribute("data-time", "2");
  await event.press("Control+Shift+z"); await expect(event).toHaveAttribute("data-time", "3");
  const moved = (await event.boundingBox())!;
  await page.mouse.move(moved.x + 7, moved.y + moved.height / 2); await page.mouse.down();
  await page.mouse.move(moved.x + 67, moved.y + moved.height / 2); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(event).toHaveAttribute("data-time", "3");
  await page.getByRole("button", { name: "Mute Event 1", exact: true }).click();
  await expect(event).toHaveCSS("opacity", "0.4");
  await page.getByRole("button", { name: "Mute Event 1", exact: true }).click();
  await expect(event).toHaveCSS("opacity", "1");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect(event).toHaveAttribute("data-time", "3");
  await page.screenshot({ path: test.info().outputPath("event-trigger.png") });
  await event.press("Delete"); await expect(event).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(event).toHaveAttribute("data-time", "3");
});

test("legacy Event Clips restore as triggers at their start time", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    await storage.writeProject("default", { version: 1, document: {
      tracks: [{ id: "legacy-event-track", type: "event", label: "Legacy" }],
      clips: [{ kind: "clip", id: "legacy-event", rowId: "legacy-event-track", label: "Old Event", color: "#dbb56e", range: { start: 2, end: 5 }, disabled: true }]
    }, audio: [] });
  });
  await page.reload();
  const event = page.getByRole("button", { name: "Event Old Event", exact: true });
  await expect(event).toHaveAttribute("data-time", "2");
  await expect(event).toHaveCSS("opacity", "0.4");
  await expect(page.getByRole("button", { name: "Clip Old Event", exact: true })).toHaveCount(0);
  await event.dblclick();
  await expect(page.getByRole("checkbox", { name: "Disable", exact: true })).toBeChecked();
});

test("event source queries are half-open and leave editing room after the last trigger", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { withAudioRows } = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const base = { getRange: () => ({ start: 0, end: 12 }), getRows: () => [], getRowCount: () => 0, getItems: () => [] };
    const source = withAudioRows(base, { tracks: [{ id: "event-row", type: "event" }], clips: [], events: [{ kind: "event-cue", id: "edge", rowId: "event-row", label: "edge", time: 12, eventType: "event", color: "#fff" }] });
    return { before: source.getItems({ rowIds: ["event-row"], range: { start: 0, end: 12 } }).length, after: source.getItems({ rowIds: ["event-row"], range: { start: 12, end: 13 } }).length, end: source.getRange().end };
  });
  expect(result).toEqual({ before: 0, after: 1, end: 13 });
});
