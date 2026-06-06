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
  test.each(['success', 'error', 'info'] as const)('toast.%s sets the type', (type) => {
    toast[type]('msg');
    expect(toastStore.getSnapshot()[0]!.type).toBe(type);
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
