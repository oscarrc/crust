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

  test('a stale handle unmount does not orphan the active toaster', () => {
    const first = mountToaster();
    first.unmount();
    toaster = mountToaster({ position: 'top-left' });
    first.unmount(); // stale — must be a no-op for the active mount
    expect(document.querySelectorAll('.crust-region')).toHaveLength(1);
    expect(mountToaster()).toBe(toaster); // still idempotent on the active handle
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

describe('in-place updates', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('toast.update re-renders content inside the same cell', () => {
    const id = toast.loading('Working…', { title: 'Hold on' });
    const cellBefore = document.querySelector('.crust-cell');
    toast.update(id, { message: 'Done!', type: 'success' });
    const cellAfter = document.querySelector('.crust-cell');
    expect(cellAfter).toBe(cellBefore);
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-success')).toBe(true);
    expect(el.classList.contains('crust-loading')).toBe(false);
    expect(el.querySelector('.crust-msg')!.textContent).toBe('Done!');
    expect(toastEls()).toHaveLength(1);
  });

  test('expanded state survives an update', () => {
    const id = toast('details', { title: 'Open me', duration: Infinity });
    const el = document.querySelector('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    expect(el.classList.contains('crust-expanded')).toBe(true);
    toast.update(id, { message: 'fresh details' });
    const updated = document.querySelector('.crust-toast')!;
    expect(updated.classList.contains('crust-expanded')).toBe(true);
    expect(updated.querySelector('.crust-msg')!.textContent).toBe('fresh details');
  });
});

describe('store-driven expansion', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('toast arriving expanded renders open and pinned', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });

  test('hover-out does not collapse a store-expanded toast, click does', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.classList.contains('crust-expanded')).toBe(true);
    el.click();
    expect(el.classList.contains('crust-expanded')).toBe(false);
  });

  test('toast.update({ expanded: true }) opens a visible toast', () => {
    const id = toast('details', { title: 'Later', duration: Infinity });
    expect(document.querySelector('.crust-expanded')).toBeNull();
    toast.update(id, { expanded: true });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });

  test('expansion-only updates act on the live element, exactly like hover', () => {
    const id = toast('details', { title: 'Later', duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    toast.update(id, { expanded: true });
    // No content changed: the element must NOT be rebuilt/replaced.
    expect(document.querySelector('.crust-toast')).toBe(el);
    expect(el.classList.contains('crust-expanded')).toBe(true);
  });

  test('a user-collapsed toast stays collapsed through unrelated updates', () => {
    const id = toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    el.click(); // user collapses the store-expanded toast
    expect(el.classList.contains('crust-expanded')).toBe(false);
    toast.update(id, { message: 'new content' });
    const updated = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(updated.classList.contains('crust-expanded')).toBe(false);
    expect(updated.dataset.pinned).toBeFalsy();
  });
});

describe('exit while expanded', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('exits in one continuous reverse motion — morph closes and exit run together', () => {
    const id = toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    toast.dismiss(id);
    // One gesture: expansion reverses and the exit starts in the same frame.
    expect(el.classList.contains('crust-expanded')).toBe(false);
    expect(el.classList.contains('crust-leaving')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(document.querySelectorAll('.crust-toast')).toHaveLength(0);
  });

  test('collapsed toasts still exit immediately', () => {
    const id = toast('plain capsule', { duration: Infinity });
    toast.dismiss(id);
    expect(document.querySelector('.crust-toast')!.classList.contains('crust-leaving')).toBe(true);
  });
});

describe('warning and loading defaults', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('warning renders its type class and a default icon', () => {
    toast.warning('careful');
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-warning')).toBe(true);
    expect(el.querySelector('.crust-icon svg')).toBeTruthy();
  });

  test('loading renders a spinner icon', () => {
    toast.loading('working…');
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-loading')).toBe(true);
    expect(el.querySelector('.crust-icon .crust-spin')).toBeTruthy();
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
