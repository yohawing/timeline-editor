import { expect, test, type Page } from "@playwright/test";

async function drop(page: Page, time: number, row = 0, name = "dropped.wav", invalid = false, previewOnly = false) {
  await page.evaluate(async ({ time, row, name, invalid, previewOnly }) => {
    const module = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const transfer = new DataTransfer();
    transfer.items.add(new File([invalid ? "invalid" : module.clickTrack()], name, { type: "audio/wav" }));
    const viewport = document.querySelector<HTMLElement>(".timeline-editor__viewport")!;
    const content = document.querySelector<HTMLElement>(".timeline-editor__content")!;
    const bounds = viewport.getBoundingClientRect();
    const rowElement = document.querySelector<HTMLElement>(".timeline-editor__row")!;
    const clientX = bounds.left + time / 12 * content.getBoundingClientRect().width - viewport.scrollLeft;
    const clientY = bounds.top + (row + 0.5) * rowElement.getBoundingClientRect().height - viewport.scrollTop;
    viewport.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY }));
    if (!previewOnly) viewport.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY }));
  }, { time, row, name, invalid, previewOnly });
}

test("two panes: drop at cursor, waveform, drag, cancel, delete, undo and redo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Animation preview")).toBeVisible();
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await drop(page, 2);
  const clip = page.getByRole("button", { name: "Audio clip dropped.wav", exact: true });
  await expect(clip).toHaveAttribute("data-start", "2");
  await expect(clip.getByLabel("Audio waveform")).toBeVisible();
  expect((await clip.locator("path").getAttribute("d"))!.length).toBeGreaterThan(100);
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  const contentWidth = await page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width);
  const bounds = (await clip.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 20); await page.mouse.down();
  await page.mouse.move(bounds.x + 30 + contentWidth / 12, bounds.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-start", "3");
  await viewport.press("Control+ArrowRight");
  await expect.poll(async () => Number(await clip.getAttribute("data-start"))).toBeCloseTo(3 + 1 / 24, 5);
  await viewport.press("Control+z"); await expect(clip).toHaveAttribute("data-start", "3");
  const beforeCancel = (await clip.boundingBox())!;
  await page.mouse.move(beforeCancel.x + 30, beforeCancel.y + 20); await page.mouse.down();
  await page.mouse.move(beforeCancel.x + 90, beforeCancel.y + 20); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-start", "3");
  await clip.click(); await viewport.press("Delete"); await expect(clip).toHaveCount(0);
  await viewport.press("Control+z"); await expect(clip).toHaveAttribute("data-start", "3");
  await viewport.press("Control+Shift+z"); await expect(clip).toHaveCount(0);
  await viewport.press("Control+z");
  await page.getByRole("button", { name: "Add Audio Track" }).click();
  await drop(page, 1, 1, "second.wav");
  await expect(page.getByRole("button", { name: "Audio clip second.wav", exact: true })).toHaveAttribute("data-start", "1");
  await drop(page, 4, 0, "broken.wav", true);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(clip).toBeVisible();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.screenshot({ path: test.info().outputPath("two-pane.png") });
});

test("drop preview and placement use zoomed and scrolled track coordinates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Audio Track" }).click();
  const ruler = (await page.locator(".timeline-editor__ruler").boundingBox())!;
  await page.mouse.move(ruler.x + ruler.width / 2, ruler.y + 3); await page.mouse.wheel(0, 500);
  await expect.poll(() => page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(ruler.width * 1.5);
  await page.locator(".timeline-editor__viewport").evaluate(el => {
    el.scrollLeft = document.querySelector(".timeline-editor__content")!.getBoundingClientRect().width / 4;
    el.scrollTop = 10;
    el.dispatchEvent(new Event("scroll"));
  });
  await drop(page, 5, 1, "placed.wav", false, true);
  await expect(page.locator(".timeline-editor__drop-preview")).toContainText("Audio 2 · 5.00 s");
  await drop(page, 5, 1, "placed.wav");
  await expect(page.locator(".timeline-editor__drop-preview")).toHaveCount(0);
  const clip = page.getByRole("button", { name: "Audio clip placed.wav" });
  await expect(clip).toHaveAttribute("data-start", "5");
  await expect(clip).toHaveAttribute("data-row-id", "audio-track-2");
  await drop(page, 5, 2, "rejected.wav"); // animation track rejects audio
  await expect(page.getByRole("button", { name: "Audio clip rejected.wav" })).toHaveCount(0);
});

test("Sequencer transport shortcuts work without creating editing side effects", async ({ page }) => {
  await page.goto("/"); await drop(page, 0);
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  const preview = page.getByLabel("Animation preview");
  await viewport.press("Space");
  await expect.poll(async () => Number(await preview.getAttribute("data-time"))).toBeGreaterThan(0.2);
  await viewport.press("k");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.waitForTimeout(40);
  const paused = await preview.getAttribute("data-time"); await page.waitForTimeout(120);
  expect(await preview.getAttribute("data-time")).toBe(paused);
  await viewport.press("ArrowUp");
  await expect.poll(async () => Number(await preview.getAttribute("data-time"))).toBe(0);
  await viewport.press("ArrowRight");
  await expect.poll(async () => Number(await preview.getAttribute("data-time"))).toBeCloseTo(1 / 24, 2);
  await viewport.press("Control+ArrowUp");
  await expect.poll(async () => Number(await preview.getAttribute("data-time"))).toBe(12);
  await viewport.press("ArrowUp"); await viewport.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await viewport.press("Space");
});

test("real Web Audio renders the requested offset and rate", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { clickTrack, createTimelineAudio } = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const context = new OfflineAudioContext(1, 24000, 24000);
    // Offline rendering must schedule before rendering begins. Only the state
    // gate is adapted; decoding, source nodes and PCM rendering are native.
    const audio = createTimelineAudio({
      state: "running", currentTime: 0, destination: context.destination,
      decodeAudioData: context.decodeAudioData.bind(context),
      createBufferSource: context.createBufferSource.bind(context),
    });
    await audio.load(clickTrack());
    audio.sync({ available: true, time: 2.5, duration: 12, playing: true, looping: false, rate: 2 }, false, { start: 2, end: 8 });
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    const energy = (a: number, b: number) => data.slice(a, b).reduce((sum, v) => sum + Math.abs(v), 0);
    return { before: energy(0, 5800), click: energy(6000, 6400) };
  });
  expect(result.before).toBeLessThan(0.1);
  expect(result.click).toBeGreaterThan(1);
});
