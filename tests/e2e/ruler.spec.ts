import { expect, test, type Page } from "@playwright/test";

async function inspectLabels(page: Page, mode: "frames" | "seconds" = "frames") {
  const labels = page.locator(".timeline-editor__tick:not([aria-hidden])");
  await expect(labels.first()).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const ruler = document.querySelector(".timeline-editor__ruler")!.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".timeline-editor__tick:not([aria-hidden])")].map(label => label.getBoundingClientRect());
    return labels.every((label, i) => label.left >= ruler.left - 1 && label.right <= ruler.right + 1 && (i === 0 || labels[i - 1].right + 3 <= label.left));
  })).toBe(true);
  for (const text of await labels.allTextContents()) {
    if (mode === "frames") {
      expect(text).toMatch(/^-?\d+$/);
      expect(text).not.toMatch(/^-?0\d/);
    } else {
      expect(text).toMatch(/s$/);
    }
  }
}

for (const frames of [120, 10000, 100000, 600000]) {
  for (const width of [320, 1000]) {
    test(`readable ${frames}-frame ruler at ${width}px through zoom, pan and resize`, async ({ page }) => {
      await page.setViewportSize({ width, height: 400 });
      await page.goto(`/ruler.html?frames=${frames}`);
      await inspectLabels(page);
      expect(await page.locator(".timeline-editor__tick:not([aria-hidden])").first().textContent()).toBe("0");
      const ruler = page.locator(".timeline-editor__ruler");
      const bounds = (await ruler.boundingBox())!;
      const content = page.locator(".timeline-editor__content");
      const beforeZoom = await content.evaluate(element => element.getBoundingClientRect().width);
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 4);
      await page.mouse.wheel(0, 900);
      await expect.poll(() => content.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(beforeZoom);
      await inspectLabels(page);
      const viewport = page.locator(".timeline-editor__viewport");
      const beforePan = await viewport.evaluate(element => element.scrollLeft);
      await page.mouse.wheel(180, 0);
      await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforePan);
      await inspectLabels(page);
      await page.setViewportSize({ width: width === 320 ? 1000 : 320, height: 400 });
      await inspectLabels(page);
      await page.addStyleTag({ content: ".timeline-editor__tick { font-size: 18px !important; }" });
      await expect.poll(() => page.locator(".timeline-editor__tick--measure").evaluate(element => getComputedStyle(element).fontSize)).toBe("18px");
      await inspectLabels(page);
      await page.getByRole("button", { name: "Toggle time display" }).click();
      await inspectLabels(page, "seconds");
    });
  }
}
