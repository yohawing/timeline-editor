import { test, expect } from "@playwright/test";

test("auto scroll follows playback, stops when disabled, and saves the choice", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("timeline-editor.demo.ui.v1", JSON.stringify({ timeline: { pixelsPerSecond: 800 } })));
  await page.goto("/");
  const viewport = page.locator(".timeline-editor__viewport");
  const scrollLeft = () => viewport.evaluate(el => el.scrollLeft);
  await page.getByLabel("Timeline settings").click();
  const setting = page.getByRole("checkbox", { name: "Auto scroll" });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await page.getByLabel("Playback speed").fill("4");
  await page.getByLabel("Playback speed").press("Enter");
  await page.getByLabel("Timeline settings").click();
  const contentWidth = await page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(scrollLeft).toBeGreaterThan(100);
  expect(await page.locator(".timeline-editor__content").evaluate(el => el.getBoundingClientRect().width)).toBe(contentWidth);
  await page.getByLabel("Timeline settings").click();
  await setting.uncheck();
  const stoppedScroll = await scrollLeft();
  const time = Number(await page.getByLabel("Animation preview").getAttribute("data-time"));
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-time"))).toBeGreaterThan(time + 1.5);
  expect(await scrollLeft()).toBe(stoppedScroll);
  await page.getByLabel("Timeline settings").click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("timeline-editor.demo.ui.v1")!).timeline.autoScroll)).toBe(false);
});

test("saved follow mode leaves paused seeks alone and follows a loop back to its start", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("timeline-editor.demo.ui.v1")) localStorage.setItem("timeline-editor.demo.ui.v1", JSON.stringify({ timeline: { pixelsPerSecond: 800, autoScroll: true } }));
  });
  await page.goto("/");
  const viewport = page.locator(".timeline-editor__viewport");
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByRole("checkbox", { name: "Auto scroll" })).toBeChecked();
  await page.getByLabel("Timeline settings").click();
  await page.getByRole("button", { name: "Current time" }).click();
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).fill("240");
  await page.getByRole("spinbutton", { name: "Current frame", exact: true }).press("Enter");
  await expect(page.getByLabel("Animation preview")).toHaveAttribute("data-time", "10.000");
  expect(await viewport.evaluate(el => el.scrollLeft)).toBe(0);
  await page.getByRole("button", { name: "Loop", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(7000);
  await expect.poll(async () => Number(await page.getByLabel("Animation preview").getAttribute("data-time"))).toBeLessThan(2);
  await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeLessThan(1600);
  await expect(page.getByRole("region", { name: "Timeline editor" })).toHaveAttribute("data-view-start", "0");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.reload();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByRole("checkbox", { name: "Auto scroll" })).toBeChecked();
});
