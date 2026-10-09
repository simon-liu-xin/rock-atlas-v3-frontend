import { expect, test } from '@playwright/test';

test('V3 attempts autoplay at 50 percent and a touch end recovers when touch start is denied', async ({ page }) => {
  test.skip(!process.env.VITE_BACKGROUND_TRACK_URL, 'Requires configured audio');
  await page.addInitScript(() => {
    let activated = false;
    const probe = { play: 0, pause: 0, volume: 1, sources: [] as string[] };
    Object.defineProperty(window, '__audioProbe', { value: probe });
    document.addEventListener('touchend', () => { activated = true; }, true);
    Object.defineProperty(window, 'Audio', { configurable: true, value: function AudioMock(src: string) {
      probe.sources.push(src);
      const element = document.createElement('audio');
      element.play = () => { probe.play++; probe.volume = element.volume;
        return activated ? Promise.resolve() : Promise.reject(new DOMException('Requires trusted end gesture', 'NotAllowedError')); };
      element.pause = () => { probe.pause++; };
      return element;
    } });
  });
  await page.goto('/?webgl=off');
  const player = page.locator('[data-od-id="background-audio-player"]');
  await expect(player).toHaveAttribute('data-audio-state', 'blocked');
  await page.locator('body').dispatchEvent('touchstart');
  await expect(player).toHaveAttribute('data-audio-state', 'blocked');
  await page.locator('body').dispatchEvent('touchend');
  await expect(player).toHaveAttribute('data-audio-state', 'playing');
  const probe = await page.evaluate(() => (window as unknown as { __audioProbe: { volume: number } }).__audioProbe);
  expect(probe.volume).toBe(0.5);
  await page.getByRole('button', { name: 'Pause background audio' }).click();
  await page.locator('body').dispatchEvent('touchend');
  await expect(player).toHaveAttribute('data-audio-state', 'paused');
});

test('V3 starts an allowed track before the user clicks a control', async ({ page }) => {
  test.skip(!process.env.VITE_BACKGROUND_TRACK_URL, 'Requires configured audio');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Audio', { configurable: true, value: function AudioMock() {
      const element = document.createElement('audio');
      element.play = () => Promise.resolve(); element.pause = () => {};
      return element;
    } });
  });
  await page.goto('/');
  await expect(page.locator('[data-od-id="background-audio-player"]')).toHaveAttribute('data-audio-state', 'playing');
  await expect(page.getByRole('button', { name: 'Pause background audio' })).toBeVisible();
});
