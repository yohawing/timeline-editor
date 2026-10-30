import { test, expect } from "@playwright/test";

test("track names edit with commit and cancel; controls stay legible and labelled", async ({ page }) => {
  await page.goto("/");
  const label = page.locator(".timeline-editor__row-label").filter({ hasText: "Root Motion" });
  await expect(label).toHaveCSS("font-size", "12px");
  await expect(label).toHaveCSS("font-weight", "600");
  await expect(page.getByRole("button", { name: "Mute Root Motion", exact: true })).toHaveCSS("font-size", "12px");
  const geometry = await label.evaluate(element => {
    const strip = element.parentElement!.querySelector(".timeline-editor__row-color")!.getBoundingClientRect();
    const row = element.parentElement!.getBoundingClientRect();
    return { gap: element.getBoundingClientRect().left - strip.right, height: strip.height, rowHeight: row.height };
  });
  expect(geometry.gap).toBe(5);
  expect(Math.abs(geometry.height - geometry.rowHeight)).toBeLessThanOrEqual(1);
  await label.dblclick();
  await page.getByRole("textbox", { name: "Track name" }).fill("Walk");
  await page.getByRole("textbox", { name: "Track name" }).press("Enter");
  await expect(page.getByRole("button", { name: "Mute Walk", exact: true })).toBeVisible();
  await page.locator(".timeline-editor__row-label").filter({ hasText: "Walk" }).dblclick();
  await page.getByRole("textbox", { name: "Track name" }).fill("Cancelled");
  await page.getByRole("textbox", { name: "Track name" }).press("Escape");
  await expect(page.getByRole("button", { name: "Mute Walk", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add track", exact: true }).click();
  const missing = await page.locator('button, [role="button"], [role="menuitem"]').evaluateAll(elements => elements.filter(element => !element.getAttribute("title")?.trim()).map(element => element.outerHTML));
  expect(missing).toEqual([]);
});

test("layout and timeline preferences survive reload; invalid storage is ignored", async ({ page }) => {
  await page.goto("/");
  const split = page.getByRole("separator", { name: "Preview and timeline height" });
  await split.focus();
  await split.press("ArrowUp");
  await split.press("ArrowUp");
  const height = await split.getAttribute("aria-valuenow");
  const tree = page.getByRole("separator", { name: "Track panel width" });
  await tree.focus();
  await tree.press("ArrowRight");
  await expect(tree).toHaveAttribute("aria-valuenow", "222");
  await page.getByRole("button", { name: "Snap to frames" }).click();
  await page.getByRole("button", { name: "Toggle time display" }).click();
  await page.reload();
  await expect(split).toHaveAttribute("aria-valuenow", height!);
  await expect(tree).toHaveAttribute("aria-valuenow", "222");
  await expect(page.getByRole("button", { name: "Snap to frames" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("timeline-editor.demo.ui.v1")!).timeline.displayMode)).toBe("seconds");
  await page.evaluate(() => localStorage.setItem("timeline-editor.demo.ui.v1", "{broken"));
  await page.reload();
  await expect(tree).toHaveAttribute("aria-valuenow", "212");
  await expect(page.getByRole("button", { name: "Snap to frames" })).toHaveAttribute("aria-pressed", "true");
});

test("preview splitter drags, cancels and resets", async ({ page }) => {
  await page.goto("/");
  const split = page.getByRole("separator", { name: "Preview and timeline height" });
  const original = Number(await split.getAttribute("aria-valuenow"));
  const box = (await split.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y - 60 + box.height / 2);
  await expect(split).toHaveAttribute("aria-valuenow", String(original - 60));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(split).toHaveAttribute("aria-valuenow", String(original));
  await split.press("ArrowUp");
  await split.press("Home");
  await expect(split).toHaveAttribute("aria-valuenow", String(original));
});

test("stress fixture labels do not advertise unsupported rename", async ({ page }) => {
  await page.goto("/?stress=1");
  const label = page.locator(".timeline-editor__row-label").first();
  await expect(label).not.toHaveAttribute("title", /Double-click/);
  await label.dblclick();
  await expect(page.getByRole("textbox", { name: "Track name" })).toHaveCount(0);
});
