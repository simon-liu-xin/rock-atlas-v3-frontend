import { expect, test } from '@playwright/test';

test('V3 homepage lazily loads details, preserves canonical counts and restores a deep link', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/data/')) requests.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const home = page.locator('[data-od-id="universe-homepage"]');
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const rail = page.locator('[data-od-id="universe-detail-rail"]');
  await expect(home).toHaveAttribute('data-catalog-channel', 'rock-catalog-v3');
  await expect(home).toHaveAttribute('data-artist-count', '420');
  await expect(scene).toHaveAttribute('data-scene-ready', 'true');
  expect(requests.some((url) => url.includes('rock-catalog-v2'))).toBe(false);
  expect(requests.some((url) => url.includes('/manifests/artist-summary/') || url.includes('/manifests/artist-release-groups/'))).toBe(false);
  await scene.locator('[data-style-id="mw:style:grunge"]').click();
  await expect(rail.locator('[data-artist-id]')).toHaveCount(5);
  await rail.locator('[data-artist-id="mw:artist:nirvana"]').click();
  await expect(rail.locator('[data-release-group-id]')).toHaveCount(2);
  await rail.locator('[data-release-group-id]').first().click();
  await expect(page.locator('.universe-release-detail')).toContainText('Bleach');
  const link = page.url();
  await page.reload();
  await expect(page.locator('.universe-release-detail')).toContainText('Bleach');
  expect(page.url()).toBe(link);
  await page.getByRole('button', { name: 'Return to overview' }).click();
  await expect(scene).toHaveAttribute('data-orbit-body-count', '0');
  await expect(home).toHaveAttribute('data-artist-count', '420');
  await page.getByRole('button', { name: 'Artists', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search styles or artists' }).fill('Pink Floyd');
  const result = page.locator('.universe-search-results').getByRole('button', { name: 'Pink Floyd Artists', exact: true });
  await expect(result).toBeVisible();
  await result.click();
  await expect(rail).toContainText('Pink Floyd');
  expect(errors).toEqual([]);
  await page.screenshot({ path: '/tmp/rock-atlas-v3-desktop.png' });
});

test('V3 detail failure leaves the map visible and retry recovers', async ({ page }) => {
  let fail = true;
  await page.route('**/manifests/style-artists/root.json', async (route) => {
    if (fail) await route.fulfill({ status: 503, body: 'temporarily unavailable' });
    else await route.continue();
  });
  await page.goto('/');
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  await scene.locator('[data-style-id="mw:style:grunge"]').click();
  await expect(page.getByRole('alert')).toContainText('Some music details could not be loaded');
  await expect(scene.locator('canvas')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('[data-od-id="universe-detail-rail"] [data-artist-id]')).toHaveCount(5);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('V3 mobile retains compact controls and functional album navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?focus_id=mw%3Astyle%3Agrunge&artist_id=mw%3Aartist%3Anirvana&webgl=off');
  await expect(page.locator('[data-od-id="universe-homepage"]')).toHaveAttribute('data-catalog-channel', 'rock-catalog-v3');
  await expect(page.locator('[data-release-group-id]')).toHaveCount(2);
  await page.locator('[data-release-group-id]').first().click();
  await expect(page.locator('.universe-release-detail')).toContainText('Bleach');
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({ path: '/tmp/rock-atlas-v3-mobile.png' });
});
