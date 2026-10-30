import { setPlaybackEdge } from "./playback-helpers";
import { expect, test, type Page } from "@playwright/test";

async function drop(page: Page, time: number, row = 0, name = "dropped.wav", invalid = false, previewOnly = false) {
  await expect(page.locator("main")).not.toHaveAttribute("data-project-state", "loading");
  await page.evaluate(async ({ time, row, name, invalid, previewOnly }) => {
    const module = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const transfer = new DataTransfer();
    transfer.items.add(new File([invalid ? "invalid" : module.clickTrack()], name, { type: "audio/wav" }));
    const viewport = document.querySelector<HTMLElement>(".timeline-editor__viewport")!;
    const content = document.querySelector<HTMLElement>(".timeline-editor__content")!;
    const bounds = viewport.getBoundingClientRect();
    const rowElement = document.querySelector<HTMLElement>(".timeline-editor__row")!;
    const view = document.querySelector<HTMLElement>(".timeline-editor")!;
    const clientX = bounds.left + (time - Number(view.dataset.viewStart)) / (Number(view.dataset.viewEnd) - Number(view.dataset.viewStart)) * content.getBoundingClientRect().width - viewport.scrollLeft;
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
  await expect(page.locator("input[type=file]")).toBeHidden();
  await drop(page, 2);
  const clip = page.getByRole("button", { name: "Clip dropped.wav", exact: true });
  await expect(clip).toHaveAttribute("data-start", "2");
  await expect(clip.getByLabel("Audio waveform")).toBeVisible();
  expect((await clip.locator("path").getAttribute("d"))!.length).toBeGreaterThan(100);
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  const contentWidth = await page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width);
  const bounds = (await clip.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 20); await page.mouse.down();
  await page.mouse.move(bounds.x + 30 + contentWidth / Number(await page.locator(".timeline-editor").getAttribute("data-view-end")), bounds.y + 20, { steps: 5 }); await page.mouse.up();
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
  await page.mouse.move(ruler.x + ruler.width / 2, ruler.y + 3); await page.mouse.wheel(0, -500);
  await expect.poll(() => page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(ruler.width * 1.5);
  await page.locator(".timeline-editor__viewport").evaluate(el => {
    el.scrollLeft = document.querySelector(".timeline-editor__content")!.getBoundingClientRect().width / 4;
    el.scrollTop = 10;
    el.dispatchEvent(new Event("scroll"));
  });
  await drop(page, 5, 1, "placed.wav", false, true);
  await expect(page.locator(".timeline-editor__drop-preview")).toContainText("Audio 2 · 120 f");
  await drop(page, 5, 1, "placed.wav");
  await expect(page.locator(".timeline-editor__drop-preview")).toHaveCount(0);
  const clip = page.getByRole("button", { name: "Clip placed.wav" });
  await expect(clip).toHaveAttribute("data-start", "5");
  await expect(clip).toHaveAttribute("data-row-id", await page.locator(".timeline-editor__row").filter({ has: page.locator(".timeline-editor__row-label", { hasText: /^Audio 2$/ }) }).locator(".timeline-editor__row-binding").innerText());
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
  await page.mouse.click(ruler.x + (await page.locator(".timeline-editor__content").boundingBox())!.width / Number(await page.locator(".timeline-editor").getAttribute("data-view-end")) * 3, ruler.y + 3);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBe(1);
  await addTrack(page, "animation");
  const destination = (await page.locator(".timeline-editor__row").filter({ hasText: "Animation 1" }).boundingBox())!;
  const moved = (await clip.boundingBox())!;
  await page.mouse.move(moved.x + 25, moved.y + 20); await page.mouse.down();
  await page.mouse.move(moved.x + 25, destination.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-row-id", await page.locator(".timeline-editor__row").filter({ has: page.locator(".timeline-editor__row-label", { hasText: /^Animation 1$/ }) }).locator(".timeline-editor__row-binding").innerText());
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
  await page.getByRole("application", { name: "Timeline scrubber" }).press("ArrowLeft");
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBeGreaterThan(11);
  await panel.getByLabel("Disable", { exact: true }).check();
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBe(0);
  await panel.getByLabel("Disable", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Skip to start", exact: true }).click();
  await panel.getByRole("button", { name: "Close properties" }).click();
  await drop(page, 0, 0, "first.wav"); await addTrack(page, "audio"); await drop(page, 0, 1, "second.wav");
  const first = page.getByRole("button", { name: "Clip first.wav", exact: true });
  await first.dblclick({ position: { x: 30, y: 20 } });
  await drop(page, 0, 0, "sibling.wav");
  await page.getByRole("button", { name: "Mute Audio 1", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const active = () => page.evaluate(() => (window as unknown as { voices: { active: boolean }[] }).voices.filter(v => v.active).length);
  await expect.poll(active).toBe(1);
  await page.getByRole("button", { name: "Mute Audio 1", exact: true }).click(); await expect.poll(active).toBe(3);
  await page.getByRole("button", { name: "Solo Audio 1", exact: true }).click(); await expect.poll(active).toBe(2);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-motion-time"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Mute Audio 1", exact: true }).click(); await expect.poll(active).toBe(0);
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

test("track divider resizes and row plus adds clips at the playhead", async ({ page }) => {
  await page.goto("/");
  const divider = page.getByRole("separator", { name: "Track panel width" });
  const box = (await divider.boundingBox())!;
  const tree = page.locator(".timeline-editor__tree-heading");
  const width = () => tree.evaluate(el => el.getBoundingClientRect().width);
  const initial = await width();
  await page.mouse.move(box.x + 3, box.y + 50); await page.mouse.down();
  await page.mouse.move(box.x + 103, box.y + 50, { steps: 5 }); await page.mouse.up();
  await expect.poll(width).toBeCloseTo(initial + 100, 0);
  await divider.press("ArrowLeft"); await expect.poll(width).toBeCloseTo(initial + 90, 0);
  await drop(page, 2, 0, "resized.wav");
  await expect(page.getByRole("button", { name: "Clip resized.wav" })).toHaveAttribute("data-start", "2");
  await divider.press("Home"); await expect.poll(width).toBe(initial);
  const ruler = (await page.locator(".timeline-editor__ruler").boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width * 3 / Number(await page.locator(".timeline-editor").getAttribute("data-view-end")), ruler.y + 3);
  await page.getByRole("button", { name: "Add clip to Root Motion", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clip Animation", exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Clip Animation", exact: true }).last()).toHaveAttribute("data-start", "3");
  await addTrack(page, "event");
  await page.getByRole("button", { name: "Add clip to Event 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clip Event", exact: true })).toHaveAttribute("data-start", "3");
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add clip to Audio 1", exact: true }).click();
  const chooser = await chooserEvent;
  const bytes = await page.evaluate(async () => {
    const module = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    return Array.from(new Uint8Array(module.clickTrack()));
  });
  await chooser.setFiles({ name: "from-plus.wav", mimeType: "audio/wav", buffer: Buffer.from(bytes) });
  await expect(page.getByRole("button", { name: "Clip from-plus.wav", exact: true })).toHaveAttribute("data-start", "3");
  await page.screenshot({ path: test.info().outputPath("track-controls.png") });
});

test("compact divider tracks its column and end-of-range additions are disabled", async ({ page }) => {
  await page.goto("/?variant=compact");
  const divider = page.getByRole("separator", { name: "Track panel width" });
  const heading = page.locator(".timeline-editor__tree-heading");
  const initial = (await heading.boundingBox())!;
  expect(initial.width).toBe(150);
  await divider.press("ArrowRight");
  await expect.poll(() => heading.evaluate(el => el.getBoundingClientRect().width)).toBe(160);
  const bar = (await divider.boundingBox())!;
  const column = (await heading.boundingBox())!;
  expect(bar.x + bar.width / 2).toBeCloseTo(column.x + column.width, 0);
  await divider.press("Home");
  await expect.poll(() => heading.evaluate(el => el.getBoundingClientRect().width)).toBe(150);
  await page.getByRole("button", { name: "Skip to end", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add clip to Root Motion", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add clip to Audio 1", exact: true })).toBeDisabled();
  // With no active motion at the half-open end, the ball is absent.
  await expect.poll(() => page.getByLabel("Animation preview").evaluate((canvas: HTMLCanvasElement) => {
    const pixel = canvas.getContext("2d")!.getImageData(Math.round(canvas.width * 0.85), Math.round(canvas.height * 0.7 - 24 * devicePixelRatio), 1, 1).data;
    return Array.from(pixel).slice(0, 3);
  })).toEqual([20, 23, 29]);
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

test("project edits and original audio survive reload and still play", async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as unknown as { audioStarts: number }).audioStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args) {
      (window as unknown as { audioStarts: number }).audioStarts++;
      start.apply(this, args);
    };
  });
  await page.goto("/");
  await drop(page, 0, 0, "persisted.wav");
  const clip = page.getByRole("button", { name: "Clip persisted.wav", exact: true });
  await expect(clip.getByLabel("Audio waveform")).toBeVisible();
  let waveform = await clip.locator("path").getAttribute("d");
  await clip.dblclick({ position: { x: 40, y: 20 } });
  const volume = page.getByRole("slider", { name: "Volume" });
  await volume.fill("0.4");
  await volume.dispatchEvent("change");
  await page.getByRole("button", { name: "Close properties" }).click();
  await page.locator(".timeline-editor__row-label").filter({ hasText: "Audio 1" }).dblclick();
  await page.getByRole("textbox", { name: "Track name" }).fill("Music");
  await page.getByRole("textbox", { name: "Track name" }).press("Enter");
  await page.getByRole("button", { name: "Solo Music", exact: true }).click();
  await addTrack(page, "event");
  await page.getByRole("button", { name: "Add clip to Event 1" }).click();
  const motion = page.getByRole("button", { name: "Clip Animation", exact: true });
  await motion.click();
  await page.getByRole("application", { name: "Timeline scrubber" }).press("Control+ArrowRight");
  const motionStart = await motion.getAttribute("data-start");
  await motion.dblclick({ position: { x: 40, y: 20 } });
  await page.getByLabel("Disable", { exact: true }).check();
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  waveform = await clip.locator("path").getAttribute("d");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await expect(motion).toHaveAttribute("data-start", motionStart!);
  await motion.dblclick({ position: { x: 40, y: 20 } });
  await expect(page.getByLabel("Disable", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(page.getByRole("button", { name: "Solo Music", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Clip Event", exact: true })).toBeVisible();
  await expect(clip.locator("path")).toHaveAttribute("d", waveform!);
  await clip.dblclick({ position: { x: 40, y: 20 } });
  await expect(volume).toHaveValue("0.4");
  await page.getByRole("button", { name: "Close properties" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioStarts: number }).audioStarts)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await clip.click();
  await page.getByRole("application", { name: "Timeline scrubber" }).press("Delete");
  await expect(clip).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await expect(clip).toHaveCount(0);
});

test("failed project writes retain the previous saved document", async ({ page }) => {
  await page.goto("/");
  await addTrack(page, "event");
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException("Test quota", "QuotaExceededError"); };
  });
  await addTrack(page, "animation");
  await expect(page.getByRole("status")).toHaveText("Untitled*");
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await expect(page.getByRole("button", { name: "Add clip to Event 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add clip to Animation 1", exact: true })).toHaveCount(0);
});

test("an unreadable project is not overwritten by subsequent edits", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    await storage.writeProject("default", { version: 999, document: { tracks: [], clips: [] }, audio: [] });
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Untitled*");
  await expect(page.getByRole("alert")).toContainText("automatic saving is disabled");
  await addTrack(page, "event");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("automatic saving is disabled");
  await expect(page.getByRole("button", { name: "Add clip to Event 1" })).toHaveCount(0);
});

test("audio decode failure preserves the saved project and reports unsaved state", async ({ page }) => {
  await page.goto("/");
  await drop(page, 0, 0, "decode.wav");
  await expect(page.getByRole("button", { name: "Clip decode.wav" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    const project = await storage.readProject("default");
    project.audio[0][1] = new Blob(["invalid audio"]);
    await storage.writeProject("default", project);
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Untitled*");
  await expect(page.getByRole("alert")).toContainText("Audio could not be restored");
  await addTrack(page, "event");
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Untitled*");
  await expect(page.getByRole("button", { name: "Add clip to Event 1" })).toHaveCount(0);
});

test("a stale session cannot replace a saved project", async ({ page }) => {
  await page.goto("/");
  await addTrack(page, "event");
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    const project = await storage.readProject("default");
    project.document.tracks = [];
    let current = true;
    const pending = storage.writeProject("default", project, () => current);
    current = false; // Session ends while the database open is pending.
    await pending;
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Untitled");
  await expect(page.getByRole("button", { name: "Add clip to Event 1" })).toBeVisible();
});

async function enterTime(page: Page, label: string, value: string) {
  const field = page.getByRole("spinbutton", { name: label, exact: true });
  await field.fill(value); await field.press("Enter");
}

test("trims source time, loops audio, and saves an independent playback range", async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).started = [];
    AudioBufferSourceNode.prototype.start = function (...args) { (window as any).started.push({ loop: this.loop, offset: args[1], duration: args[2] }); start.apply(this, args); };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle time display" }).click();
  await drop(page, 0, 0, "trim.wav");
  const clip = page.getByRole("button", { name: "Clip trim.wav", exact: true });
  await expect(clip).toBeVisible();
  const box = (await clip.boundingBox())!;
  const scale = box.width / 12;
  await page.mouse.move(box.x + box.width - 3, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + scale * 8, box.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-end", "8");
  await page.mouse.move(box.x + 5, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + scale * 2, box.y + 20, { steps: 5 }); await page.mouse.up();
  await expect(clip).toHaveAttribute("data-start", "2");
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  await viewport.press("Control+z"); await expect(clip).toHaveAttribute("data-start", "0");
  await viewport.press("Control+Shift+z"); await expect(clip).toHaveAttribute("data-start", "2");
  await clip.dblclick({ position: { x: 40, y: 20 } });
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  await enterTime(page, "Clip end", "18");
  await page.getByRole("button", { name: "Close properties" }).click();
  await setPlaybackEdge(page, "end", 14); await setPlaybackEdge(page, "start", 13);
  await page.getByRole("button", { name: "Skip to start", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).started.length)).toBeGreaterThan(0);
  const voice = await page.evaluate(() => (window as any).started[0]);
  expect(voice.loop).toBe(true); expect(voice.offset).toBeGreaterThanOrEqual(1); expect(voice.offset).toBeLessThan(1.2);
  expect(voice.duration).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect.poll(() => page.getByLabel("Animation preview").getAttribute("data-time")).toBe("14.000");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready"); await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await expect(page.getByRole("slider", { name: "Playback range start", exact: true })).toHaveAttribute("aria-valuenow", "13");
  await expect(page.getByRole("slider", { name: "Playback range end", exact: true })).toHaveAttribute("aria-valuenow", "14");
  await expect(clip).toHaveAttribute("data-start", "2"); await expect(clip).toHaveAttribute("data-end", "18");
  await clip.dblclick({ position: { x: 40, y: 20 } });
  await expect(page.getByRole("checkbox", { name: "Loop", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: "Loop", exact: true }).uncheck();
  await expect(clip).toHaveAttribute("data-end", "12");
});

test("groups move and collapse tracks, preserve clips, and restore hierarchy", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).groupVoices = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = create.call(this), voice = { active: false };
      (window as any).groupVoices.push(voice);
      const start = node.start.bind(node), stop = node.stop.bind(node);
      node.start = (...args) => { voice.active = true; start(...args); };
      node.stop = (...args) => { voice.active = false; stop(...args); };
      return node;
    };
  });
  const activeVoices = () => page.evaluate(() => (window as any).groupVoices.filter((voice: any) => voice.active).length);
  await page.goto("/"); await drop(page, 0, 0, "group.wav");
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: "Group", exact: true }).click();
  const audio = page.locator(".timeline-editor__row-label").filter({ hasText: /^Audio 1$/ });
  const group = page.locator(".timeline-editor__row-label").filter({ hasText: /^Group 1$/ });
  await audio.dragTo(group);
  await expect(audio).toHaveCSS("padding-left", /[1-9]/);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(activeVoices).toBe(1);
  await page.getByRole("button", { name: "Collapse Group 1" }).click();
  await expect.poll(activeVoices).toBe(1);
  await page.getByRole("button", { name: "Mute Group 1", exact: true }).click();
  await expect.poll(activeVoices).toBe(0);
  await page.getByRole("button", { name: "Mute Group 1", exact: true }).click();
  await expect.poll(activeVoices).toBe(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(audio).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clip group.wav", exact: true })).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready"); await page.reload();
  await expect(page.getByRole("button", { name: "Expand Group 1" })).toBeVisible();
  await expect(audio).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Group 1" }).click();
  await expect(page.getByRole("button", { name: "Clip group.wav", exact: true })).toBeVisible();
  await audio.dragTo(page.locator(".timeline-editor__tree-heading"));
  await expect(audio).toHaveCSS("padding-left", "0px");
  await page.getByRole("button", { name: "Collapse Group 1" }).click();
  await expect(audio).toBeVisible();
  await page.getByRole("button", { name: "Add track to Group 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Group", exact: true }).click();
  const child = page.locator(".timeline-editor__row-label").filter({ hasText: /^Group 2$/ });
  await expect(child).toBeVisible();
  await group.dragTo(child); // Parent cannot be placed in its descendant.
  await expect(group).toHaveCSS("padding-left", "0px");
  await expect(child).toHaveCSS("padding-left", /[1-9]/);
});

test("native looped audio at 2x wraps the source and stops at the clip boundary", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { clickTrack, createTimelineAudio } = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const context = new OfflineAudioContext(1, 60000, 24000);
    const audio = createTimelineAudio({ state: "running", currentTime: 0, destination: context.destination,
      decodeAudioData: context.decodeAudioData.bind(context), createBufferSource: context.createBufferSource.bind(context), createGain: context.createGain.bind(context) });
    await audio.load(clickTrack());
    audio.sync({ available: true, time: 0, duration: 10, playing: true, looping: false, rate: 2 }, false, { start: 0, end: 4, sourceOffset: 11.5, loop: true });
    const data = (await context.startRendering()).getChannelData(0);
    const energy = (a: number, b: number) => data.slice(a, b).reduce((sum, value) => sum + Math.abs(value), 0);
    return { before: energy(0, 5800), firstWrap: energy(6000, 6400), lastClick: energy(42000, 42400), afterEnd: energy(48000, 60000) };
  });
  expect(result.before).toBeLessThan(0.1);
  expect(result.firstWrap).toBeGreaterThan(1);
  expect(result.lastClick).toBeGreaterThan(1);
  expect(result.afterEnd).toBeLessThan(0.1);
});
