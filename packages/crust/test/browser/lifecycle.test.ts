import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountToaster, toast, toastStore } from '../../src/vanilla';
import type { ToasterHandle } from '../../src/vanilla';
import '../../src/styles.css';

let toaster: ToasterHandle;

beforeEach(() => {
  toast.dismiss();
  toastStore.configure({ maxVisible: 5 });
  toaster = mountToaster();
});

afterEach(async () => {
  toast.dismiss();
  // let exit animations drain so the next test starts from an empty region
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).toBeNull();
  });
  toaster.unmount();
});

test('shows a toast and runs the real enter animation', async () => {
  toast('hello');
  const el = await vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('.crust-toast');
    expect(found).not.toBeNull();
    return found!;
  });
  expect(el.classList.contains('crust-info')).toBe(true);
  // the renderer marks the cell shown a frame later; the enter transition
  // then runs on the real compositor until the toast is fully opaque
  await vi.waitFor(() => {
    expect(el.closest('.crust-cell')!.classList.contains('crust-shown')).toBe(true);
  });
  await vi.waitFor(() => {
    expect(Number(getComputedStyle(el).opacity)).toBe(1);
  });
});

test('auto-dismisses with real timers; exit settles inside the fallback window', async () => {
  toast('bye', { duration: 300 });
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).not.toBeNull();
  });
  // store entry drops at ~300ms; the element must leave the DOM via
  // transitionend well before duration + EXIT_FALLBACK_MS (450ms) + slack
  const start = performance.now();
  await vi.waitFor(
    () => expect(document.querySelector('.crust-toast')).toBeNull(),
    { timeout: 1500 }
  );
  expect(performance.now() - start).toBeLessThan(1200);
});

test('dismiss button removes the toast from store and DOM', async () => {
  toast('clickable', { duration: Infinity });
  const btn = await vi.waitFor(() => {
    const b = document.querySelector<HTMLButtonElement>('.crust-dismiss');
    expect(b).not.toBeNull();
    return b!;
  });
  btn.click();
  expect(toastStore.getSnapshot()).toHaveLength(0);
  await vi.waitFor(() => {
    expect(document.querySelector('.crust-toast')).toBeNull();
  });
});
