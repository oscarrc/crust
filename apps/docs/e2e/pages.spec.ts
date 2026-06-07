import { test, expect } from '@playwright/test';

const PAGES = ['/', '/playground/', '/docs/', '/docs/api/', '/docs/theming/'];

for (const path of PAGES) {
  test(`${path} renders without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
    // <Toaster client:load> hydrates after `load`; its mounted region is the
    // post-hydration signal that makes the console-error check meaningful
    await expect(page.locator('.crust-region').first()).toBeAttached();
    expect(errors).toEqual([]);
  });
}

test('internal nav links resolve', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Read the docs' }).click();
  await expect(page).toHaveURL(/\/docs\/?$/);
  await expect(page.locator('h1')).toBeVisible();
});
