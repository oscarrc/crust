import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast, toastStore, mountToaster } from '../src/vanilla';

let toaster: ReturnType<typeof mountToaster> | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  toast.dismiss();
  toastStore.configure({ maxVisible: 5 });
});

afterEach(() => {
  toaster?.unmount();
  toaster = undefined;
  // Flush exit fallbacks so nothing leaks between tests.
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const region = () => document.querySelector('.crust-region');
const toastEls = () => document.querySelectorAll('.crust-toast');

describe('mountToaster', () => {
  test('mounts an accessible region with the default position', () => {
    toaster = mountToaster();
    const el = region();
    expect(el).toBeTruthy();
    expect(el!.getAttribute('role')).toBe('status');
    expect(el!.getAttribute('aria-live')).toBe('polite');
    expect(el!.classList.contains('crust-pos-bottom-right')).toBe(true);
  });

  test('honors the position option', () => {
    toaster = mountToaster({ position: 'top-center' });
    expect(region()!.classList.contains('crust-pos-top-center')).toBe(true);
  });

  test('is idempotent — second mount returns the same handle', () => {
    toaster = mountToaster();
    const again = mountToaster();
    expect(again).toBe(toaster);
    expect(document.querySelectorAll('.crust-region')).toHaveLength(1);
  });

  test('unmount removes the region and stops rendering', () => {
    toaster = mountToaster();
    toaster.unmount();
    toaster = undefined;
    toast('after unmount');
    expect(region()).toBeNull();
    expect(toastEls()).toHaveLength(0);
  });

  test('renders toasts that existed before mounting', () => {
    toast('early bird');
    toaster = mountToaster();
    expect(toastEls()).toHaveLength(1);
  });
});

describe('toast rendering', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('renders type class, title and message', () => {
    toast.success('It worked', { title: 'Saved' });
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-success')).toBe(true);
    expect(el.querySelector('.crust-title')!.textContent).toBe('Saved');
    expect(el.querySelector('.crust-msg')!.textContent).toBe('It worked');
  });

  test('toast with title and message is expandable', () => {
    toast('details here', { title: 'Heads up' });
    expect(document.querySelector('.crust-toast')!.classList.contains('crust-expandable')).toBe(true);
  });

  test('toast without a title shows message in the capsule and is not expandable', () => {
    toast('just a message');
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-expandable')).toBe(false);
    expect(el.querySelector('.crust-title')!.textContent).toBe('just a message');
    expect(el.querySelector('.crust-msg')).toBeNull();
  });

  test('hover expands and unhover collapses', () => {
    toast('details', { title: 'Expand me' });
    const el = document.querySelector('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    expect(el.classList.contains('crust-expanded')).toBe(true);
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.classList.contains('crust-expanded')).toBe(false);
  });

  test('dismiss button removes the toast from the store', () => {
    const id = toast('closable', { duration: Infinity });
    const button = document.querySelector<HTMLButtonElement>('.crust-dismiss')!;
    expect(button.getAttribute('aria-label')).toBeTruthy();
    button.click();
    expect(toastStore.getSnapshot().some((t) => t.id === id)).toBe(false);
  });

  test('removed toast enters leaving state, node removed after fallback', () => {
    const id = toast('bye', { duration: Infinity });
    toast.dismiss(id);
    const el = document.querySelector('.crust-toast');
    expect(el!.classList.contains('crust-leaving')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(toastEls()).toHaveLength(0);
  });

  test('renders at most the store snapshot (queue stays unrendered)', () => {
    for (let i = 0; i < 8; i++) toast(`t${i}`, { duration: Infinity });
    expect(toastEls()).toHaveLength(5);
  });
});

describe('timer gestures', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('mouseenter pauses the auto-dismiss timer, mouseleave resumes it', () => {
    toast('hover', { duration: 1000 });
    const el = document.querySelector('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(60_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    el.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(1000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
});

describe('icons', () => {
  beforeEach(() => {
    toaster?.unmount();
  });

  test('default icons render per type', () => {
    toaster = mountToaster();
    toast.success('ok');
    expect(document.querySelector('.crust-icon svg')).toBeTruthy();
  });

  test('icon: null hides the icon', () => {
    toaster = mountToaster();
    toast('plain', { icon: null });
    expect(document.querySelector('.crust-icon')).toBeNull();
  });

  test('per-toast string icon overrides the default', () => {
    toaster = mountToaster();
    toast.success('ok', { icon: '<svg data-custom="yes"></svg>' });
    expect(document.querySelector('.crust-icon svg[data-custom="yes"]')).toBeTruthy();
  });

  test('global Element icon is cloned, not moved', () => {
    const original = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    original.setAttribute('data-global', 'yes');
    toaster = mountToaster({ icons: { info: original } });
    toast('a');
    toast('b');
    const rendered = document.querySelectorAll('.crust-icon svg[data-global="yes"]');
    expect(rendered).toHaveLength(2);
    expect(original.parentNode).toBeNull();
  });

  test('factory icon is called per render', () => {
    const factory = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    toaster = mountToaster({ icons: { info: factory } });
    toast('a');
    toast('b');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
