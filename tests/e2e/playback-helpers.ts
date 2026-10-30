import { expect, type Page } from "@playwright/test";

export async function setPlaybackEdge(page: Page, edge: "start" | "end", time: number) {
  const handle = page.getByRole("slider", { name: `Playback range ${edge}`, exact: true });
  const before = Number(await handle.getAttribute("aria-valuenow"));
  const editor = page.getByRole("region", { name: "Timeline editor" });
  const duration = Number(await editor.getAttribute("data-view-end")) - Number(await editor.getAttribute("data-view-start"));
  const content = (await page.locator(".timeline-editor__content").boundingBox())!;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + (time - before) * content.width / duration, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeCloseTo(time, 6);
}
