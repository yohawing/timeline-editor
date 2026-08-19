import { expect, test } from "@playwright/test";

test("500-row/100k-key Canvas paint p95 reference gate", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?stress=1");
  await page.waitForFunction(() => Boolean((globalThis as { __timelinePerf?: unknown }).__timelinePerf));

  // Startup includes module evaluation, font setup, and the first backing-store
  // allocation. The 8 ms budget is the steady-state Canvas paint contract, so
  // warm the viewport once and then sample deterministic visible-page scrolls.
  const viewport = page.locator(".timeline-editor__viewport");
  for (const top of [26, 52, 78, 104]) {
    await viewport.evaluate((element, scrollTop) => {
      element.scrollTop = scrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, top);
  }
  await page.evaluate(() => {
    (globalThis as { __timelinePerfSamples?: Array<{ paintMs: number }> }).__timelinePerfSamples = [];
  });
  const sampleCount = 40;
  for (let index = 0; index < sampleCount; index += 1) {
    await viewport.evaluate((element, scrollTop) => {
      element.scrollTop = scrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, index % 2 === 0 ? 130 : 156);
    await page.waitForFunction(
      (minimum) => ((globalThis as { __timelinePerfSamples?: unknown[] }).__timelinePerfSamples?.length ?? 0) >= minimum,
      index + 1,
    );
  }
  const samples = await page.evaluate(() => {
    const values = (globalThis as { __timelinePerfSamples?: Array<{ paintMs: number }> }).__timelinePerfSamples ?? [];
    return values.map((sample) => sample.paintMs);
  });
  expect(samples.length).toBeGreaterThanOrEqual(sampleCount);
  const sorted = samples.slice(-sampleCount).sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)];
  expect(p95).toBeLessThanOrEqual(8);
});
