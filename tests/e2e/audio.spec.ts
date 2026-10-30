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

async function addTrack(page: Page, type: string) {
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: `${type[0].toUpperCase()}${type.slice(1)} Track`, exact: true }).click();
}

test("two panes: drop at cursor, waveform, drag, cancel, delete, undo and redo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Animation preview")).toBeVisible();
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await drop(page, 2);
  const clip = page.getByRole("button", { name: "Clip dropped.wav", exact: true });
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
  await addTrack(page, "audio");
  await drop(page, 1, 1, "second.wav");
  await expect(page.getByRole("button", { name: "Clip second.wav", exact: true })).toHaveAttribute("data-start", "1");
  await drop(page, 4, 0, "broken.wav", true);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(clip).toBeVisible();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.screenshot({ path: test.info().outputPath("two-pane.png") });
});

test("drop preview and placement use zoomed and scrolled track coordinates", async ({ page }) => {
  await page.goto("/");
  await addTrack(page, "audio");
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
  const clip = page.getByRole("button", { name: "Clip placed.wav" });
  await expect(clip).toHaveAttribute("data-start", "5");
  await expect(clip).toHaveAttribute("data-row-id", "audio-track-2");
  await drop(page, 5, 2, "rejected.wav"); // animation track rejects audio
  await expect(page.getByRole("button", { name: "Clip rejected.wav" })).toHaveCount(0);
});

test("track menu creates typed tracks, supports undo, and limits audio drops", async ({ page }) => {
  await page.goto("/");

  await addTrack(page, "animation");
  await addTrack(page, "event");
  await expect(page.locator(".timeline-editor__row-label")).toHaveText(["Audio 1", "Animation 1", "Event 1", "Root Motion"]);
  await drop(page, 2, 1, "not-animation.wav");
  await drop(page, 2, 2, "not-event.wav");
  await expect(page.locator(".timeline-editor__waveform")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".timeline-editor__row-label")).toHaveText(["Audio 1", "Animation 1", "Root Motion"]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await addTrack(page, "audio");
  await expect(page.locator(".timeline-editor__row-label")).toHaveText(["Audio 1", "Animation 1", "Event 1", "Audio 2", "Root Motion"]);
  await drop(page, 2, 3, "accepted.wav");
  await expect(page.getByRole("button", { name: "Clip accepted.wav" })).toHaveAttribute("data-start", "2");
  await page.screenshot({ path: test.info().outputPath("track-types.png") });
});

test("motion clips select, move, change Animation tracks and drive preview timing", async ({ page }) => {
  await page.goto("/");
  const clip = page.getByRole("button", { name: "Clip Animation", exact: true });
  await clip.click({ position: { x: 25, y: 20 } });
  await expect(clip).toHaveAttribute("aria-pressed", "true");
  const width = await page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width);
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 25 + width / 12 * 2, box.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-start", "2");
  const ruler = (await page.locator(".timeline-editor__ruler").boundingBox())!;
  await page.mouse.click(ruler.x + width / 12 * 3, ruler.y + 3);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBe(1);
  await addTrack(page, "animation");
  const destination = (await page.locator(".timeline-editor__row").filter({ hasText: "Animation 1" }).boundingBox())!;
  const moved = (await clip.boundingBox())!;
  await page.mouse.move(moved.x + 25, moved.y + 20); await page.mouse.down();
  await page.mouse.move(moved.x + 25, destination.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-row-id", "animation-track-2");
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  await viewport.press("Control+ArrowRight");
  await expect.poll(async () => Number(await clip.getAttribute("data-start"))).toBeCloseTo(2 + 1 / 24);
  await viewport.press("Control+z");
  await expect(clip).toHaveAttribute("data-start", "2");
  await clip.click({ position: { x: 25, y: 20 } }); await viewport.press("Delete");
  await expect(clip).toHaveCount(0);
  await viewport.press("Control+z"); await expect(clip).toHaveAttribute("data-start", "2");
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

test("inspector mute/solo changes real audio voices, volume is undoable, and header aligns", async ({ page }) => {
  await page.addInitScript(() => {
    const voices: { active: boolean }[] = [];
    (window as unknown as { voices: typeof voices }).voices = voices;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = create.call(this); const voice = { active: false }; voices.push(voice);
      const start = node.start.bind(node), stop = node.stop.bind(node);
      node.start = (...args) => { voice.active = true; start(...args); };
      node.stop = (...args) => { voice.active = false; stop(...args); };
      return node;
    };
  });
  await page.goto("/");
  const alignment = await page.evaluate(() => {
    const header = document.querySelector(".timeline-editor__tree-heading")!;
    const button = header.querySelector("button")!;
    const a = header.getBoundingClientRect(), b = button.getBoundingClientRect();
    return { delta: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2), border: getComputedStyle(header).borderRightWidth,
      indent: Array.from(document.querySelectorAll(".timeline-editor__row-label")).map(el => getComputedStyle(el).paddingLeft) };
  });
  expect(alignment.delta).toBeLessThanOrEqual(0.5); expect(alignment.border).toBe("1px"); expect(alignment.indent).toEqual(["0px", "0px"]);
  await page.getByRole("button", { name: "Clip Animation", exact: true }).dblclick({ position: { x: 40, y: 20 } });
  const panel = page.getByRole("complementary", { name: "Clip properties" });
  await expect(panel).toBeVisible(); await expect(panel.getByRole("slider")).toHaveCount(0);
  await page.getByRole("button", { name: "Skip to end", exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBe(12);
  await panel.getByLabel("Mute", { exact: true }).check();
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBe(0);
  await panel.getByLabel("Mute", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Skip to start", exact: true }).click();
  await panel.getByRole("button", { name: "Close properties" }).click();
  await drop(page, 0, 0, "first.wav"); await addTrack(page, "audio"); await drop(page, 0, 1, "second.wav");
  const first = page.getByRole("button", { name: "Clip first.wav", exact: true });
  await first.dblclick({ position: { x: 30, y: 20 } });
  await panel.getByLabel("Mute", { exact: true }).check();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const active = () => page.evaluate(() => (window as unknown as { voices: { active: boolean }[] }).voices.filter(v => v.active).length);
  await expect.poll(active).toBe(1);
  await panel.getByLabel("Mute", { exact: true }).uncheck(); await expect.poll(active).toBe(2);
  await panel.getByLabel("Solo", { exact: true }).check(); await expect.poll(active).toBe(1);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBeGreaterThan(0);
  await panel.getByLabel("Mute", { exact: true }).check(); await expect.poll(active).toBe(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const slider = panel.getByRole("slider", { name: "Volume" });
  const bounds = (await slider.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => slider.inputValue()).not.toBe("1");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(slider).toHaveValue("1");
  // A decode completing during a volume gesture must survive undoing the gain.
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      File.prototype.arrayBuffer = read;
      return new Promise(resolve => { (window as unknown as { finishRead(): void }).finishRead = () => { void read.call(this).then(resolve); }; });
    };
  });
  await drop(page, 0, 1, "during-volume.wav");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height / 2, { steps: 3 });
  await page.evaluate(() => (window as unknown as { finishRead(): void }).finishRead());
  const added = page.getByRole("button", { name: "Clip during-volume.wav", exact: true });
  await expect(added).toBeVisible(); await page.mouse.up();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(slider).toHaveValue("1"); await expect(added).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("properties.png") });
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
      createGain: context.createGain.bind(context),
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
