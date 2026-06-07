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

/** Swipe-to-dismiss: a horizontal drag commits past this fraction of the
    toast's width, or on a flick faster than the velocity (px/ms). Below
    the intent distance a touch is still a tap or a vertical scroll. */
const SWIPE_INTENT_PX = 12;
const SWIPE_DISMISS_RATIO = 0.35;
const SWIPE_FLICK_VELOCITY = 0.6;

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

  // Swipe-to-dismiss. The gesture drives the cell INNER, not the toast: the
  // inner's overflow clip travels with its own transform (a translated toast
  // would be cut off at the cell edge), it carries no CSS transition to
  // fight the 1:1 drag, and it survives content rebuilds mid-gesture — the
  // toast element is replaced inside it, never around it.
  const wireSwipe = (inner: HTMLElement, id: string) => {
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;
    let suppressClick = false;

    const toastEl = () => inner.querySelector<HTMLElement>('.crust-toast');

    inner.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (inner.classList.contains('crust-swipe-exit')) return;
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      startY = event.clientY;
      lastT = event.timeStamp;
      velocity = 0;
      suppressClick = false;
    });

    inner.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      if (!dragging) {
        // Horizontal intent only: taps stay clicks, vertical pans keep
        // scrolling the message (touch-action: pan-y does the native half).
        const dy = event.clientY - startY;
        if (Math.abs(dx) < SWIPE_INTENT_PX || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        dragging = true;
        suppressClick = true;
        inner.classList.remove('crust-swipe-return');
        inner.setPointerCapture?.(event.pointerId);
        toastEl()?.classList.add('crust-swiping');
        toastStore.pause(id);
      }
      // Real pointermoves arrive a frame apart; sub-frame samples would
      // make the velocity meaninglessly large.
      const dt = event.timeStamp - lastT;
      if (dt > 4) {
        velocity = (event.clientX - lastX) / dt;
        lastX = event.clientX;
        lastT = event.timeStamp;
      }
      inner.style.transform = `translateX(${dx}px)`;
      inner.style.opacity = String(
        Math.max(0.25, 1 - Math.abs(dx) / (inner.offsetWidth || 360))
      );
    });

    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = -1;
      if (!dragging) return;
      dragging = false;
      toastEl()?.classList.remove('crust-swiping');

      const dx = event.clientX - startX;
      const width = inner.offsetWidth || 360;
      const flick =
        Math.abs(velocity) > SWIPE_FLICK_VELOCITY &&
        Math.sign(velocity) === Math.sign(dx);
      const dismiss =
        event.type === 'pointerup' &&
        (Math.abs(dx) > width * SWIPE_DISMISS_RATIO || flick);

      if (dismiss) {
        // Slide off in the gesture's direction while the cell collapses —
        // the exit is the swipe finishing itself, no capsule stopover.
        inner.classList.add('crust-swipe-exit');
        inner.style.transform = `translateX(${Math.sign(dx) * (width + 48)}px)`;
        inner.style.opacity = '0';
        toastStore.remove(id);
        return;
      }

      // Spring back to rest; the transition lives on a class so the next
      // drag is 1:1 again.
      inner.classList.add('crust-swipe-return');
      inner.style.transform = '';
      inner.style.opacity = '';
      const settled = () => inner.classList.remove('crust-swipe-return');
      inner.addEventListener('transitionend', settled, { once: true });
      setTimeout(settled, EXIT_FALLBACK_MS);
      // Touch has no hover to hand the pause back to; a mouse is still over
      // the toast, so mouseleave keeps owning the resume.
      if (event.pointerType !== 'mouse' && !toastEl()?.dataset.pinned) {
        toastStore.resume(id);
      }
    };
    inner.addEventListener('pointerup', release);
    inner.addEventListener('pointercancel', release);

    // A drag that ends over the toast still emits a click; swallow it so a
    // swipe never doubles as tap-to-pin (or tap-to-dismiss).
    inner.addEventListener(
      'click',
      (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true
    );
  };

  const buildCell = (item: Toast): CellEntry => {
    const cell = document.createElement('div');
    cell.className = 'crust-cell';
    const inner = document.createElement('div');
    inner.className = 'crust-cell-inner';
    const el = buildToastEl(item);
    inner.appendChild(el);
    cell.appendChild(inner);
    wireSwipe(inner, item.id);
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
