import { test, expect } from '@playwright/test';

test('vanilla data-bake button fires a toast that auto-dismisses', async ({ page }) => {
  await page.goto('/');
  const bake = page.getByRole('button', { name: 'Bake a toast' });
  // retry until the inline <script> has attached its listeners
  await expect(async () => {
    await bake.click();
    await expect(
      page.locator('.crust-toast.crust-success').first()
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  // default duration is 4000ms; exit animation adds <500ms
  await expect(page.locator('.crust-toast')).toHaveCount(0, { timeout: 10_000 });
});

test('React island hydrates and shares the store with the vanilla script', async ({ page }) => {
  await page.goto('/');
  const islandButton = page.getByRole('button', { name: 'Toast from React' });
  await islandButton.scrollIntoViewIfNeeded(); // client:visible — trigger hydration
  // retry until the island is hydrated and the click lands; match ANY positive
  // count so a double-fired retry can't diverge the loop
  await expect(async () => {
    await islandButton.click();
    await expect(page.getByText(/[1-9]\d* active toast/)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.locator('.crust-toast').first()).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss all' }).click();
  await expect(page.getByText(/0 active toasts/)).toBeVisible();
  await expect(page.locator('.crust-toast')).toHaveCount(0, { timeout: 5_000 });
  // cross-side singleton proof: a toast fired by the vanilla inline script
  // must show up in the React island's badge count
  await page.getByRole('button', { name: 'Bake a toast' }).click();
  await expect(page.getByText(/[1-9]\d* active toast/)).toBeVisible();
});
