import { expect, test } from '@playwright/test';

test('interactive query states and research workspaces stay out of the index', async ({ page }) => {
  await page.goto('/?focus_id=mw%3Astyle%3Agrunge&webgl=off');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await page.goto('/experiment/3d?webgl=off');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
});
