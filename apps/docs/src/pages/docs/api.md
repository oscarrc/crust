---
layout: ../../layouts/DocsLayout.astro
title: API
---

## `toast(message, options?)`

Returns the toast's `id`.

| Option     | Type                              | Default  | Notes                                            |
| ---------- | --------------------------------- | -------- | ------------------------------------------------ |
| `title`    | `string`                          | —        | Shown in the capsule; unlocks the morph-expand   |
| `type`     | `'success' \| 'error' \| 'info' \| 'warning' \| 'loading'` | `'info'` | Picks the icon and its color |
| `duration` | `number`                          | `4000`   | ms. `Infinity` (or `0`) never auto-dismisses     |
| `icon`     | `string \| Element \| () => Element \| null` | per type | Overrides the icon; `null` hides it   |

### Shorthands

```ts
toast.success('Saved');
toast.error('That broke.');
toast.info('Heads up.');
toast.warning('Careful with that.');
toast.loading('Working…'); // persistent until updated or dismissed
```

### Updating

Patch a live (or still-queued) toast in place — the surface re-renders
inside the same cell, and a new `duration` restarts the timer from now:

```ts
const id = toast.loading('Uploading…');
toast.update(id, { message: 'Uploaded', type: 'success', duration: 4000 });
```

### Promises

Sugar over `loading` + `update`: shows a spinner toast, then morphs it into
the outcome when the promise settles. `success`/`error` accept a string, a
`{ message, title }` object, or a function of the value/reason:

```ts
toast.promise(saveDraft(), {
  loading: 'Saving draft…',
  success: (draft) => `Saved “${draft.title}”`,
  error: (e) => `Save failed: ${(e as Error).message}`
});
```

### Dismissing

```ts
const id = toast('Working…', { duration: Infinity });
toast.dismiss(id); // one toast
toast.dismiss();   // everything, including the queue
```

## `mountToaster(options?)`

Mounts the renderer (vanilla path — `<Toaster />` does this for you in
React). Returns `{ unmount() }`. Idempotent: a second call returns the
existing handle.

| Option       | Type                                         | Default          |
| ------------ | -------------------------------------------- | ---------------- |
| `position`   | `'top-left' \| 'top-center' \| 'top-right' \| 'bottom-left' \| 'bottom-center' \| 'bottom-right'` | `'bottom-right'` |
| `icons`      | `Partial<Record<type, icon>>`                | built-in SVGs    |
| `maxVisible` | `number`                                     | `5`              |

Toasts beyond `maxVisible` queue, and a queued toast's timer only starts
when it's promoted on screen — nothing expires unseen.

## Behavior notes

- **Morph-expand** — a toast with a `title` shows it in the compact capsule;
  hover, focus or tap grows the same surface to reveal the message. The
  auto-dismiss timer pauses while expanded or hovered.
- **Accessibility** — the region is `role="status"` / `aria-live="polite"`;
  every toast carries a keyboard-reachable dismiss button; all motion
  collapses to fades under `prefers-reduced-motion`.

## `useToasts()` (React)

Concurrent-safe read of the active toasts via `useSyncExternalStore` — for
badge counts and the like. Rendering stays in the toaster.

## Non-goals (v0)

Deliberately not included: JSX toast content (the renderer is vanilla DOM —
that's what makes the React-free story work). Everything else you'd expect
is in.
