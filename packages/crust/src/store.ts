export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

/**
 * Anything the renderer can turn into a DOM node:
 * raw SVG markup, an Element (cloned per render), or a factory.
 * `null` hides the icon for that toast.
 */
export type CrustIcon = string | Element | (() => Element);

export interface ToastOptions {
  /** Body copy hidden in the expandable panel. A toast expands iff it has one. */
  message?: string;
  type?: ToastType;
  /** ms before auto-dismiss. Default 4000. `Infinity` (or `0` as alias) never dismisses. */
  duration?: number;
  icon?: CrustIcon | null;
  /** Arrive with the message panel open (pinned). */
  expanded?: boolean;
  /** ms after becoming visible until the toast auto-expands. Needs a `message`. */
  expandAfter?: number;
}

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  duration: number;
  icon?: CrustIcon | null;
  expanded?: boolean;
  expandAfter?: number;
}

export type ToastPatch = Partial<Omit<Toast, 'id'>>;

interface TimerEntry {
  timeoutId: ReturnType<typeof setTimeout> | null;
  deadline: number;
  remaining: number;
}

interface StoreState {
  toasts: readonly Toast[];
  queue: Toast[];
  listeners: Set<(toasts: readonly Toast[]) => void>;
  timers: Map<string, TimerEntry>;
  expandTimers: Map<string, ReturnType<typeof setTimeout>>;
  maxVisible: number;
  seq: number;
}

// Singleton on globalThis: defends against two copies of the module
// (duplicate installs, multiple bundles) splitting the store.
const STORE_KEY = Symbol.for('crust.store');
const globalContainer = globalThis as { [STORE_KEY]?: StoreState };
const state: StoreState = (globalContainer[STORE_KEY] ??= {
  toasts: [],
  queue: [],
  listeners: new Set(),
  timers: new Map(),
  expandTimers: new Map(),
  maxVisible: 5,
  seq: 0
});
// Migration guard: an older module copy may have created the singleton without this map.
state.expandTimers ??= new Map();

const emit = () => {
  for (const listener of state.listeners) listener(state.toasts);
};

const startTimer = (toast: Toast) => {
  if (!Number.isFinite(toast.duration)) return;
  state.timers.set(toast.id, {
    timeoutId: setTimeout(() => remove(toast.id), toast.duration),
    deadline: Date.now() + toast.duration,
    remaining: toast.duration
  });
};

const clearTimer = (id: string) => {
  const entry = state.timers.get(id);
  if (entry?.timeoutId != null) clearTimeout(entry.timeoutId);
  state.timers.delete(id);
};

const clearExpandTimer = (id: string) => {
  const timeoutId = state.expandTimers.get(id);
  if (timeoutId != null) clearTimeout(timeoutId);
  state.expandTimers.delete(id);
};

// `update` is defined later in the file — fine; these helpers are only
// invoked at runtime, after module evaluation is complete.
const scheduleExpand = (toast: Toast) => {
  // Only meaningful when there is a hidden message panel to reveal.
  if (!toast.message || toast.expandAfter === undefined) return;
  if (!Number.isFinite(toast.expandAfter)) return;
  clearExpandTimer(toast.id); // never leak a prior timer for this id
  state.expandTimers.set(
    toast.id,
    setTimeout(() => {
      state.expandTimers.delete(toast.id);
      update(toast.id, { expanded: true });
    }, toast.expandAfter)
  );
};

const promote = () => {
  while (state.queue.length > 0 && state.toasts.length < state.maxVisible) {
    const next = state.queue.shift()!;
    state.toasts = [...state.toasts, next];
    startTimer(next);
    scheduleExpand(next);
  }
};

// Package-internal (used by toast.ts) — NOT part of the published surface;
// vanilla.ts deliberately does not re-export it.
export const normalizeDuration = (raw: number | undefined): number =>
  raw === undefined ? 4000 : raw === 0 ? Infinity : raw;

const add = (title: string, options?: ToastOptions): string => {
  const id = `crust-${++state.seq}`;
  const duration = normalizeDuration(options?.duration);
  const next: Toast = {
    id,
    title,
    message: options?.message,
    type: options?.type ?? 'info',
    duration,
    icon: options?.icon,
    expanded: options?.expanded,
    expandAfter: options?.expandAfter
  };
  if (state.toasts.length < state.maxVisible) {
    state.toasts = [...state.toasts, next];
    startTimer(next);
    scheduleExpand(next);
    emit();
  } else {
    // Queued toasts get their timer on promotion — they must not expire unseen.
    state.queue.push(next);
  }
  return id;
};

const remove = (id: string) => {
  clearTimer(id);
  clearExpandTimer(id);
  const queuedAt = state.queue.findIndex((t) => t.id === id);
  if (queuedAt !== -1) {
    state.queue.splice(queuedAt, 1);
    return;
  }
  if (!state.toasts.some((t) => t.id === id)) return;
  state.toasts = state.toasts.filter((t) => t.id !== id);
  promote();
  emit();
};

// Package-internal (used by toast.ts for `toast.dismiss()`) — NOT part of the
// published surface; vanilla.ts deliberately does not re-export it.
export const removeAll = () => {
  for (const id of [...state.timers.keys()]) clearTimer(id);
  for (const id of [...state.expandTimers.keys()]) clearExpandTimer(id);
  state.queue.length = 0;
  if (state.toasts.length === 0) return;
  state.toasts = [];
  emit();
};

const update = (id: string, patch: ToastPatch) => {
  const apply = (item: Toast): Toast => ({
    ...item,
    ...patch,
    ...(patch.duration !== undefined
      ? { duration: normalizeDuration(patch.duration) }
      : {})
  });

  const queuedAt = state.queue.findIndex((t) => t.id === id);
  if (queuedAt !== -1) {
    // Still queued: patch in place; its timer starts on promotion anyway.
    state.queue[queuedAt] = apply(state.queue[queuedAt]!);
    return;
  }

  const current = state.toasts.find((t) => t.id === id);
  if (!current) return;
  const next = apply(current);
  state.toasts = state.toasts.map((t) => (t.id === id ? next : t));
  // A new duration — or a programmatic expansion (new content just
  // appeared, the reader gets the full duration again) — restarts the clock.
  if (patch.duration !== undefined || patch.expanded === true) {
    const existing = state.timers.get(id);
    const wasPaused = existing !== undefined && existing.timeoutId == null;
    clearTimer(id);
    if (wasPaused && Number.isFinite(next.duration)) {
      // Stay paused; resume() will run the fresh duration in full.
      state.timers.set(id, { timeoutId: null, deadline: 0, remaining: next.duration });
    } else {
      startTimer(next);
    }
  }
  emit();
};

const pause = (id: string) => {
  const entry = state.timers.get(id);
  if (!entry || entry.timeoutId == null) return;
  clearTimeout(entry.timeoutId);
  entry.timeoutId = null;
  entry.remaining = Math.max(0, entry.deadline - Date.now());
};

const resume = (id: string) => {
  const entry = state.timers.get(id);
  if (!entry || entry.timeoutId != null) return;
  entry.deadline = Date.now() + entry.remaining;
  entry.timeoutId = setTimeout(() => remove(id), entry.remaining);
};

const configure = (options: { maxVisible?: number }) => {
  if (options.maxVisible !== undefined) {
    state.maxVisible = Math.max(1, options.maxVisible);
    promote();
    emit();
  }
};

/** Low-level store. Most apps only need `toast` and a mounted toaster. */
export const toastStore = {
  subscribe: (listener: (toasts: readonly Toast[]) => void) => {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
  getSnapshot: (): readonly Toast[] => state.toasts,
  add,
  remove,
  update,
  pause,
  resume,
  configure
};
