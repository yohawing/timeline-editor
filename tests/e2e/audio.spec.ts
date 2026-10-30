import { expect, test } from "@playwright/test";

test("decodes dropped WAV, follows transport, preserves audio on failure and clears", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "クリック音で試す" }).click();
  await expect(page.locator(".audio-name")).toHaveText("Click track.wav");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const marker = page.getByLabel("Sync marker");
  await expect.poll(async () => Number(await marker.getAttribute("data-time"))).toBeGreaterThan(0.2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await marker.getAttribute("data-time");
  await page.waitForTimeout(150);
  expect(await marker.getAttribute("data-time")).toBe(paused);
  // Exercise real file drop and browser decode, not just the built-in button.
  await page.evaluate(async () => {
    const response = await fetch("/src/audioDemo.tsx");
    if (!response.ok) throw new Error("Demo unavailable");
    const module = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const transfer = new DataTransfer();
    transfer.items.add(new File([module.clickTrack()], "dropped.wav", { type: "audio/wav" }));
    document.querySelector(".example-editor")!.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.locator(".audio-name")).toHaveText("dropped.wav");
  await page.getByLabel("Audio file").setInputFiles({ name: "broken.wav", mimeType: "audio/wav", buffer: Buffer.from("invalid") });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".audio-name")).toHaveText("dropped.wav");
  await page.getByRole("button", { name: "音声を解除" }).click();
  await expect(page.locator(".audio-name")).toHaveCount(0);
});

test("real Web Audio renders the requested offset and rate", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { clickTrack, createTimelineAudio } = await import(/* @vite-ignore */ "/src/audioDemo.tsx");
    const context = new OfflineAudioContext(1, 24000, 24000);
    // Offline rendering must schedule before rendering begins. Only the state
    // gate is adapted; decoding, source nodes and PCM rendering are native.
    const audio = createTimelineAudio({
      state: "running", currentTime: 0, destination: context.destination,
      decodeAudioData: context.decodeAudioData.bind(context),
      createBufferSource: context.createBufferSource.bind(context),
    });
    await audio.load(clickTrack());
    audio.sync({ available: true, time: 0.5, duration: 12, playing: true, looping: false, rate: 2 });
    const rendered = await context.startRendering();
    const data = rendered.getChannelData(0);
    const energy = (a: number, b: number) => data.slice(a, b).reduce((sum, v) => sum + Math.abs(v), 0);
    return { before: energy(0, 5800), click: energy(6000, 6400) };
  });
  expect(result.before).toBeLessThan(0.1);
  expect(result.click).toBeGreaterThan(1);
});
