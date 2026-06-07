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

  test('re-adopts the region after an Astro view-transition swap', () => {
    toaster = mountToaster();
    toast('survivor', { duration: 0 });
    // Simulate ClientRouter: the incoming body never contains the
    // runtime-created region, so the swap drops it.
    region()!.remove();
    document.dispatchEvent(new Event('astro:after-swap'));
    expect(region()).toBeTruthy();
    expect(toastEls()).toHaveLength(1);
  });

  test('unmount stops re-adopting on swap', () => {
    toaster = mountToaster();
    toaster.unmount();
    toaster = undefined;
    document.dispatchEvent(new Event('astro:after-swap'));
    expect(region()).toBeNull();
  });
});

describe('toast rendering', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('renders type class, title and message', () => {
    toast.success('Saved', { message: 'It worked' });
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-success')).toBe(true);
    expect(el.querySelector('.crust-title')!.textContent).toBe('Saved');
    expect(el.querySelector('.crust-msg')!.textContent).toBe('It worked');
  });

  test('toast with a message is expandable', () => {
    toast('Heads up', { message: 'details here' });
    expect(document.querySelector('.crust-toast')!.classList.contains('crust-expandable')).toBe(true);
  });

  test('toast without a message is a plain capsule and is not expandable', () => {
    toast('just a title');
    const el = document.querySelector('.crust-toast')!;
    expect(el.classList.contains('crust-expandable')).toBe(false);
    expect(el.querySelector('.crust-title')!.textContent).toBe('just a title');
    expect(el.querySelector('.crust-msg')).toBeNull();
  });

  test('hover expands and unhover collapses', () => {
    toast('Expand me', { message: 'details' });
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
    const id = toast.loading('Hold on', { message: 'Working…' });
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

  test('toast.update patches the capsule title', () => {
    const id = toast('Before', { duration: Infinity });
    toast.update(id, { title: 'After' });
    expect(document.querySelector('.crust-title')!.textContent).toBe('After');
  });

  test('expanded state survives an update', () => {
    const id = toast('Open me', { message: 'details', duration: Infinity });
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
    toast('Open', { message: 'details', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });

  test('hover-out does not collapse a store-expanded toast, click does', () => {
    toast('Open', { message: 'details', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.classList.contains('crust-expanded')).toBe(true);
    el.click();
    expect(el.classList.contains('crust-expanded')).toBe(false);
  });

  test('toast.update({ expanded: true }) opens a visible toast', () => {
    const id = toast('Later', { message: 'details', duration: Infinity });
    expect(document.querySelector('.crust-expanded')).toBeNull();
    toast.update(id, { expanded: true });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });

  test('expansion-only updates act on the live element, exactly like hover', () => {
    const id = toast('Later', { message: 'details', duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    toast.update(id, { expanded: true });
    // No content changed: the element must NOT be rebuilt/replaced.
    expect(document.querySelector('.crust-toast')).toBe(el);
    expect(el.classList.contains('crust-expanded')).toBe(true);
  });

  test('a user-collapsed toast stays collapsed through unrelated updates', () => {
    const id = toast('Open', { message: 'details', expanded: true, duration: Infinity });
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
    const id = toast('Open', { message: 'details', expanded: true, duration: Infinity });
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

describe('swipe to dismiss', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  const inner = () => document.querySelector<HTMLElement>('.crust-cell-inner')!;

  const swipeEvent = (type: string, init: PointerEventInit) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, ...init });

  /** pointerdown at xs[0], moves through the rest, then pointerup/cancel. */
  const drag = (
    target: HTMLElement,
    xs: number[],
    opts: { pointerType?: string; cancel?: boolean } = {}
  ) => {
    const pointerType = opts.pointerType ?? 'touch';
    target.dispatchEvent(
      swipeEvent('pointerdown', { pointerId: 1, clientX: xs[0], clientY: 10, pointerType })
    );
    for (const x of xs.slice(1)) {
      target.dispatchEvent(
        swipeEvent('pointermove', { pointerId: 1, clientX: x, clientY: 10, pointerType })
      );
    }
    target.dispatchEvent(
      swipeEvent(opts.cancel ? 'pointercancel' : 'pointerup', {
        pointerId: 1,
        clientX: xs[xs.length - 1],
        clientY: 10,
        pointerType
      })
    );
  };

  test('a drag past the threshold dismisses in the swipe direction', () => {
    const id = toast('swipe me', { duration: Infinity });
    drag(inner(), [200, 220, 340]); // dx 140 > 35% of the 360px fallback width
    expect(toastStore.getSnapshot().some((t) => t.id === id)).toBe(false);
    expect(inner().classList.contains('crust-swipe-exit')).toBe(true);
    expect(inner().style.transform).toBe('translateX(408px)');
  });

  test('swiping left dismisses too, sliding out leftward', () => {
    const id = toast('swipe me', { duration: Infinity });
    drag(inner(), [200, 180, 60]);
    expect(toastStore.getSnapshot().some((t) => t.id === id)).toBe(false);
    expect(inner().style.transform).toBe('translateX(-408px)');
  });

  test('a short drag springs back and keeps the toast', () => {
    const id = toast('stay', { duration: Infinity });
    const target = inner();
    drag(target, [200, 220, 240]);
    expect(toastStore.getSnapshot().some((t) => t.id === id)).toBe(true);
    expect(target.style.transform).toBe('');
    expect(target.classList.contains('crust-swipe-return')).toBe(true);
    vi.advanceTimersByTime(500); // settle fallback clears the transition class
    expect(target.classList.contains('crust-swipe-return')).toBe(false);
  });

  test('dragging pauses the dismiss timer; a cancelled touch swipe resumes it', () => {
    toast('timed', { duration: 1000 });
    const target = inner();
    target.dispatchEvent(
      swipeEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 10, pointerType: 'touch' })
    );
    target.dispatchEvent(
      swipeEvent('pointermove', { pointerId: 1, clientX: 240, clientY: 10, pointerType: 'touch' })
    );
    vi.advanceTimersByTime(5000); // mid-drag: the clock is paused
    expect(toastStore.getSnapshot()).toHaveLength(1);
    target.dispatchEvent(
      swipeEvent('pointercancel', { pointerId: 1, clientX: 240, clientY: 10, pointerType: 'touch' })
    );
    vi.advanceTimersByTime(5000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('a cancelled mouse drag leaves the pause to mouseleave, like hover', () => {
    toast('hover-owned', { duration: 1000 });
    drag(inner(), [200, 220, 240], { pointerType: 'mouse' });
    vi.advanceTimersByTime(5000); // still hovering: stays paused
    expect(toastStore.getSnapshot()).toHaveLength(1);
    document.querySelector('.crust-toast')!.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(5000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('the click after a swipe does not pin-expand; a clean tap still does', () => {
    toast('expandable', { message: 'details', duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    drag(inner(), [200, 220, 240]);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.classList.contains('crust-expanded')).toBe(false);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.classList.contains('crust-expanded')).toBe(true);
  });
});
