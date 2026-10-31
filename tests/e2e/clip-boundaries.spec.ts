import { test, expect } from "@playwright/test";

test("clipped clip edges remain open, including the selection outline, and real ends restore", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("timeline-editor.demo.ui.v1", JSON.stringify({ timeline: { pixelsPerSecond: 200 } })));
  await page.goto("/");
  const clip = page.getByRole("button", { name: "Clip Animation", exact: true });
  const viewport = page.locator(".timeline-editor__viewport");
  const edge = (side: "Left" | "Right", pseudo = false) => clip.evaluate((el, { side, pseudo }) => {
    const style = getComputedStyle(el, pseudo ? "::after" : null);
    return { border: style.getPropertyValue(`border-${side.toLowerCase()}-width`), radius: style.getPropertyValue(`border-top-${side.toLowerCase()}-radius`) };
  }, { side, pseudo });
  await expect(clip).toHaveAttribute("data-clipped-end", "true");
  expect(await edge("Right")).toEqual({ border: "0px", radius: "0px" });
  expect(await edge("Left")).toEqual({ border: "1px", radius: "3px" });
  await expect(clip.locator('[data-trim-edge="end"]')).toHaveCount(0);
  await clip.click({ position: { x: 50, y: 10 } });
  await expect(clip).toHaveClass(/is-selected/);
  expect(await edge("Right", true)).toEqual({ border: "0px", radius: "0px" });
  await viewport.evaluate(el => { el.scrollLeft = 400; });
  await expect(clip).toHaveAttribute("data-clipped-start", "true");
  expect(await edge("Left")).toEqual({ border: "0px", radius: "0px" });
  expect(await edge("Left", true)).toEqual({ border: "0px", radius: "0px" });
  await expect(clip.locator('[data-trim-edge="start"]')).toHaveCount(0);
  await viewport.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(clip).not.toHaveAttribute("data-clipped-end", "true");
  expect(await edge("Right")).toEqual({ border: "1px", radius: "3px" });
  expect(await edge("Right", true)).toEqual({ border: "1px", radius: "3px" });
  await expect(clip.locator('[data-trim-edge="end"]')).toHaveCount(1);
  await expect(clip).toHaveAttribute("data-start", "0");
  await expect(clip).toHaveAttribute("data-end", "12");
});
