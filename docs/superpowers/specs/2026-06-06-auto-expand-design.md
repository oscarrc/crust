# Auto-expand — Design Spec

Date: 2026-06-06
Status: approved

## Problem

Crust's morph-expand currently only triggers on user gestures (hover, focus,
click/tap). Two cases need the toast to open itself:

1. Draw attention to the message after a delay ("expand after N seconds").
2. Show the outcome of a `toast.promise` when it settles.

## Decisions (from brainstorming)

- **Timer semantics:** auto-expanding **restarts** the auto-dismiss timer —
  new content just appeared, the reader gets the full duration. (Chosen over
  "timer keeps running" and "timer pauses".)
- **API shape:** primitive + sugar. `expanded` is the single low-level
  mechanism; `expandAfter` and `expandOnSettle` are thin conveniences over it.
- **Gesture merge rule:** expanded-by-intent is **pinned**, expanded-by-hover
  is transient.

## API

### Primitive: `expanded?: boolean`

- New field on `Toast`, accepted in `ToastOptions` (arrive open) and
  `ToastPatch` (open/close programmatically).
- `update(id, { expanded: true })` restarts the auto-dismiss timer.
  At creation, no timer interaction — the toast simply arrives open.
- Visible in `useToasts()` snapshots.
- Public but documented as low-level; the sugar options are the front door.
- `expanded: false` in a patch unpins/collapses via the same path; works but
  undocumented (no use case yet).

### Sugar: `expandAfter?: number` (ToastOptions)

- ms until the store fires `update(id, { expanded: true })` internally.
- Clock starts when the toast becomes **visible** (queue promotion), same
  rule as duration timers.
- Cancelled on dismiss. No-op (apart from pinning) if already expanded by
  gesture. Ignored for toasts without a title (nothing to expand).
- Independent of the hover pause: hovering pauses the *dismiss* timer, but
  the expandAfter schedule still fires (firing while hovered just pins).

### Sugar: `expandOnSettle?: boolean` (toast.promise options)

- The settle-time `update()` adds `expanded: true` — both success and error
  outcomes. Timer restart comes free (that update already sets `duration`).

## Renderer

- Store-driven `expanded: true` renders the toast open **and pinned**
  (`data-pinned`), identical to today's click-to-pin: mouseleave won't
  collapse, a click will, dismiss ✕ works.
- Collapsing via gesture does **not** write back to the store — `expanded`
  is a command edge, not two-way bound state.
- `updateCell` already preserves pinned/expanded classes across in-place
  content updates; store-driven expansion flows through the same path.
- `prefers-reduced-motion`: expansion is instant (existing CSS).

## Testing

Store (`test/store.test.ts`):
- `expanded: true` at creation appears in the snapshot.
- `update(id, { expanded: true })` restarts the dismiss timer.
- `expandAfter` fires after N ms; cancelled by dismiss; starts on queue
  promotion, not add.
- `expandOnSettle` expands on resolve and on reject.

Renderer (`test/renderer.test.ts`):
- Store-driven expand renders `.crust-expanded` + `data-pinned`.
- Click collapses a store-expanded toast.
- `expandAfter` on a title-less toast is a no-op.

## Out of scope

- Documenting `expanded: false` as a public collapse command.
- Conditional variants (`expandOnSettle: 'error'`-style filtering).
