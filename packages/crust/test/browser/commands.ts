import type { BrowserCommand } from 'vitest/node';
// brings the playwright provider's BrowserCommandContext augmentation into scope
import '@vitest/browser-playwright';

/**
 * Horizontal mouse drag across the element's center, frame-spaced so the
 * renderer's velocity sampling sees believable pointermove timing.
 */
export const swipe: BrowserCommand<[selector: string, dx: number]> = async (
  ctx,
  selector,
  dx
) => {
  const { page, iframe } = ctx;
  const box = await iframe.locator(selector).boundingBox();
  if (!box) throw new Error(`swipe: no element matches ${selector}`);
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
};

declare module 'vitest/browser' {
  interface BrowserCommands {
    swipe: (selector: string, dx: number) => Promise<void>;
  }
}
