import { test, expect, type Page } from "@playwright/test";

async function importAudio(page: Page) {
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.evaluate(async () => {
    const module = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const transfer = new DataTransfer();
    transfer.items.add(new File([module.clickTrack()], "retained.wav", { type: "audio/wav" }));
    const viewport = document.querySelector<HTMLElement>(".timeline-editor__viewport")!;
    const box = viewport.getBoundingClientRect();
    viewport.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.left + 5, clientY: box.top + 12 }));
  });
  await expect(page.getByRole("button", { name: "Clip retained.wav", exact: true })).toBeVisible();
}

test("UI reset restores defaults without losing imported audio or undo history", async ({ page }) => {
  await page.goto("/");
  await importAudio(page);
  await page.getByRole("button", { name: "Snap to frames" }).click();
  await page.getByRole("separator", { name: "Track panel width" }).press("ArrowRight");
  await page.getByLabel("Timeline settings").click();
  await page.getByLabel("Operation preset").selectOption("maya");
  await page.getByLabel("Time display", { exact: true }).selectOption("seconds");
  await page.getByLabel("Auto scroll").check();
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.getByLabel("Frame rate", { exact: true }).fill("60");
  await page.getByLabel("Frame rate", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Reset UI settings", exact: true }).click();
  await expect(page.locator(".timeline-editor")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Snap to frames" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("separator", { name: "Track panel width" })).toHaveAttribute("aria-valuenow", "212");
  await expect(page.getByRole("button", { name: "Clip retained.wav", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Operation preset")).toHaveValue("default");
  await expect(page.getByLabel("Time display", { exact: true })).toHaveValue("frames");
  await expect(page.getByLabel("Auto scroll")).not.toBeChecked();
  await expect(page.getByLabel("Frame rate", { exact: true })).toHaveValue("24");
  await page.getByLabel("Timeline settings").click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clip retained.wav", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect(page.getByRole("button", { name: "Clip retained.wav", exact: true })).toBeVisible();
  await page.getByLabel("Timeline settings").click();
  await expect(page.getByLabel("Operation preset")).toHaveValue("default");
});

test("project reset confirms, preserves UI, supports Undo, and persists the reset", async ({ page }) => {
  await page.goto("/");
  await importAudio(page);
  const clip = page.getByRole("button", { name: "Clip retained.wav", exact: true });
  await page.getByRole("button", { name: "Snap to frames" }).click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Reset project", exact: true }).click();
  await expect(clip).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset project", exact: true }).click();
  await expect(clip).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Snap to frames" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(clip).toBeVisible();
  await expect(clip.locator(".timeline-editor__waveform path")).not.toHaveAttribute("d", "");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(clip).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-project-state", "ready");
  await expect(clip).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clip Animation", exact: true })).toBeVisible();
});
