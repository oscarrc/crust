import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast, toastStore } from '../src/vanilla';

beforeEach(() => {
  vi.useFakeTimers();
  toast.dismiss();
  toastStore.configure({ maxVisible: 5 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast()', () => {
  test('adds a toast with info type and 4000ms duration by default', () => {
    toast('hello');
    const [t] = toastStore.getSnapshot();
    expect(t).toMatchObject({ message: 'hello', type: 'info', duration: 4000 });
    expect(t!.id).toBeTruthy();
  });

  test('returns the toast id', () => {
    const id = toast('hello');
    expect(toastStore.getSnapshot()[0]!.id).toBe(id);
  });

  test('auto-dismisses after the default 4000ms', () => {
    toast('bye');
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('honors a custom duration', () => {
    toast('quick', { duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('duration: Infinity never auto-dismisses', () => {
    toast('stay', { duration: Infinity });
    vi.advanceTimersByTime(1_000_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
  });

  test('duration: 0 is an alias for Infinity', () => {
    toast('stay', { duration: 0 });
    vi.advanceTimersByTime(1_000_000);
    const [t] = toastStore.getSnapshot();
    expect(t!.duration).toBe(Infinity);
  });

  test('carries title and icon through', () => {
    toast('msg', { title: 'Title', icon: '<svg></svg>' });
    expect(toastStore.getSnapshot()[0]).toMatchObject({ title: 'Title', icon: '<svg></svg>' });
  });
});

describe('shorthands', () => {
  test.each(['success', 'error', 'info', 'warning'] as const)('toast.%s sets the type', (type) => {
    toast[type]('msg');
    expect(toastStore.getSnapshot()[0]!.type).toBe(type);
  });

  test('toast.loading sets the type and defaults to persistent', () => {
    toast.loading('working…');
    const [t] = toastStore.getSnapshot();
    expect(t).toMatchObject({ type: 'loading', duration: Infinity });
    vi.advanceTimersByTime(1_000_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
  });

  test('survive destructuring (no this-binding)', () => {
    const { success, dismiss } = toast;
    const id = success('detached');
    expect(toastStore.getSnapshot()[0]!.type).toBe('success');
    dismiss(id);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
});

describe('toast.dismiss', () => {
  test('dismiss(id) removes only that toast', () => {
    const a = toast('a');
    toast('b');
    toast.dismiss(a);
    const snapshot = toastStore.getSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]!.message).toBe('b');
  });

  test('dismiss() clears everything, including the queue', () => {
    for (let i = 0; i < 8; i++) toast(`t${i}`, { duration: Infinity });
    toast.dismiss();
    expect(toastStore.getSnapshot()).toHaveLength(0);
    vi.advanceTimersByTime(10_000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
});

describe('queue (maxVisible)', () => {
  test('caps visible toasts at maxVisible and queues the rest', () => {
    for (let i = 0; i < 7; i++) toast(`t${i}`, { duration: Infinity });
    expect(toastStore.getSnapshot()).toHaveLength(5);
  });

  test('promotes queued toasts in order when a slot frees up', () => {
    const ids = Array.from({ length: 6 }, (_, i) => toast(`t${i}`, { duration: Infinity }));
    toast.dismiss(ids[0]!);
    const messages = toastStore.getSnapshot().map((t) => t.message);
    expect(messages).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  test('queued toast timers start on promotion, not on add', () => {
    const ids = Array.from({ length: 5 }, (_, i) => toast(`p${i}`, { duration: Infinity }));
    toast('queued', { duration: 1000 });
    // Sits in the queue well past its duration — must not expire unseen.
    vi.advanceTimersByTime(5000);
    toast.dismiss(ids[0]!);
    expect(toastStore.getSnapshot().map((t) => t.message)).toContain('queued');
    vi.advanceTimersByTime(999);
    expect(toastStore.getSnapshot().map((t) => t.message)).toContain('queued');
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot().map((t) => t.message)).not.toContain('queued');
  });

  test('dismiss(id) removes a toast that is still queued', () => {
    Array.from({ length: 5 }, (_, i) => toast(`p${i}`, { duration: Infinity }));
    const queued = toast('queued', { duration: Infinity });
    toast.dismiss(queued);
    toast.dismiss(toastStore.getSnapshot()[0]!.id);
    expect(toastStore.getSnapshot().map((t) => t.message)).not.toContain('queued');
  });
});

describe('pause/resume', () => {
  test('pause stops the clock and resume continues with remaining time', () => {
    const id = toast('hover me', { duration: 4000 });
    vi.advanceTimersByTime(3000);
    toastStore.pause(id);
    vi.advanceTimersByTime(60_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    toastStore.resume(id);
    vi.advanceTimersByTime(999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('double pause / resume on persistent toasts are safe no-ops', () => {
    const id = toast('stay', { duration: Infinity });
    toastStore.pause(id);
    toastStore.pause(id);
    toastStore.resume(id);
    toastStore.resume(id);
    vi.advanceTimersByTime(60_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
  });
});

describe('toast.update', () => {
  test('patches message, title and type in place', () => {
    const id = toast('before', { duration: Infinity });
    toast.update(id, { message: 'after', title: 'New', type: 'warning' });
    const [t] = toastStore.getSnapshot();
    expect(t).toMatchObject({ id, message: 'after', title: 'New', type: 'warning' });
  });

  test('produces a new object and snapshot reference', () => {
    const id = toast('a', { duration: Infinity });
    const before = toastStore.getSnapshot();
    toast.update(id, { message: 'b' });
    expect(toastStore.getSnapshot()).not.toBe(before);
    expect(toastStore.getSnapshot()[0]).not.toBe(before[0]);
  });

  test('updating duration restarts the timer from now', () => {
    const id = toast('slow', { duration: Infinity });
    vi.advanceTimersByTime(10_000);
    toast.update(id, { duration: 2000 });
    vi.advanceTimersByTime(1999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('duration: 0 in a patch means persistent (alias)', () => {
    const id = toast('t', { duration: 2000 });
    toast.update(id, { duration: 0 });
    vi.advanceTimersByTime(1_000_000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
  });

  test('updates a queued toast too', () => {
    const pinned = Array.from({ length: 5 }, (_, i) => toast(`p${i}`, { duration: Infinity }));
    const queued = toast('original', { duration: Infinity });
    toast.update(queued, { message: 'patched' });
    toast.dismiss(pinned[0]!);
    expect(toastStore.getSnapshot().map((t) => t.message)).toContain('patched');
  });

  test('notifies subscribers', () => {
    const id = toast('a', { duration: Infinity });
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);
    toast.update(id, { message: 'b' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('unknown id is a safe no-op', () => {
    toast('a', { duration: Infinity });
    const before = toastStore.getSnapshot();
    toast.update('nope', { message: 'x' });
    expect(toastStore.getSnapshot()).toBe(before);
  });
});

describe('toast.promise', () => {
  test('shows a persistent loading toast while pending', () => {
    let settle!: () => void;
    toast.promise(new Promise<void>((resolve) => (settle = resolve)), {
      loading: 'Baking…',
      success: 'Done',
      error: 'Burnt'
    });
    const [t] = toastStore.getSnapshot();
    expect(t).toMatchObject({ message: 'Baking…', type: 'loading', duration: Infinity });
    settle();
  });

  test('morphs into success with a function message and auto-dismisses', async () => {
    const id = toast.promise(Promise.resolve(3), {
      loading: 'Counting…',
      success: (n) => `Counted ${n}`,
      error: 'Failed'
    });
    await vi.advanceTimersByTimeAsync(0);
    const [t] = toastStore.getSnapshot();
    expect(t).toMatchObject({ id, message: 'Counted 3', type: 'success', duration: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('morphs into error on rejection', async () => {
    toast.promise(Promise.reject(new Error('boom')), {
      loading: 'Trying…',
      success: 'OK',
      error: (e) => `Failed: ${(e as Error).message}`
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ message: 'Failed: boom', type: 'error' });
  });

  test('accepts object messages with titles', async () => {
    toast.promise(Promise.resolve(), {
      loading: { message: 'Working…', title: 'Hold on' },
      success: { message: 'All good', title: 'Done' },
      error: 'Failed'
    });
    expect(toastStore.getSnapshot()[0]).toMatchObject({ title: 'Hold on' });
    await vi.advanceTimersByTimeAsync(0);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ message: 'All good', title: 'Done', type: 'success' });
  });
});

describe('expanded primitive', () => {
  test('toast can arrive expanded', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    expect(toastStore.getSnapshot()[0]!.expanded).toBe(true);
  });

  test('update(id, { expanded: true }) restarts the dismiss timer', () => {
    const id = toast('m', { title: 't', duration: 4000 });
    vi.advanceTimersByTime(3900);
    toast.update(id, { expanded: true });
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('timer restart while paused keeps the toast paused with the fresh duration', () => {
    const id = toast('m', { title: 't', duration: 4000 });
    vi.advanceTimersByTime(3000);
    toastStore.pause(id); // hover
    toast.update(id, { expanded: true });
    vi.advanceTimersByTime(60_000); // still hovered — must not dismiss
    expect(toastStore.getSnapshot()).toHaveLength(1);
    toastStore.resume(id); // mouseleave
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('update(id, { expanded: false }) does not restart the dismiss timer', () => {
    const id = toast('m', { title: 't', duration: 4000 });
    vi.advanceTimersByTime(3900);
    toast.update(id, { expanded: false });
    vi.advanceTimersByTime(100);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('expanded is not set by default', () => {
    toast('plain', { duration: Infinity });
    expect(toastStore.getSnapshot()[0]!.expanded).toBeUndefined();
  });

  test('expandAfter auto-expands after N ms and restarts the dismiss timer', () => {
    const id = toast('m', { title: 't', duration: 4000, expandAfter: 2000 });
    vi.advanceTimersByTime(1999);
    expect(toastStore.getSnapshot()[0]!.expanded).not.toBe(true);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ id, expanded: true });
    // dismiss timer restarted at the 2000ms mark: full 4000 remain
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('expandAfter is cancelled by dismissal', () => {
    const id = toast('m', { title: 't', duration: Infinity, expandAfter: 1000 });
    toast.dismiss(id);
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('expandAfter starts when a queued toast is promoted, not when added', () => {
    const pinned = Array.from({ length: 5 }, (_, i) => toast(`p${i}`, { duration: Infinity }));
    const queued = toast('m', { title: 't', duration: Infinity, expandAfter: 1000 });
    vi.advanceTimersByTime(10_000); // sits in queue well past expandAfter
    toast.dismiss(pinned[0]!);
    expect(toastStore.getSnapshot().find((t) => t.id === queued)!.expanded).not.toBe(true);
    vi.advanceTimersByTime(1000);
    expect(toastStore.getSnapshot().find((t) => t.id === queued)!.expanded).toBe(true);
  });

  test('expandAfter without a title is ignored', () => {
    toast('no title here', { duration: Infinity, expandAfter: 500 });
    vi.advanceTimersByTime(5000);
    expect(toastStore.getSnapshot()[0]!.expanded).not.toBe(true);
  });

  test('expandAfter firing while hovered pins open but keeps the timer paused', () => {
    const id = toast('m', { title: 't', duration: 4000, expandAfter: 1000 });
    toastStore.pause(id); // hover before the expand fires
    vi.advanceTimersByTime(1000); // expandAfter fires during hover
    expect(toastStore.getSnapshot()[0]).toMatchObject({ id, expanded: true });
    vi.advanceTimersByTime(60_000); // still hovered — must not dismiss
    expect(toastStore.getSnapshot()).toHaveLength(1);
    toastStore.resume(id); // mouseleave → fresh full duration
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
});

describe('subscription & snapshots', () => {
  test('getSnapshot returns a stable reference between mutations', () => {
    toast('a');
    const first = toastStore.getSnapshot();
    expect(toastStore.getSnapshot()).toBe(first);
    toast('b');
    expect(toastStore.getSnapshot()).not.toBe(first);
  });

  test('subscribe notifies on changes and unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);
    toast('a');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    toast('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
