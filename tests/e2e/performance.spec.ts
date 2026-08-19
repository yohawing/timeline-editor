import { expect, test } from "@playwright/test";

test("500-row/100k-key Canvas paint p95 reference gate", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/?stress=1");
  await page.waitForFunction(() => Boolean((globalThis as { __timelinePerf?: unknown }).__timelinePerf));
  await page.waitForTimeout(500);
  const samples = await page.evaluate(() => {
    const values = (globalThis as { __timelinePerfSamples?: Array<{ paintMs: number }> }).__timelinePerfSamples ?? [];
    return values.map((sample) => sample.paintMs);
  });
  expect(samples.length).toBeGreaterThan(0);
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)];
  expect(p95).toBeLessThanOrEqual(8);
});
