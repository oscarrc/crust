---
layout: ../../layouts/DocsLayout.astro
title: Getting started
---

> If you arrived here with a toast still on screen: that's Crust carrying its
> toaster across an Astro view transition. Nothing re-mounted, no timer reset.

Crust is a toast library with one store and one renderer. The renderer is
vanilla DOM, so it runs anywhere a `<script>` runs — a React-free Astro site
is a first-class citizen, not a fallback. React support is a thin component
over the same machinery.

## Install

```bash
pnpm add @oscarrc/crust
```

Crust has zero hard dependencies. React is an optional peer — install it only
if you use the React entry point.

Include the stylesheet once, wherever your global styles live:

```ts
import '@oscarrc/crust/styles.css';
```

## 1. Pure Astro — no React anywhere

Mount the toaster once in your layout, then trigger toasts from any script on
any page:

```astro
---
// src/layouts/Layout.astro
import '@oscarrc/crust/styles.css';
---
<html>
  <body>
    <slot />
    <script>
      import { mountToaster } from '@oscarrc/crust/vanilla';
      mountToaster();
    </script>
  </body>
</html>
```

```astro
<button data-save>Save</button>
<script>
  import { toast } from '@oscarrc/crust/vanilla';
  // Delegate from `document` — with Astro view transitions, listeners
  // bound to specific elements die when the <body> is swapped.
  document.addEventListener('click', (event) => {
    if (!(event.target as HTMLElement).closest('[data-save]')) return;
    toast.success('Saved', { message: 'Fresh bread out of the oven.' });
  });
</script>
```

`mountToaster()` is idempotent — calling it twice returns the same handle, so
you never end up with two toasters.

## 2. Astro with React islands

Use the `<Toaster />` component instead of `mountToaster()`. With Astro view
transitions (`<ClientRouter />`), add `transition:persist` so the island —
and any live toasts, timers included — survives page navigation:

```astro
---
import { ClientRouter } from 'astro:transitions';
import { Toaster } from '@oscarrc/crust/react';
import '@oscarrc/crust/styles.css';
---
<html>
  <head><ClientRouter /></head>
  <body>
    <slot />
    <Toaster client:load transition:persist />
  </body>
</html>
```

Triggers work identically from islands and plain scripts — it's one shared
store:

```tsx
import { toast } from '@oscarrc/crust/vanilla';
import { useToasts } from '@oscarrc/crust/react';

export function Dashboard() {
  const active = useToasts();
  return (
    <button onClick={() => toast.info('From inside an island.')}>
      Active toasts: {active.length}
    </button>
  );
}
```

The badge on the [landing page](../) works exactly like this — vanilla
buttons and a React island feeding one store.

## 3. Plain React apps

Crust isn't Astro-exclusive. Mount `<Toaster />` once near your app root and
call `toast()` from anywhere — no provider, no context:

```tsx
import { Toaster } from '@oscarrc/crust/react';
import '@oscarrc/crust/styles.css';

export function App() {
  return (
    <>
      <Routes />
      <Toaster />
    </>
  );
}
```

Keep the `<Toaster />` at the root, outside your route outlet. Client-side
route changes then never touch it, and toasts ride along across navigations
for free.

## Your first toast

```ts
import { toast } from '@oscarrc/crust/vanilla';

toast('Plain and simple.');
toast.success('Saved', { message: 'It worked.' });
toast.error('Burnt', { message: 'It did not.', duration: 8000 });
```

Give a toast a `message` and it gains Crust's signature move: the compact
capsule morphs into a card on hover, focus or tap — one continuous surface,
message revealed. Head to the [API](./api/) for everything else, or the
[playground](../playground/) to try every option live.
