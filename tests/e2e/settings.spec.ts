import { test, expect } from "@playwright/test";

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
  await page.getByLabel("Playback speed").selectOption("2");
  await page.getByLabel("Playback speed").press("Escape");
  await expect(panel).not.toBeVisible();
  await settings.click();
  await page.getByLabel("Animation preview").click();
  await expect(panel).not.toBeVisible();
});

test("numeric time, range and FPS settings drive the host preview", async ({ page }) => {
  await page.goto("/?fps=30");
  const readout = page.getByRole("button", { name: "Current time" });
  await readout.dblclick();
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).fill("75");
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).press("Enter");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "2.500");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Frame rate", { exact: true }).selectOption("60");
  await expect(readout).toContainText("0150");
  const start = page.getByLabel("Playback start time");
  await start.fill("60"); await start.press("Enter");
  await expect(page.getByRole("slider", { name: "Playback range start", exact: true })).toHaveAttribute("aria-valuenow", "1");
  await page.getByLabel("Playback speed").selectOption("0.5");
  await expect(page.getByRole("button", { name: "Playback rate", exact: true })).toHaveText("0.5x");
  await page.getByRole("button", { name: "Toggle time display" }).click();
  await page.getByLabel("Timeline settings").click();
  await readout.dblclick();
  const seconds = page.getByRole("spinbutton", { name: "Current seconds", exact: true });
  await seconds.fill("3.5"); await seconds.press("Enter");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "3.500");
});

test("keyboard presets change shortcuts and survive reload", async ({ page }) => {
  await page.goto("/");
  const viewport = page.getByRole("application", { name: "Timeline scrubber" });
  for (const [preset, next] of [["unity", "."], ["maya", "Alt+."]] as const) {
    await page.getByLabel("Timeline settings").click();
    await page.getByLabel("Keyboard preset").selectOption(preset);
    await page.getByLabel("Timeline settings").click();
    await page.getByRole("button", { name: "Skip to start", exact: true }).click();
    await viewport.press(next);
    await expect(page.getByRole("button", { name: "Current time" })).toContainText("0001");
  }
  await page.reload();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Keyboard preset")).toHaveValue("maya");
  await page.getByLabel("Keyboard preset").selectOption("logic");
  await page.getByLabel("Timeline settings").click();
  await viewport.press("c");
  await expect(page.getByRole("button", { name: "Loop", exact: true })).toHaveClass(/is-active/);
  await viewport.press("Enter");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0000");
});
