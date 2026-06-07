import { test, expect, beforeEach, afterEach, vi } from 'vitest';
// In vitest 4.x `vitest/browser` is a virtual module resolved by the runner
// inside browser mode; it re-exports everything from @vitest/browser/context
// (via the @vitest/browser-playwright/context chain in context.d.ts).
// `@vitest/browser/context` is the pre-4.x path and is still valid too, but
// `vitest/browser` is the canonical 4.x surface — it worked here.
import { userEvent } from 'vitest/browser';
import { mountToaster, toast, toastStore } from '../../src/vanilla';
import type { ToasterHandle } from '../../src/vanilla';
import '../../src/styles.css';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const nextToast = () =>
  vi.waitFor(() => {
    const el = document.querySelector<HTMLElement>('.crust-toast');
    expect(el).not.toBeNull();
    return el!;
  });

let toaster: ToasterHandle;

beforeEach(() => {
  toast.dismiss();
  toastStore.configure({ maxVisible: 5 });
  toaster = mountToaster();
});

afterEach(async () => {
  // park the cursor away from the region so it can't pause the next test's toast
  await userEvent.unhover(document.body);
  toast.dismiss();
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).toBeNull();
  });
  toaster.unmount();
});

test('hover pauses the dismiss timer; leaving resumes it', async () => {
  // Use a duration well above ENTER_MS (320ms) so the toast is stable before
  // Playwright's hover stabilisation check times out. renderer.ts ENTER_MS = 320.
  toast('linger', { duration: 800 });
  const el = await nextToast();
  // Wait for the enter animation to complete so the element is stable for CDP hover.
  await vi.waitFor(() => {
    expect(el.closest('.crust-cell')!.classList.contains('crust-shown')).toBe(true);
    expect(Number(getComputedStyle(el).opacity)).toBeGreaterThan(0.9);
  });
  await userEvent.hover(el);
  await sleep(1200); // well past the 800ms duration
  expect(toastStore.getSnapshot()).toHaveLength(1); // paused, still alive
  await userEvent.unhover(el);
  await vi.waitFor(
    () => expect(toastStore.getSnapshot()).toHaveLength(0),
    { timeout: 2000 }
  );
});

test('hover expands a toast with a message; mouseleave collapses it', async () => {
  toast('title', { message: 'body copy', duration: Infinity });
  const el = await nextToast();
  expect(el.classList.contains('crust-expandable')).toBe(true);
  // Wait for the enter animation so the element is stable for CDP hover.
  await vi.waitFor(() => {
    expect(el.closest('.crust-cell')!.classList.contains('crust-shown')).toBe(true);
    expect(Number(getComputedStyle(el).opacity)).toBeGreaterThan(0.9);
  });
  await userEvent.hover(el);
  await vi.waitFor(() => {
    expect(el.classList.contains('crust-expanded')).toBe(true);
  });
  await userEvent.unhover(el);
  await vi.waitFor(() => {
    expect(el.classList.contains('crust-expanded')).toBe(false);
  });
});

test('click pins the expansion open; mouseleave no longer collapses', async () => {
  toast('pin me', { message: 'stays open', duration: Infinity });
  const el = await nextToast();
  // Wait for the enter animation so the element is stable for CDP click.
  await vi.waitFor(() => {
    expect(el.closest('.crust-cell')!.classList.contains('crust-shown')).toBe(true);
    expect(Number(getComputedStyle(el).opacity)).toBeGreaterThan(0.9);
  });
  await userEvent.click(el);
  await vi.waitFor(() => expect(el.dataset.pinned).toBe('1'));
  expect(el.classList.contains('crust-expanded')).toBe(true);
  await userEvent.unhover(el);
  await sleep(150);
  expect(el.classList.contains('crust-expanded')).toBe(true);
});
