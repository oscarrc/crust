---
layout: ../../layouts/DocsLayout.astro
title: API
---

Everything lives behind two imports: `toast` to fire notifications and
`mountToaster` to render them. The React entry adds `<Toaster />` and
`useToasts()` over the same store.

## `toast(title, options?)`

Fires a toast and returns its `id`. The `title` is the capsule text, always
visible. A `message` is the body copy hidden behind the morph-expand; very
long messages scroll inside the toast past `--crust-msg-max-height`
(default `40vh`), the title staying put above.

| Option        | Type                              | Default  | Notes                                            |
| ------------- | --------------------------------- | -------- | ------------------------------------------------ |
| `message`     | `string`                          | not set  | Body copy revealed on expand; enables the morph-expand |
| `type`        | `'success' \| 'error' \| 'info' \| 'warning' \| 'loading'` | `'info'` | Picks the icon and its color |
| `duration`    | `number`                          | `4000`   | ms. `Infinity` (or `0`) never auto-dismisses     |
| `icon`        | `string \| Element \| () => Element \| null` | per type | Overrides the icon; `null` hides it   |
| `expanded`    | `boolean`                         | `false`  | Arrive with the message panel already open (pinned) |
| `expandAfter` | `number`                          | not set  | ms after becoming visible until the toast auto-expands (needs `message`); restarts the dismiss timer when it fires |

### Shorthands

```ts
toast.success('Saved');
toast.error('That broke.');
toast.info('Heads up.');
toast.warning('Careful with that.');
toast.loading('Working...'); // persistent until updated or dismissed
```

### Updating

Patch a live (or still-queued) toast in place. The surface re-renders
inside the same cell, and a new `duration` restarts the timer from now:

```ts
const id = toast.loading('Uploading...');
toast.update(id, { title: 'Uploaded', type: 'success', duration: 4000 });
```

Patching `expanded: true` opens the message panel (pinned) and restarts the
dismiss timer. It's the primitive under `expandAfter` and `expandOnSettle`.

### Promises

Sugar over `loading` + `update`: shows a spinner toast, then morphs it into
the outcome when the promise settles. `success`/`error` accept a string
(used as the title), a `{ title, message? }` object, or a function of the
value/reason:

```ts
toast.promise(saveDraft(), {
  loading: 'Saving draft...',
  success: (draft) => `Saved "${draft.title}"`,
  error: (e) => `Save failed: ${(e as Error).message}`
}, { expandOnSettle: true });
```

With `expandOnSettle`, the outcome arrives with its message panel already
open, and the fresh duration gives the reader the full time to read it.
Note it only has a visible effect when the outcome content carries a
`message` (without one, the toast is just a capsule, with nothing to expand).

### Dismissing

```ts
const id = toast('Working...', { duration: Infinity });
toast.dismiss(id); // one toast
toast.dismiss();   // everything, including the queue
```

## `mountToaster(options?)`

Mounts the renderer. In the vanilla path, `<Toaster />` does this for you in
React). Returns `{ unmount() }`. Idempotent: a second call returns the
existing handle.

| Option       | Type                                         | Default          |
| ------------ | -------------------------------------------- | ---------------- |
| `position`   | `'top-left' \| 'top-center' \| 'top-right' \| 'bottom-left' \| 'bottom-center' \| 'bottom-right'` | `'bottom-right'` |
| `icons`      | `Partial<Record<type, icon>>`                | built-in SVGs    |
| `maxVisible` | `number`                                     | `5`              |

Toasts beyond `maxVisible` queue, and a queued toast's timer only starts
when it's promoted on screen. Nothing expires unseen.

Options are read once at mount. To change `position` at runtime (the
[playground](../../playground/) does this), unmount and remount. The store
is untouched, so live toasts re-render into the new region:

```ts
mountToaster().unmount();           // returns the active handle, then unmounts
mountToaster({ position: 'top-center' });
```

## `toastStore` (low-level)

Most apps never need this. It's the store both renderers sit on, exposed
for badge counts, custom renderers and tests:

```ts
import { toastStore } from '@oscarrc/crust/vanilla';

const unsubscribe = toastStore.subscribe((toasts) => { /* readonly Toast[] */ });
toastStore.getSnapshot(); // current toasts
toastStore.pause(id);     // freeze a dismiss timer
toastStore.resume(id);    // continue where it left off
toastStore.configure({ maxVisible: 3 });
```

## `useToasts()` (React)

Concurrent-safe read of the active toasts via `useSyncExternalStore`, for
badge counts and the like. Rendering stays in the toaster.

```tsx
const toasts = useToasts(); // readonly Toast[]
```

## Behavior notes

- **Morph-expand**: every toast shows its `title` in the compact capsule;
  give it a `message` and hover, focus or tap grows the same surface to
  reveal it. The auto-dismiss timer pauses while expanded or hovered.
- **View transitions**: with Astro's `<ClientRouter />`, Crust re-adopts its
  region after every swap, so live toasts (and their timers) carry straight
  across page navigations.
- **Accessibility**: the region is `role="status"` / `aria-live="polite"`;
  every toast carries a keyboard-reachable dismiss button; all motion
  collapses to fades under `prefers-reduced-motion`.

## Non-goals (v0)

Deliberately not included: JSX toast content (the renderer is vanilla DOM;
that's what makes the React-free story work). Everything else you'd expect
is in.
