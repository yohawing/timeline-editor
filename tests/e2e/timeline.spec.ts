import { expect, test } from "@playwright/test";

test("renders full timeline and transport target selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".timeline-editor--full")).toBeVisible();
  await expect(page.locator("canvas.timeline-editor__canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  const target = page.getByRole("button", { name: /Select playback target Root Motion/ });
  await target.click();
  await expect(target).toHaveAttribute("aria-pressed", "true");
});

test("supports compact variant, FPS formatting and display switch", async ({ page }) => {
  await page.goto("/?variant=compact&fps=30");
  await expect(page.locator(".timeline-editor--compact")).toBeVisible();
  await expect(page.locator(".timeline-editor__fps")).toContainText("30 fps");
  const readout = page.getByRole("button", { name: "Toggle time display" });
  await expect(readout).toContainText("f");
  await readout.click();
  await expect(readout).toContainText("s");
});

test("updates Canvas layout when zoom changes", async ({ page }) => {
  await page.goto("/");
  const zoom = page.getByRole("slider", { name: "Timeline zoom" });
  const content = page.locator(".timeline-editor__content");
  const before = await content.evaluate((element) => element.getBoundingClientRect().width);
  await zoom.fill("90");
  await expect.poll(() => content.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(before);
});

test("repaints for ResizeObserver and device-pixel-ratio changes", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("canvas.timeline-editor__canvas");
  const initial = await canvas.evaluate((element) => ({
    width: element.width,
    cssWidth: Number.parseFloat(getComputedStyle(element).width),
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => canvas.evaluate((element) => Number.parseFloat(getComputedStyle(element).width))).toBeGreaterThan(initial.cssWidth);
  await page.evaluate(() => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => canvas.evaluate((element) => element.width)).toBeGreaterThan(initial.width);
  await expect.poll(async () => {
    const value = await canvas.evaluate((element) => ({ width: element.width, cssWidth: Number.parseFloat(getComputedStyle(element).width) }));
    return Math.abs(value.width - Math.round(value.cssWidth * 2)) <= 1;
  }).toBe(true);
});

test("scrub pointer capture and cancel restore the origin", async ({ page }) => {
  await page.goto("/");
  const viewport = page.locator(".timeline-editor__viewport");
  const readout = page.getByRole("button", { name: "Toggle time display" });
  const before = await readout.textContent();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 60, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 30);
  await viewport.dispatchEvent("pointercancel", { pointerId: 1, bubbles: true });
  await page.mouse.up();
  await expect(readout).toHaveText(before ?? "");
});

test("disables transport and keeps finite layout for malformed host playback", async ({ page }) => {
  await page.goto("/?malformed=1");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
  await expect(page.locator(".timeline-editor")).not.toContainText("NaN");
  await expect(page.locator(".timeline-editor")).not.toContainText("Infinity");
});

test("reports an asynchronous transport rejection", async ({ page }) => {
  const rejection = page.waitForEvent("console", (message) => message.text().includes("Playback command failed"));
  await page.goto("/?reject=1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await rejection;
});

test("stress mode queries only a bounded virtualized page", async ({ page }) => {
  await page.goto("/?stress=1");
  await page.waitForFunction(() => Boolean((globalThis as { __timelinePerf?: unknown }).__timelinePerf));
  const summary = await page.evaluate(() => (globalThis as { __timelinePerf?: { rowsPainted: number; keysPainted: number } }).__timelinePerf);
  expect(summary?.rowsPainted).toBeLessThanOrEqual(80);
  expect(summary?.keysPainted).toBeLessThan(20_000);
});
