export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

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
  /** Arrive with the message panel open (pinned). */
  expanded?: boolean;
  /** ms after becoming visible until the toast auto-expands. Needs a `title`. */
  expandAfter?: number;
}

export interface Toast {
  id: string;
  message: string;
  title?: string;
  type: ToastType;
  duration: number;
  icon?: CrustIcon | null;
  expanded?: boolean;
  expandAfter?: number;
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
  if (!toast.title || toast.expandAfter === undefined) return;
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

const normalizeDuration = (raw: number | undefined): number =>
  raw === undefined ? 4000 : raw === 0 ? Infinity : raw;

const add = (message: string, options?: ToastOptions): string => {
  const id = `crust-${++state.seq}`;
  const duration = normalizeDuration(options?.duration);
  const next: Toast = {
    id,
    message,
    title: options?.title,
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

const removeAll = () => {
  for (const id of [...state.timers.keys()]) clearTimer(id);
  for (const id of [...state.expandTimers.keys()]) clearExpandTimer(id);
  state.queue.length = 0;
  if (state.toasts.length === 0) return;
  state.toasts = [];
  emit();
};

export type ToastPatch = Partial<Omit<Toast, 'id'>>;

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

type ToastContent = string | { message: string; title?: string };

export interface PromiseMessages<T> {
  loading: ToastContent;
  success: ToastContent | ((value: T) => ToastContent);
  error: ToastContent | ((reason: unknown) => ToastContent);
}

const asPatch = (content: ToastContent): { message: string; title?: string } =>
  typeof content === 'string' ? { message: content } : content;

const settle = <V>(
  content: ToastContent | ((value: V) => ToastContent),
  value: V
): ToastContent => (typeof content === 'function' ? content(value) : content);

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
    warning: shorthand('warning'),
    /** Loading toasts persist until updated or dismissed. */
    loading: (message: string, options?: Omit<ToastOptions, 'type'>) =>
      add(message, { duration: Infinity, ...options, type: 'loading' }),
    /** Patch a live (or queued) toast. A new `duration` restarts its timer. */
    update: (id: string, patch: ToastPatch) => update(id, patch),
    /**
     * Show a loading toast that morphs into success/error when the
     * promise settles. Returns the toast id.
     */
    promise: <T>(
      promise: Promise<T>,
      messages: PromiseMessages<T>,
      options?: Omit<ToastOptions, 'type' | 'duration'> & {
        duration?: number;
        /** Open the outcome's message panel when the promise settles. */
        expandOnSettle?: boolean;
      }
    ): string => {
      const { expandOnSettle, ...baseOptions } = options ?? {};
      const id = add(asPatch(messages.loading).message, {
        ...baseOptions,
        title: asPatch(messages.loading).title ?? baseOptions.title,
        type: 'loading',
        duration: Infinity
      });
      const conclude = (type: ToastType, content: ToastContent) =>
        update(id, {
          title: undefined,
          ...asPatch(content),
          type,
          duration: normalizeDuration(baseOptions.duration),
          ...(expandOnSettle ? { expanded: true } : {})
        });
      promise
        .then((value) => conclude('success', settle(messages.success, value)))
        .catch((reason) => conclude('error', settle(messages.error, reason)));
      return id;
    },
    /** Dismiss one toast by id, or every toast (and the queue) with no argument. */
    dismiss: (id?: string) => (id === undefined ? removeAll() : remove(id))
  }
);

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

export type ToasterPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface ToasterOptions {
  /** Corner/edge the stack anchors to. Default `'bottom-right'`. */
  position?: ToasterPosition;
  /** Replace the built-in state icons. `null` hides a type's icon. */
  icons?: Partial<Record<ToastType, CrustIcon | null>>;
  /** Max toasts on screen at once; the rest queue. Default 5. */
  maxVisible?: number;
}

export interface ToasterHandle {
  unmount: () => void;
}

// Stroke-drawn defaults: pathLength="1" lets CSS run the draw-in
// with a unitless dasharray, independent of actual path length.
const DEFAULT_ICONS: Record<ToastType, string> = {
  success:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="crust-draw" d="M4.5 12.5l5 5L19.5 7" pathLength="1"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="crust-draw" d="M6.5 6.5l11 11M17.5 6.5l-11 11" pathLength="1"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle class="crust-draw" cx="12" cy="12" r="9" pathLength="1"/><path class="crust-draw" d="M12 11v5" pathLength="1"/><path class="crust-draw" d="M12 8v.01" pathLength="1"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="crust-draw" d="M12 3.5 21.5 20h-19Z" pathLength="1"/><path class="crust-draw" d="M12 10v4" pathLength="1"/><path class="crust-draw" d="M12 17v.01" pathLength="1"/></svg>',
  loading:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="crust-spin" d="M12 3a9 9 0 1 1-8.6 6.3"/></svg>'
};

const DISMISS_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

/** Keep in sync with --crust-dur-* in styles.css; fallback removal guard. */
const EXIT_FALLBACK_MS = 450;
const ENTER_MS = 320;
const STAGGER_MS = 50;

const fromMarkup = (markup: string): Element | null => {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
};

const resolveIcon = (
  toast: Toast,
  icons: ToasterOptions['icons']
): Element | null => {
  const pick =
    toast.icon !== undefined
      ? toast.icon
      : icons && icons[toast.type] !== undefined
        ? icons[toast.type]
        : DEFAULT_ICONS[toast.type];
  if (pick == null) return null;
  if (typeof pick === 'string') return fromMarkup(pick);
  if (typeof pick === 'function') return pick();
  return pick.cloneNode(true) as Element;
};

let mounted: ToasterHandle | null = null;

export const mountToaster = (options: ToasterOptions = {}): ToasterHandle => {
  if (typeof document === 'undefined') {
    throw new Error(
      '[crust] mountToaster needs a DOM — call it from client-side code only.'
    );
  }
  if (mounted) return mounted;

  const position = options.position ?? 'bottom-right';
  const anchoredTop = position.startsWith('top');
  if (options.maxVisible !== undefined) {
    configure({ maxVisible: options.maxVisible });
  }

  const region = document.createElement('section');
  region.className = `crust-region crust-pos-${position}`;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(region);

  interface CellEntry {
    cell: HTMLElement;
    inner: HTMLElement;
    el: HTMLElement;
    item: Toast;
  }

  const cells = new Map<string, CellEntry>();

  const buildToastEl = (item: Toast): HTMLElement => {
    const expandable = Boolean(item.title);

    const el = document.createElement('div');
    el.className = `crust-toast crust-${item.type}${expandable ? ' crust-expandable' : ''}`;
    el.dataset.id = item.id;

    const capsule = document.createElement('div');
    capsule.className = 'crust-capsule';

    const iconEl = resolveIcon(item, options.icons);
    if (iconEl) {
      const icon = document.createElement('span');
      icon.className = 'crust-icon';
      icon.appendChild(iconEl);
      capsule.appendChild(icon);
    }

    const title = document.createElement('span');
    title.className = 'crust-title';
    title.textContent = item.title ?? item.message;
    capsule.appendChild(title);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'crust-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.innerHTML = DISMISS_ICON;
    dismiss.addEventListener('click', (event) => {
      event.stopPropagation();
      remove(item.id);
    });
    capsule.appendChild(dismiss);

    el.appendChild(capsule);

    if (expandable) {
      // Message lives in a 0fr grid row; expanding grows the same
      // surface — one container, constant radius, no second panel.
      const body = document.createElement('div');
      body.className = 'crust-body';
      const bodyInner = document.createElement('div');
      bodyInner.className = 'crust-body-inner';
      const msg = document.createElement('p');
      msg.className = 'crust-msg';
      msg.textContent = item.message;
      bodyInner.appendChild(msg);
      body.appendChild(bodyInner);
      el.appendChild(body);
    }

    const expand = () => expandable && el.classList.add('crust-expanded');
    const collapse = () => {
      if (el.dataset.pinned) return;
      el.classList.remove('crust-expanded');
    };

    el.addEventListener('mouseenter', () => {
      pause(item.id);
      expand();
    });
    el.addEventListener('mouseleave', () => {
      if (el.dataset.pinned) return;
      collapse();
      resume(item.id);
    });
    el.addEventListener('focusin', () => {
      pause(item.id);
      expand();
    });
    el.addEventListener('focusout', (event) => {
      if (el.contains(event.relatedTarget as Node | null)) return;
      if (el.dataset.pinned) return;
      collapse();
      resume(item.id);
    });
    el.addEventListener('click', () => {
      if (!expandable) {
        remove(item.id);
        return;
      }
      // Touch/click pins the expanded state open (timer stays paused).
      if (el.dataset.pinned) {
        delete el.dataset.pinned;
        collapse();
        resume(item.id);
      } else {
        el.dataset.pinned = '1';
        pause(item.id);
        expand();
      }
    });

    return el;
  };

  const buildCell = (item: Toast): CellEntry => {
    const cell = document.createElement('div');
    cell.className = 'crust-cell';
    const inner = document.createElement('div');
    inner.className = 'crust-cell-inner';
    const el = buildToastEl(item);
    inner.appendChild(el);
    cell.appendChild(inner);
    return { cell, inner, el, item };
  };

  const applyExpansion = (el: HTMLElement) => {
    if (!el.classList.contains('crust-expandable')) return;
    // Style flush first so the morph transitions exactly like a hover.
    void el.offsetHeight;
    el.classList.add('crust-expanded');
    el.dataset.pinned = '1';
  };

  const updateCell = (entry: CellEntry, item: Toast) => {
    // Content changed (toast.update / toast.promise): rebuild the toast
    // element inside the same cell, carrying interaction state over.
    const fresh = buildToastEl(item);
    if (fresh.classList.contains('crust-expandable')) {
      // The live element's gesture state is authoritative across rebuilds —
      // including a user's collapse of a previously store-expanded toast.
      fresh.classList.toggle(
        'crust-expanded',
        entry.el.classList.contains('crust-expanded')
      );
      if (entry.el.dataset.pinned) fresh.dataset.pinned = entry.el.dataset.pinned;
    }
    // Expansion is a command edge: only a CHANGE to expanded:true forces the
    // panel open (re-issuing it on an already-expanded item is not an edge).
    const newlyExpanded = item.expanded === true && entry.item.expanded !== true;
    entry.el.replaceWith(fresh);
    entry.el = fresh;
    entry.item = item;
    if (newlyExpanded) applyExpansion(fresh);
  };

  const beginExit = (id: string, entry: CellEntry) => {
    const { cell } = entry;
    if (cell.dataset.leaving) return;
    cell.dataset.leaving = '1';
    entry.el.classList.add('crust-leaving');
    cell.classList.remove('crust-shown');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cell.remove();
      cells.delete(id);
    };
    const fallback = setTimeout(finish, EXIT_FALLBACK_MS);
    cell.addEventListener('transitionend', (event) => {
      if (event.target !== cell) return;
      clearTimeout(fallback);
      finish();
    });
  };

  const render = (toasts: readonly Toast[]) => {
    const visible = new Set(toasts.map((t) => t.id));
    for (const [id, entry] of cells) {
      if (!visible.has(id)) beginExit(id, entry);
    }

    let batchIndex = 0;
    for (const item of toasts) {
      const existing = cells.get(item.id);
      if (existing) {
        if (existing.item !== item) updateCell(existing, item);
        continue;
      }

      const entry = buildCell(item);
      cells.set(item.id, entry);
      if (anchoredTop) region.prepend(entry.cell);
      else region.append(entry.cell);

      const delay = batchIndex * STAGGER_MS;
      if (delay > 0) entry.cell.style.setProperty('--crust-stagger', `${delay}ms`);
      // Force a style flush so the entrance transition reliably fires.
      void entry.cell.offsetHeight;
      entry.cell.classList.add('crust-shown');
      // Arrive-expanded toasts morph open as part of the same entrance.
      if (item.expanded === true) applyExpansion(entry.el);
      if (delay > 0) {
        setTimeout(
          () => entry.cell.style.removeProperty('--crust-stagger'),
          ENTER_MS + delay
        );
      }
      batchIndex += 1;
    }
  };

  const unsubscribe = toastStore.subscribe(render);
  render(toastStore.getSnapshot());

  const handle: ToasterHandle = {
    unmount: () => {
      unsubscribe();
      region.remove();
      cells.clear();
      // A stale handle (kept across an unmount/remount cycle) must not
      // orphan the currently-active toaster.
      if (mounted === handle) mounted = null;
    }
  };
  mounted = handle;
  return handle;
};
