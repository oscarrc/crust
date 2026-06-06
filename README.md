# 🍞 Crust

[![npm](https://img.shields.io/npm/v/@oscarrc/crust)](https://www.npmjs.com/package/@oscarrc/crust)
[![CI](https://github.com/oscarrc/crust/actions/workflows/ci.yml/badge.svg)](https://github.com/oscarrc/crust/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

Don't throw the crust. An opinionated, crisp, and zero-waste toast library built natively for Astro and React.

Most toast libraries are bloated white bread. They force you into wrapper fatigue, endless configuration files, and a hard React dependency just to slide a notification onto the screen.

**Crust is different.** The renderer is vanilla DOM — a React-free Astro site is a first-class citizen, and React gets a thin, concurrent-safe bridge on top. Warm matte surfaces, a capsule that grows into a card as one continuous surface, and rock-solid defaults. Take it or leave it — just like the crust.

**[Docs & playground →](https://crust.oscarrc.me)**

---

## Why Crust?

- 🚀 **Astro-first, honestly.** The core renders with plain DOM. No React island required to *show* toasts — React is an optional peer dependency.
- 🫙 **One shared store.** Trigger from an Astro `<script>`, a React island, or anywhere else: same toaster, same stack, no provider, no context.
- 🔥 **Crisp & opinionated.** A tactile morph-expand interaction and an organic motion profile (ease-out-quint, nothing over 320ms, zero bounce). No spending 40 minutes tweaking cubic-béziers.
- ♿ **Accessible by default.** `aria-live` region, keyboard-reachable dismiss, timers that pause while you read, and `prefers-reduced-motion` as a first-class theme.
- 📦 **Zero-waste footprint.** ESM-only, ~2 KB of JS, one CSS file, no dependencies.

## Quickstart

Install the package:

```bash
pnpm add @oscarrc/crust
```

Import the styles and mount the toaster once, at the root of your layout — no React, no provider:

```ts
import '@oscarrc/crust/styles.css';
import { mountToaster } from '@oscarrc/crust/vanilla';

mountToaster(); // bottom-right by default
```

Then bake toasts from anywhere:

```ts
import { toast } from '@oscarrc/crust/vanilla';

toast.success('Fresh bread out of the oven!');

// A title makes a toast expandable — it morphs open on hover/focus/tap,
// or on its own with `expandAfter`:
toast('Your order shipped today.', {
  title: 'Order update',
  expandAfter: 2000 // auto-expands 2s after becoming visible
});

// Async flows: loading → success/error, opening the outcome by itself:
toast.promise(saveDraft(), {
  loading: 'Saving…',
  success: (draft) => ({ title: 'Saved', message: `“${draft.name}” is safe.` }),
  error: 'Save failed'
}, { expandOnSettle: true });
```

That's the whole setup. For React islands, view transitions, theming, and the rest, read on — or head to the **[docs & playground](https://crust.oscarrc.me)**.

## Usage

### 1. Pure Astro / vanilla JS — zero React

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
<button id="alert">Bake toast</button>
<script>
  import { toast } from '@oscarrc/crust/vanilla';
  document.getElementById('alert')?.addEventListener('click', () => {
    toast.success('Fresh bread out of the oven!', { title: 'Bakery live' });
  });
</script>
```

### 2. Astro with React islands

Mount `<Toaster />` once in your shell layout. With view transitions
(`<ClientRouter />`), `transition:persist` carries live toasts across page
navigations:

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

### 3. React (islands or plain apps)

```tsx
import { toast } from '@oscarrc/crust/vanilla';
import { useToasts } from '@oscarrc/crust/react';

export function Dashboard() {
  const active = useToasts();
  return (
    <button onClick={() => toast.info('Triggered inside an island!')}>
      Active toasts ({active.length})
    </button>
  );
}
```

## API at a glance

```ts
toast('message', { title, type, duration, icon });
toast.success('…'); toast.error('…'); toast.info('…'); toast.warning('…');

const id = toast.loading('Uploading…');          // persistent spinner
toast.update(id, { message: 'Done', type: 'success', duration: 4000 });

toast.promise(save(), {                           // loading → success/error
  loading: 'Saving…',
  success: (v) => `Saved ${v.name}`,
  error: 'Save failed'
});
toast('Read me', { title: 'Hi', expandAfter: 2000 }); // opens itself after 2s
// toast.promise(…, { expandOnSettle: true }) opens the outcome

toast.dismiss(id);  // one
toast.dismiss();    // all, queue included

mountToaster({ position: 'bottom-right', maxVisible: 5, icons: { … } });
```

- `duration` defaults to **4000ms**; `Infinity` (or `0`) means persistent.
- A toast with a `title` morphs open on hover/focus/tap to reveal its message; the timer pauses while you read.
- Icons accept an SVG string, an `Element`, or a factory — [`lucide`](https://lucide.dev) and `lucide-static` work out of the box (`lucide-react` doesn't; the renderer isn't React).
- Theme everything via `--crust-*` custom properties — see the [theming docs](https://crust.oscarrc.me/docs/theming/).

## Non-goals

Deliberately not in scope: JSX toast content — the renderer is vanilla DOM,
which is exactly what makes the React-free story work. Opinionated means
opinionated.

## Development

```bash
pnpm install     # link workspaces
pnpm build:lib   # build the package → packages/crust/dist
pnpm test        # vitest: store, renderer, react bridge
pnpm dev         # tsup --watch + astro dev (docs playground)
```

Releases are automated: conventional commits → [release-please](https://github.com/googleapis/release-please) PR → merge → npm publish with provenance.

## License

[MIT](./LICENSE) © Oscar Rey
