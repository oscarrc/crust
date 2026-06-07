import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { commands, userEvent } from 'vitest/browser';
import { mountToaster, toast, toastStore } from '../../src/vanilla';
import type { ToasterHandle } from '../../src/vanilla';
import '../../src/styles.css';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shownToast = async () => {
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).not.toBeNull();
  });
  // wait out the enter transition so the drag isn't fighting it
  await vi.waitFor(() => {
    expect(
      document.querySelector('.crust-cell')!.classList.contains('crust-shown')
    ).toBe(true);
  });
  await sleep(400);
};

let toaster: ToasterHandle;

beforeEach(() => {
  toast.dismiss();
  toastStore.configure({ maxVisible: 5 });
  toaster = mountToaster();
});

afterEach(async () => {
  // park the cursor away from the region so it can't pause the next file's toasts
  await userEvent.unhover(document.body);
  toast.dismiss();
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).toBeNull();
  });
  toaster.unmount();
});

test('a long horizontal drag dismisses the toast', async () => {
  toast('swipe me', { duration: Infinity });
  await shownToast();
  const inner = document.querySelector<HTMLElement>('.crust-cell-inner')!;
  // > SWIPE_DISMISS_RATIO (0.35) of the inner width commits the dismiss
  await commands.swipe('.crust-cell-inner', Math.ceil(inner.offsetWidth * 0.5));
  await vi.waitFor(() => expect(toastStore.getSnapshot()).toHaveLength(0));
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).toBeNull();
  });
});

test('a short drag springs back instead of dismissing', async () => {
  toast('stay put', { duration: Infinity });
  await shownToast();
  const inner = document.querySelector<HTMLElement>('.crust-cell-inner')!;
  // > SWIPE_INTENT_PX (12) so the drag engages, << 35% of width so it springs back
  await commands.swipe('.crust-cell-inner', 40);
  await sleep(600); // spring-back transition + EXIT_FALLBACK_MS guard
  expect(toastStore.getSnapshot()).toHaveLength(1);
  expect(inner.style.transform).toBe('');
});

test('a swipe does not double as a click (no accidental pin)', async () => {
  toast('no pin', { message: 'body', duration: Infinity });
  await shownToast();
  await commands.swipe('.crust-cell-inner', 40);
  await sleep(600);
  const el = document.querySelector<HTMLElement>('.crust-toast')!;
  expect(el.dataset.pinned).toBeUndefined();
});
