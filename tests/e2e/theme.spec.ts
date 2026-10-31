import { test, expect, type Page } from "@playwright/test";

async function rowPixel(page: Page) {
  return page.locator(".timeline-editor__canvas").evaluate((canvas: HTMLCanvasElement) => {
    const dpr = canvas.width / canvas.getBoundingClientRect().width;
    return Array.from(canvas.getContext("2d")!.getImageData(Math.floor(23 * dpr), Math.floor(10 * dpr), 1, 1).data);
  });
}

test("Canvas and DOM follow ancestor themes and live stylesheet/inline changes", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
  await page.addStyleTag({ content: `body[data-test-theme="light"] .timeline-editor {
    --timeline-row-even: rgb(240, 245, 250);
    --timeline-clip-text: rgb(10, 20, 30);
    --timeline-surface-2: rgb(230, 235, 240);
  }` });
  await page.evaluate(() => document.body.setAttribute("data-test-theme", "light"));
  await expect.poll(() => rowPixel(page)).toEqual([240, 245, 250, 255]);
  await expect(page.locator(".timeline-editor__editable-clip > span").first()).toHaveCSS("color", "rgb(10, 20, 30)");
  await expect(page.locator(".timeline-editor__header")).toHaveCSS("background-color", "rgb(230, 235, 240)");
  await page.locator(".timeline-editor").evaluate((element: HTMLElement) => element.style.setProperty("--timeline-row-even", "rgb(55, 66, 77)"));
  await expect.poll(() => rowPixel(page)).toEqual([55, 66, 77, 255]);
  await page.locator(".timeline-editor").evaluate((element: HTMLElement) => element.style.removeProperty("--timeline-row-even"));
  await page.evaluate(() => document.body.removeAttribute("data-test-theme"));
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
  const style = await page.addStyleTag({ content: ".timeline-editor { --timeline-row-even: rgb(70, 80, 90); }" });
  await expect.poll(() => rowPixel(page)).toEqual([70, 80, 90, 255]);
  await style.evaluate(element => { element.textContent = ".timeline-editor { --timeline-row-even: rgb(80, 90, 100); }"; });
  await expect.poll(() => rowPixel(page)).toEqual([80, 90, 100, 255]);
  await page.locator(".example-preview canvas").evaluate((canvas: HTMLCanvasElement) => canvas.style.setProperty("--example-preview-bg", "rgb(120, 130, 140)"));
  await expect.poll(() => page.locator(".example-preview canvas").evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext("2d")!.getImageData(10, 100, 1, 1).data))).toEqual([120, 130, 140, 255]);
  await page.screenshot({ path: test.info().outputPath("theme-override.png") });
});

test("Canvas follows color-scheme media changes without a timeline interaction", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.addStyleTag({ content: `@media (prefers-color-scheme: dark) { .timeline-editor { --timeline-row-even: rgb(45, 35, 25); } }` });
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => rowPixel(page)).toEqual([45, 35, 25, 255]);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
});

test("Canvas catches the final color of an ancestor theme transition", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: `
    @property --host-row-color { syntax: "<color>"; inherits: true; initial-value: rgb(28, 30, 37); }
    body { transition: --host-row-color 150ms linear; }
    .timeline-editor { --timeline-row-even: var(--host-row-color); }
  ` });
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
  await page.evaluate(() => document.body.style.setProperty("--host-row-color", "rgb(210, 220, 230)"));
  await expect.poll(() => rowPixel(page)).toEqual([210, 220, 230, 255]);
});


test("built-in light theme preserves the Canvas and view during switching", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".timeline-editor");
  const canvas = page.locator(".timeline-editor__canvas");
  await expect(editor).toHaveAttribute("data-theme", "dark");
  await canvas.evaluate(node => { node.dataset.identity = "same"; });
  const ruler = page.locator(".timeline-editor__ruler");
  await ruler.click({ position: { x: 200, y: 4 } });
  const readout = await page.getByRole("button", { name: "Current time" }).textContent();
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByLabel("Timeline settings").click();
  await expect(editor).toHaveAttribute("data-theme", "light");
  await expect(editor).toHaveCSS("color-scheme", "light");
  await expect.poll(() => rowPixel(page)).toEqual([244, 246, 247, 255]);
  await expect(canvas).toHaveAttribute("data-identity", "same");
  await expect(page.getByRole("button", { name: "Current time" })).toHaveText(readout!);
  await page.getByRole("button", { name: "Clip Animation", exact: true }).dblclick();
  const input = page.locator(".timeline-editor__inspector input").first();
  await expect(input).toHaveCSS("background-color", "rgb(248, 250, 251)");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByLabel("Timeline settings").click();
  await expect.poll(() => rowPixel(page)).toEqual([28, 30, 37, 255]);
  await expect(input).toHaveCSS("background-color", "rgb(19, 19, 22)");
});

test("compact light mode supports transport and target selection", async ({ page }) => {
  await page.goto("/?theme=light&variant=compact");
  await expect(page.locator(".timeline-editor--compact")).toHaveAttribute("data-theme", "light");
  const target = page.getByRole("button", { name: /Select playback target Root Motion/ });
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("legacy Canvas custom properties still repaint", async ({ page }) => {
  await page.goto("/");
  await page.locator(".timeline-editor").evaluate((element: HTMLElement) => element.style.setProperty("--timeline-canvas-row-even", "rgb(90, 100, 110)"));
  await expect.poll(() => rowPixel(page)).toEqual([90, 100, 110, 255]);
});


test("object waveforms restore and invalid sampling intervals are rejected", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    await storage.writeProject("default", { version: 1, document: {
      tracks: [{ id: "legacy-animation", type: "animation", label: "Legacy" }],
      clips: [{ kind: "clip", id: "legacy-clip", rowId: "legacy-animation", label: "Object waveform", color: "#58658d", range: { start: 0, end: 4 }, waveform: { peaks: [0, 1, .5, 0], sampleDuration: 1 } }]
    }, audio: [] });
  });
  await page.reload();
  const clip = page.getByRole("button", { name: "Clip Object waveform", exact: true });
  await expect(clip.locator(".timeline-editor__waveform path")).toHaveAttribute("d", /v28/);
  const rejected = await page.evaluate(async () => {
    const storage = await import(/* @vite-ignore */ "/src/projectStorage.ts");
    const project = await storage.readProject("default");
    project.document.clips[0].waveform.sampleDuration = 0;
    await storage.writeProject("invalid-waveform", project);
    try { await storage.readProject("invalid-waveform"); return false; } catch { return true; }
  });
  expect(rejected).toBe(true);
});
