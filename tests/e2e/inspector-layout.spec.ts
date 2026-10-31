import { test, expect } from "@playwright/test";

test("properties stay inside TimelineEditor and leave the preview unchanged", async ({ page }) => {
  await page.goto("/");
  const preview = page.locator(".example-preview");
  const before = await preview.boundingBox();
  await page.getByRole("button", { name: "Clip Animation", exact: true }).dblclick({ position: { x: 40, y: 20 } });
  const editor = page.getByRole("region", { name: "Timeline editor" });
  const panel = editor.getByRole("complementary", { name: "Clip properties" });
  await expect(panel).toBeVisible();
  expect(await preview.boundingBox()).toEqual(before);
  const editorBox = (await editor.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(editorBox.y + 24);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width + 1);
  const rows = await page.locator(".timeline-editor__row").evaluateAll(elements => elements.map(row => {
    const center = (element: Element) => { const r = element.getBoundingClientRect(); return (r.top + r.bottom) / 2; };
    const title = row.querySelector(".timeline-editor__row-label")!;
    return { icon: center(row.querySelector(".timeline-editor__row-icon svg")!) - center(title),
      buttons: [...row.querySelectorAll("button")].map(button => center(button) - center(title)),
      x: [...row.querySelectorAll(".example-track-action")].map(button => button.getBoundingClientRect().x) };
  }));
  for (const row of rows) { expect(Math.abs(row.icon)).toBeLessThan(0.1); row.buttons.forEach(delta => expect(Math.abs(delta)).toBeLessThan(0.1)); }
  expect(rows[0].x).toEqual(rows[1].x);
  await page.screenshot({ path: test.info().outputPath("integrated-inspector.png") });
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(panel).toHaveCount(0);
  expect(await preview.boundingBox()).toEqual(before);
});

test("narrow editor contains the inspector and its close control", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Clip Animation", exact: true }).dblclick({ position: { x: 40, y: 20 } });
  const inspector = page.locator(".timeline-editor__inspector");
  const rect = (await inspector.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(400);
  await expect(page.getByRole("button", { name: "Close properties" })).toBeInViewport();
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(inspector).toHaveCount(0);
});
