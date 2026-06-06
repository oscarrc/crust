export type ToastType = 'success' | 'error' | 'info';

/**
 * Anything the renderer can turn into a DOM node:
 * raw SVG markup, an Element (cloned per render), or a factory.
 * `null` hides the icon for that toast.
 */
export type CrustIcon = string | Element | (() => Element);

export interface ToastOptions {
  title?: string;
  type?: ToastType;
  /** ms before auto-dismiss. Default 4000. `Infinity` (or `0` as alias) never dismisses. */
  duration?: number;
  icon?: CrustIcon | null;
}

export interface Toast {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  duration: number;
  icon?: CrustIcon | null;
}

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
  maxVisible: 5,
  seq: 0
});

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

const promote = () => {
  while (state.queue.length > 0 && state.toasts.length < state.maxVisible) {
    const next = state.queue.shift()!;
    state.toasts = [...state.toasts, next];
    startTimer(next);
  }
};

const add = (message: string, options?: ToastOptions): string => {
  const id = `crust-${++state.seq}`;
  const raw = options?.duration;
  const duration = raw === undefined ? 4000 : raw === 0 ? Infinity : raw;
  const next: Toast = {
    id,
    message,
    title: options?.title,
    type: options?.type ?? 'info',
    duration,
    icon: options?.icon
  };
  if (state.toasts.length < state.maxVisible) {
    state.toasts = [...state.toasts, next];
    startTimer(next);
    emit();
  } else {
    // Queued toasts get their timer on promotion — they must not expire unseen.
    state.queue.push(next);
  }
  return id;
};

const remove = (id: string) => {
  clearTimer(id);
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

const removeAll = () => {
  for (const id of [...state.timers.keys()]) clearTimer(id);
  state.queue.length = 0;
  if (state.toasts.length === 0) return;
  state.toasts = [];
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
  pause,
  resume,
  configure
};

type Shorthand = (message: string, options?: Omit<ToastOptions, 'type'>) => string;

const shorthand =
  (type: ToastType): Shorthand =>
  (message, options) =>
    add(message, { ...options, type });

export const toast = Object.assign(
  (message: string, options?: ToastOptions): string => add(message, options),
  {
    success: shorthand('success'),
    error: shorthand('error'),
    info: shorthand('info'),
    /** Dismiss one toast by id, or every toast (and the queue) with no argument. */
    dismiss: (id?: string) => (id === undefined ? removeAll() : remove(id))
  }
);
