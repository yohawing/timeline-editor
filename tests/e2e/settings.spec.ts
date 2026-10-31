import { test, expect } from "@playwright/test";

test("Snap controls live host seeking and settings use the same compact scrollbars", async ({ page }) => {
  await page.goto("/?fps=2");
  const snap = page.getByRole("button", { name: "Snap to frames" });
  const ruler = page.locator(".timeline-editor__ruler");
  const point = await ruler.evaluate(element => {
    const viewport = document.querySelector<HTMLElement>(".timeline-editor__viewport")!;
    const content = document.querySelector<HTMLElement>(".timeline-editor__content")!;
    const editor = document.querySelector<HTMLElement>(".timeline-editor")!;
    const start = Number(editor.dataset.viewStart), end = Number(editor.dataset.viewEnd);
    const rect = element.getBoundingClientRect();
    return { x: rect.left + (1.23 - start) / (end - start) * content.getBoundingClientRect().width - viewport.scrollLeft, y: rect.y + 4 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "1.000");
  await snap.click();
  await expect(snap).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-time"))).toBeCloseTo(1.23, 1);
  await snap.click();
  await page.keyboard.down("Alt"); await page.mouse.click(point.x, point.y); await page.keyboard.up("Alt");
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-time"))).toBeCloseTo(1.23, 1);
  await page.getByLabel("Timeline settings").click();
  for (const selector of [".timeline-editor__viewport", ".timeline-editor__settings-panel"]) {
    expect(await page.locator(selector).evaluate(el => getComputedStyle(el, "::-webkit-scrollbar").width)).toBe("6px");
  }
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(page.getByRole("region", { name: "Timeline editor" })).toHaveAttribute("data-theme", "light");
});

test("settings keyboard interaction stays isolated and the panel fits a short editor", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await page.goto("/");
  const settings = page.getByLabel("Timeline settings");
  await settings.focus(); await settings.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const panel = page.locator(".timeline-editor__settings-panel");
  await expect(panel).toBeVisible();
  const panelBox = (await panel.boundingBox())!;
  const editorBox = (await page.getByRole("region", { name: "Timeline editor" }).boundingBox())!;
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(editorBox.y + editorBox.height);
  await page.getByLabel("Playback speed").fill("2");
  await page.getByLabel("Playback speed").press("Enter");
  await settings.press("Escape");
  await expect(panel).not.toBeVisible();
  await settings.click();
  await page.getByLabel("Animation preview").click();
  await expect(panel).not.toBeVisible();
});

test("numeric time, range and FPS settings drive the host preview", async ({ page }) => {
  await page.goto("/?fps=30");
  const readout = page.getByRole("button", { name: "Current time" });
  await readout.click();
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).fill("75");
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).press("Enter");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "2.500");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Frame rate", { exact: true }).fill("60");
  await page.getByLabel("Frame rate", { exact: true }).press("Enter");
  await expect(readout).toContainText("0150");
  const start = page.getByLabel("Playback start time");
  await start.fill("60"); await start.press("Enter");
  await expect(page.getByRole("slider", { name: "Playback range start", exact: true })).toHaveAttribute("aria-valuenow", "1");
  await page.getByLabel("Playback speed").fill("0.5");
  await page.getByLabel("Playback speed").press("Enter");
  await expect(page.getByRole("button", { name: "Playback rate", exact: true })).toHaveText("0.5x");
  await page.getByLabel("Time display", { exact: true }).selectOption((await page.getByLabel("Time display", { exact: true }).inputValue()) === "frames" ? "seconds" : "frames");
  await page.getByLabel("Timeline settings").click();
  await readout.click();
  const seconds = page.getByRole("spinbutton", { name: "Current seconds", exact: true });
  await seconds.fill("3.5"); await seconds.press("Enter");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "3.500");
});

test("keyboard presets change shortcuts and survive reload", async ({ page }) => {
  await page.goto("/");
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  for (const [preset, next] of [["unity", "."], ["maya", "Alt+."]] as const) {
    await page.getByLabel("Timeline settings").click();
    await page.getByLabel("Operation preset").selectOption(preset);
    await page.getByLabel("Timeline settings").click();
    await page.getByRole("button", { name: "Skip to start", exact: true }).click();
    await viewport.press(next);
    await expect(page.getByRole("button", { name: "Current time" })).toContainText("0001");
  }
  await page.reload();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Operation preset")).toHaveValue("maya");
  await page.getByLabel("Operation preset").selectOption("default");
  await page.getByLabel("Timeline settings").click();
  await page.reload();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Operation preset")).toHaveValue("default");
  await expect(page.getByLabel("Operation preset").locator("option")).toHaveText(["Default", "UE", "Unity", "Maya"]);
});

for (const preset of ["default", "ue", "unity", "maya"] as const) test(`${preset} navigation preset applies wheel and pan gestures`, async ({ page }) => {
  await page.goto("/?stress=1");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Operation preset").selectOption(preset);
  await page.getByLabel("Timeline settings").click();
  const viewport = page.locator(".timeline-editor__viewport");
  const content = page.locator(".timeline-editor__content");
  const width = () => content.evaluate(el => el.getBoundingClientRect().width);
  const before = await width();
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 80);
  if (preset === "ue") await page.keyboard.down("Control");
  await page.mouse.wheel(0, -600);
  if (preset === "ue") await page.keyboard.up("Control");
  await expect.poll(width).toBeGreaterThan(before);
  await viewport.evaluate(el => { el.scrollLeft = 0; el.scrollTop = 0; });
  const readout = await page.getByRole("button", { name: "Current time" }).textContent();
  if (preset === "maya" || preset === "unity") await page.keyboard.down("Alt");
  const button = preset === "unity" ? "left" : preset === "ue" ? "right" : "middle";
  await page.mouse.move(box.x + 220, box.y + 80); await page.mouse.down({ button });
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 4 }); await page.mouse.up({ button });
  if (preset === "maya" || preset === "unity") await page.keyboard.up("Alt");
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeCloseTo(100, 0);
  await expect(page.getByRole("button", { name: "Current time" })).toHaveText(readout!);
});

test("loop UI hides while off and restores its existing interval", async ({ page }) => {
  await page.goto("/");
  const lane = page.getByLabel("Loop range", { exact: true });
  const band = page.locator(".timeline-editor__loop-region");
  await expect(lane).toHaveCount(0);
  await page.getByRole("button", { name: "Loop", exact: true }).click();
  const box = (await lane.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 2); await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 2, { steps: 4 }); await page.mouse.up();
  await expect(band).toBeVisible();
  const style = await band.getAttribute("style");
  await page.getByRole("button", { name: "Loop", exact: true }).click();
  await expect(lane).toHaveCount(0); await expect(band).toHaveCount(0);
  await page.getByRole("button", { name: "Loop", exact: true }).click();
  await expect(band).toHaveAttribute("style", style!);
});

for (const preset of ["ue", "maya"] as const) for (const dx of [100, -100]) test(`${preset} right drag zoom ${dx} anchors time and cancels without seeking`, async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Operation preset").selectOption(preset);
  await page.getByLabel("Timeline settings").click();
  const viewport = page.locator(".timeline-editor__viewport");
  const box = (await viewport.boundingBox())!;
  const view = () => viewport.evaluate(el => {
    const root = document.querySelector<HTMLElement>(".timeline-editor")!;
    const content = document.querySelector<HTMLElement>(".timeline-editor__content")!;
    const start = Number(root.dataset.viewStart), end = Number(root.dataset.viewEnd);
    const pps = content.getBoundingClientRect().width / (end - start);
    return { pps, start, end, anchor: start + (el.scrollLeft + 220) / pps };
  });
  const before = await view();
  await page.mouse.move(box.x + 220, box.y + 50);
  await page.keyboard.down("Alt");
  if (preset === "ue") await page.keyboard.down("Shift");
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + 220 + dx, box.y + 50, { steps: 5 });
  if (dx > 0) await expect.poll(async () => (await view()).pps).toBeGreaterThan(before.pps);
  else await expect.poll(async () => (await view()).pps).toBeLessThan(before.pps);
  expect((await view()).anchor).toBeCloseTo(before.anchor, 1);
  await page.keyboard.press("Escape");
  await page.mouse.up({ button: "right" });
  await page.keyboard.up("Alt");
  if (preset === "ue") await page.keyboard.up("Shift");
  await expect.poll(async () => (await view()).pps).toBeCloseTo(before.pps, 1);
  expect((await view()).anchor).toBeCloseTo(before.anchor, 1);
  expect((await view()).start).toBe(before.start);
  expect((await view()).end).toBe(before.end);
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "0.000");
});

test("rate fields accept free values, reject invalid input, and cancel with Escape", async ({ page }) => {
  await page.goto("/");
  const rate = page.getByRole("button", { name: "Playback rate", exact: true });
  await rate.click();
  let input = page.getByRole("spinbutton", { name: "Playback rate", exact: true });
  await input.fill("1.375"); await input.press("Enter");
  await expect(rate).toHaveText("1.375x");
  await rate.click();
  await input.fill("2.5"); await input.press("Escape");
  await expect(rate).toHaveText("1.375x");
  await page.getByLabel("Timeline settings").click();
  input = page.getByLabel("Playback speed");
  for (const invalid of ["", "0", "-1"]) {
    await input.fill(invalid); await input.press("Enter");
    await expect(input).toHaveValue("1.375");
    await expect(rate).toHaveText("1.375x");
  }
  await input.fill("6.125"); await page.getByLabel("Time display", { exact: true }).focus();
  await expect(rate).toHaveText("6.125x");
  await expect(input).toHaveValue("6.125");
});

test("saved Logic preferences fall back to Default", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("timeline-editor.demo.ui.v1", JSON.stringify({ timeline: { keyboardPreset: "logic" } })));
  await page.goto("/");
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Operation preset")).toHaveValue("default");
});
