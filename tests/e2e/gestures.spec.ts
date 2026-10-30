import { test, expect } from "@playwright/test";

test("playback handles preview, commit once, cancel, and restore after reload", async ({ page }) => {
  await page.goto("/");
  const end = page.getByRole("slider", { name: "Playback range end", exact: true });
  const out = page.getByRole("spinbutton", { name: "Playback end", exact: true });
  const box = (await end.boundingBox())!;
  const width = (await page.locator(".timeline-editor__content").boundingBox())!.width;
  await page.mouse.move(box.x + 4, box.y + 6); await page.mouse.down();
  await page.mouse.move(box.x + 4 - width / 3, box.y + 6, { steps: 5 });
  await expect(end).toHaveAttribute("aria-valuetext", "192 f");
  await expect(out).toHaveValue("288");
  await page.mouse.up(); await expect(out).toHaveValue("192");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(out).toHaveValue("288");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(out).toHaveValue("192");
  const next = (await end.boundingBox())!;
  await page.mouse.move(next.x + 4, next.y + 6); await page.mouse.down();
  await page.mouse.move(next.x - 80, next.y + 6); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(end).toHaveAttribute("aria-valuetext", "192 f");
  const start = page.getByRole("slider", { name: "Playback range start", exact: true });
  await start.focus(); await start.press("ArrowRight");
  await expect(page.getByRole("spinbutton", { name: "Playback start", exact: true })).toHaveValue("1");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect(out).toHaveValue("192");
  await expect(start).toHaveAttribute("aria-valuetext", "1 f");
  const input = page.getByRole("spinbutton", { name: "Playback start", exact: true });
  await input.fill("0"); await input.press("Enter");
  await out.fill("1"); await out.press("Enter");
  await start.focus(); await start.press("ArrowRight");
  await end.focus(); await end.press("ArrowLeft");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(out).toHaveValue("192");
});

test("middle drag over a clip pans without moving the clip or seeking; Escape cancels", async ({ page }) => {
  await page.goto("/");
  const ruler = (await page.locator(".timeline-editor__ruler").boundingBox())!;
  await page.mouse.move(ruler.x + 100, ruler.y + 5); await page.mouse.wheel(0, -900);
  const viewport = page.locator(".timeline-editor__viewport");
  await viewport.evaluate(element => { element.scrollLeft = 0; });
  await expect.poll(() => viewport.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(200);
  const clip = page.getByRole("button", { name: "Clip Animation", exact: true });
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 20); await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 80, box.y + 20, { steps: 4 }); await page.mouse.up({ button: "middle" });
  await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeCloseTo(120, 0);
  await expect(clip).toHaveAttribute("data-start", "0");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "0.000");
  await page.mouse.move(box.x + 200, box.y + 20); await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 150, box.y + 20); await page.keyboard.press("Escape"); await page.mouse.up({ button: "middle" });
  await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeCloseTo(120, 0);
});

test("middle pan also scrolls rows and keeps the track tree aligned", async ({ page }) => {
  await page.goto("/?stress=1");
  const viewport = page.locator(".timeline-editor__viewport");
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 150, box.y + 150); await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 150, box.y + 50); await page.mouse.up({ button: "middle" });
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(100);
  await expect.poll(() => page.locator(".timeline-editor__tree-viewport").evaluate(element => element.scrollTop)).toBe(100);
});

test("loop boundaries respect trim offset and disabled clips stay editable", async ({ page }) => {
  await page.goto("/");
  const clip = page.getByRole("button", { name: "Clip Animation", exact: true });
  await clip.dblclick({ position: { x: 40, y: 20 } });
  const start = page.getByRole("spinbutton", { name: "Clip start", exact: true });
  await start.fill("48"); await start.press("Enter");
  await page.getByRole("checkbox", { name: "Loop", exact: true }).check();
  const end = page.getByRole("spinbutton", { name: "Clip end", exact: true });
  await end.fill("720"); await end.press("Enter");
  const boundaries = clip.locator(".timeline-editor__clip-loop-boundary");
  await expect(boundaries).toHaveCount(2);
  const positions = await boundaries.evaluateAll(elements => elements.map(element => parseFloat((element as HTMLElement).style.left)));
  const width = (await clip.boundingBox())!.width;
  expect(positions[0] / width).toBeCloseTo(10 / 28, 2);
  expect(positions[1] / width).toBeCloseTo(22 / 28, 2);
  await page.getByRole("checkbox", { name: "Disable", exact: true }).check();
  await expect(clip).toHaveCSS("opacity", "0.4");
  await expect(clip).toHaveAttribute("title", /Disabled/);
  await page.screenshot({ path: test.info().outputPath("loop-disabled.png") });
  await page.getByRole("button", { name: "Close properties" }).click();
  await clip.dblclick({ position: { x: 40, y: 20 } });
  await page.getByRole("checkbox", { name: "Disable", exact: true }).uncheck();
  await expect(clip).toHaveCSS("opacity", "1");
});
