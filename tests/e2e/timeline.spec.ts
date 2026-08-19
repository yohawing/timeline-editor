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

test("stress mode queries only a bounded virtualized page", async ({ page }) => {
  await page.goto("/?stress=1");
  await page.waitForFunction(() => Boolean((globalThis as { __timelinePerf?: unknown }).__timelinePerf));
  const summary = await page.evaluate(() => (globalThis as { __timelinePerf?: { rowsPainted: number; keysPainted: number } }).__timelinePerf);
  expect(summary?.rowsPainted).toBeLessThanOrEqual(80);
  expect(summary?.keysPainted).toBeLessThan(20_000);
});
