import { toastStore } from './store';
import type { CrustIcon, Toast, ToastType } from './store';

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
    toastStore.configure({ maxVisible: options.maxVisible });
  }

  const region = document.createElement('section');
  region.className = `crust-region crust-pos-${position}`;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(region);

  // Astro's ClientRouter swaps <body> on navigation; the region is created at
  // runtime so the incoming document never contains it. Re-adopt it after the
  // swap — live toasts (DOM, timers, pinned state) carry straight across.
  // Outside Astro the event never fires, so this is inert.
  const readopt = () => {
    if (!region.isConnected) document.body.appendChild(region);
  };
  document.addEventListener('astro:after-swap', readopt);

  interface CellEntry {
    cell: HTMLElement;
    inner: HTMLElement;
    el: HTMLElement;
    item: Toast;
  }

  const cells = new Map<string, CellEntry>();

  const buildToastEl = (item: Toast): HTMLElement => {
    const expandable = Boolean(item.message);

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
    title.textContent = item.title;
    capsule.appendChild(title);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'crust-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.innerHTML = DISMISS_ICON;
    dismiss.addEventListener('click', (event) => {
      event.stopPropagation();
      toastStore.remove(item.id);
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
      // `expandable` already guarantees a message; satisfy the narrowing.
      msg.textContent = item.message ?? null;
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
      toastStore.pause(item.id);
      expand();
    });
    el.addEventListener('mouseleave', () => {
      if (el.dataset.pinned) return;
      collapse();
      toastStore.resume(item.id);
    });
    el.addEventListener('focusin', () => {
      toastStore.pause(item.id);
      expand();
    });
    el.addEventListener('focusout', (event) => {
      if (el.contains(event.relatedTarget as Node | null)) return;
      if (el.dataset.pinned) return;
      collapse();
      toastStore.resume(item.id);
    });
    el.addEventListener('click', () => {
      if (!expandable) {
        toastStore.remove(item.id);
        return;
      }
      // Touch/click pins the expanded state open (timer stays paused).
      if (el.dataset.pinned) {
        delete el.dataset.pinned;
        collapse();
        toastStore.resume(item.id);
      } else {
        el.dataset.pinned = '1';
        toastStore.pause(item.id);
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
    const old = entry.item;
    // Expansion is a command edge: only a CHANGE to expanded:true forces the
    // panel open (re-issuing it on an already-expanded item is not an edge).
    const newlyExpanded = item.expanded === true && old.expanded !== true;
    const contentChanged =
      item.message !== old.message ||
      item.title !== old.title ||
      item.type !== old.type ||
      item.icon !== old.icon;

    if (!contentChanged) {
      // Nothing rendered has changed — act on the live element, exactly
      // like a hover. No rebuild, no icon redraw.
      entry.item = item;
      if (newlyExpanded) applyExpansion(entry.el);
      return;
    }

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
    entry.el.replaceWith(fresh);
    entry.el = fresh;
    entry.item = item;
    if (newlyExpanded) applyExpansion(fresh);
  };

  const beginExit = (id: string, entry: CellEntry) => {
    const { cell } = entry;
    if (cell.dataset.leaving) return;
    cell.dataset.leaving = '1';

    const startExit = () => {
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

    // The exit is the opening in reverse, as one continuous gesture: the
    // morph closes (body + width, at exit speed via .crust-leaving CSS)
    // while the cell collapses and the surface fades — no capsule stopover.
    entry.el.classList.remove('crust-expanded');
    delete entry.el.dataset.pinned;
    startExit();
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
      document.removeEventListener('astro:after-swap', readopt);
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
