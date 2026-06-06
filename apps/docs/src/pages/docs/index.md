---
layout: ../../layouts/DocsLayout.astro
title: Getting started
---

> If you arrived here with a toast still on screen: that's `transition:persist`
> carrying the toaster across an Astro page navigation. Nothing re-mounted.

## Install

```bash
pnpm add @oscarrc/crust
```

Include the standalone stylesheet once, at the root of your layout:

```ts
import '@oscarrc/crust/styles.css';
```

## 1. Pure Astro — no React anywhere

The renderer is vanilla DOM, so a React-free Astro site is fully supported.
Mount the toaster once in your layout, trigger from any script:

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
<button id="save">Save</button>
<script>
  import { toast } from '@oscarrc/crust/vanilla';
  document.getElementById('save')?.addEventListener('click', () => {
    toast.success('Fresh bread out of the oven.', { title: 'Saved' });
  });
</script>
```

## 2. Astro with React islands

Use the `<Toaster />` component instead of `mountToaster()`. With Astro view
transitions (`<ClientRouter />`), add `transition:persist` so the toaster —
and any live toasts — survive page navigation:

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

## 3. Plain React apps

Crust isn't Astro-exclusive. Mount `<Toaster />` once near your app root and
call `toast()` from anywhere — no provider, no context.

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
