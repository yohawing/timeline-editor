import { test, expect } from "@playwright/test";

test("transport works initially, from preview, and after toolbar clicks without double actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip to start", exact: true }).click();
  await page.getByLabel("Animation preview").click();
  await expect(page.locator(".example-preview")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0001");
  await page.getByRole("button", { name: "Next frame", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0003");
  const loop = page.getByRole("button", { name: "Loop", exact: true });
  await loop.click();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(loop).toHaveClass(/is-active/);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(loop).toHaveClass(/is-active/);
});

test("settings inputs and numeric time editing retain their keys", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Timeline settings").click();
  const fps = page.getByLabel("Frame rate", { exact: true });
  await fps.focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0000");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByLabel("Timeline settings").click();
  await page.getByRole("button", { name: "Current time" }).click();
  const frame = page.getByRole("spinbutton", { name: "Current frame", exact: true });
  await frame.fill("12"); await frame.press("ArrowLeft"); await frame.press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await frame.press("Escape");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0000");
});

test("document shortcuts follow the selected preset without timeline focus", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Operation preset").selectOption("maya");
  await page.getByLabel("Animation preview").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0000");
  await page.keyboard.press("Alt+.");
  await expect(page.getByRole("button", { name: "Current time" })).toContainText("0001");
});
