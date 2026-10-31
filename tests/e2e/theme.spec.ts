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
