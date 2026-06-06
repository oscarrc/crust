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
  info: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle class="crust-draw" cx="12" cy="12" r="9" pathLength="1"/><path class="crust-draw" d="M12 11v5" pathLength="1"/><path class="crust-draw" d="M12 8v.01" pathLength="1"/></svg>'
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

  const cells = new Map<string, HTMLElement>();

  const buildCell = (item: Toast): HTMLElement => {
    const expandable = Boolean(item.title);

    const cell = document.createElement('div');
    cell.className = 'crust-cell';
    const inner = document.createElement('div');
    inner.className = 'crust-cell-inner';

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

    inner.appendChild(el);
    cell.appendChild(inner);
    return cell;
  };

  const beginExit = (id: string, cell: HTMLElement) => {
    if (cell.dataset.leaving) return;
    cell.dataset.leaving = '1';
    cell.querySelector('.crust-toast')?.classList.add('crust-leaving');
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
    for (const [id, cell] of cells) {
      if (!visible.has(id)) beginExit(id, cell);
    }

    let batchIndex = 0;
    for (const item of toasts) {
      if (cells.has(item.id)) continue;
      const cell = buildCell(item);
      cells.set(item.id, cell);
      if (anchoredTop) region.prepend(cell);
      else region.append(cell);

      const delay = batchIndex * STAGGER_MS;
      if (delay > 0) cell.style.setProperty('--crust-stagger', `${delay}ms`);
      // Force a style flush so the entrance transition reliably fires.
      void cell.offsetHeight;
      cell.classList.add('crust-shown');
      if (delay > 0) {
        setTimeout(
          () => cell.style.removeProperty('--crust-stagger'),
          ENTER_MS + delay
        );
      }
      batchIndex += 1;
    }
  };

  const unsubscribe = toastStore.subscribe(render);
  render(toastStore.getSnapshot());

  mounted = {
    unmount: () => {
      unsubscribe();
      region.remove();
      cells.clear();
      mounted = null;
    }
  };
  return mounted;
};
