import { test, expect, type Page } from "@playwright/test";
const row = (page: Page, name: string) => page.locator(".timeline-editor__row").filter({ has: page.locator(".timeline-editor__row-label", { hasText: new RegExp(`^${name}$`) }) });
async function beside(page: Page, from: string, to: string, after = false) {
  const target = row(page, to);
  const box = (await target.boundingBox())!;
  await row(page, from).locator(".timeline-editor__row-label").dragTo(target, { targetPosition: { x: 55, y: after ? box.height - 3 : 3 } });
}
const labels = (page: Page) => page.locator(".timeline-editor__row-label").allTextContents();

test("tracks reorder with stable names, undo, redo and persistence", async ({ page }) => {
  await page.goto("/");
  await beside(page, "Root Motion", "Audio 1");
  await expect.poll(() => labels(page)).toEqual(["Root Motion", "Audio 1"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => labels(page)).toEqual(["Audio 1", "Root Motion"]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(() => labels(page)).toEqual(["Root Motion", "Audio 1"]);
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: "Audio Track", exact: true }).click();
  await beside(page, "Audio 2", "Audio 1");
  await expect.poll(() => labels(page)).toEqual(["Root Motion", "Audio 2", "Audio 1"]);
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect.poll(() => labels(page)).toEqual(["Root Motion", "Audio 2", "Audio 1"]);
});

test("groups move with descendants, indent icons and preserve control alignment", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: "Group", exact: true }).click();
  await row(page, "Audio 1").locator(".timeline-editor__row-label").dragTo(row(page, "Group 1").locator(".timeline-editor__row-label"));
  await expect(row(page, "Audio 1")).toHaveAttribute("data-depth", "1");
  const childIcon = (await row(page, "Audio 1").locator(".timeline-editor__row-icon").boundingBox())!;
  const rootIcon = (await row(page, "Root Motion").locator(".timeline-editor__row-icon").boundingBox())!;
  expect(childIcon.x - rootIcon.x).toBe(16);
  await beside(page, "Group 1", "Root Motion");
  await expect.poll(() => labels(page)).toEqual(["Group 1", "Audio 1", "Root Motion"]);
  await beside(page, "Group 1", "Audio 1"); // Cannot become its own descendant.
  await expect(row(page, "Group 1")).toHaveAttribute("data-depth", "0");
  await beside(page, "Audio 1", "Root Motion", true);
  await expect(row(page, "Audio 1")).toHaveAttribute("data-depth", "0");
  await expect.poll(() => labels(page)).toEqual(["Group 1", "Root Motion", "Audio 1"]);
});

test("track mute and solo dim excluded clips without changing their Disable state", async ({ page }) => {
  await page.goto("/");
  const clip = page.getByRole("button", { name: "Clip Animation", exact: true });
  await page.getByRole("button", { name: "Mute Root Motion", exact: true }).click();
  await expect(clip).toHaveCSS("opacity", "0.4");
  await clip.dblclick({ position: { x: 40, y: 20 } });
  await expect(page.getByRole("checkbox", { name: "Disable", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Close properties" }).click();
  await page.getByRole("button", { name: "Mute Root Motion", exact: true }).click();
  await expect(clip).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  await page.getByRole("menuitem", { name: "Animation Track", exact: true }).click();
  await page.getByRole("button", { name: "Solo Animation 1", exact: true }).click();
  await expect(clip).toHaveCSS("opacity", "0.4");
  await page.getByRole("button", { name: "Solo Animation 1", exact: true }).click();
  await expect(clip).toHaveCSS("opacity", "1");
});
