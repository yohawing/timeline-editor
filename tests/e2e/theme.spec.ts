import { expect, test } from '@playwright/test';

test('switches DOM and Canvas together without remounting or resetting the view', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Timeline editor' });
  const canvas = page.locator('.timeline-editor__canvas');
  const pixel = () => canvas.evaluate((node: HTMLCanvasElement) => {
    const dpr = node.width / node.getBoundingClientRect().width;
    return Array.from(node.getContext('2d')!.getImageData(Math.round(17*dpr), Math.round(13*dpr), 1, 1).data).slice(0,3);
  });
  await expect(editor).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await pixel())[0]).toBeLessThan(60);
  const ruler = page.locator('.timeline-editor__ruler');
  const rulerBox = (await ruler.boundingBox())!;
  await ruler.click({ position: { x: rulerBox.width * .4, y: 4 } });
  const readout = await page.getByRole('button', { name: 'Toggle time display' }).textContent();
  await canvas.evaluate(node => { node.dataset.identity = 'same-canvas'; });
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await expect(editor).toHaveAttribute('data-theme', 'light');
  await expect.poll(async () => (await pixel())[0]).toBeGreaterThan(200);
  await expect(editor).toHaveCSS('color-scheme', 'light');
  await expect(canvas).toHaveAttribute('data-identity', 'same-canvas');
  await expect(page.getByRole('button', { name: 'Toggle time display' })).toHaveText(readout!);
  await page.getByRole('button', { name: 'Toggle Properties' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCSS('background-color', 'rgb(248, 250, 251)');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await expect.poll(async () => (await pixel())[0]).toBeLessThan(60);
  await expect(page.getByLabel('Name', { exact: true })).toHaveCSS('background-color', 'rgb(19, 19, 22)');
});

test('compact light mode supports transport and target selection', async ({ page }) => {
  await page.goto('/?theme=light&variant=compact');
  await expect(page.locator('.timeline-editor--compact')).toHaveAttribute('data-theme', 'light');
  const target = page.getByRole('button', { name: /Select playback target Root Motion/ });
  await target.click(); await expect(target).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
