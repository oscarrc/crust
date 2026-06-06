---
layout: ../../layouts/DocsLayout.astro
title: Theming & icons
---

## Custom properties

Crust ships a warm matte theme with automatic dark mode. Every token is a
CSS custom property on `.crust-region` — override what you need, keep the
rest:

```css
.crust-region {
  --crust-surface: oklch(0.98 0.005 75);
  --crust-ink: oklch(0.28 0.012 75);
  --crust-radius: 10px;
  --crust-width: 360px;
  --crust-success: oklch(0.55 0.12 150);
  --crust-error: oklch(0.55 0.15 30);
  --crust-info: oklch(0.55 0.1 250);
  --crust-dur-in: 320ms;
  --crust-dur-morph: 280ms;
  --crust-dur-out: 200ms;
}
```

| Token group | Properties |
| ----------- | ---------- |
| Surfaces    | `--crust-surface`, `--crust-ink`, `--crust-ink-muted`, `--crust-border`, `--crust-shadow` |
| Semantics   | `--crust-success`, `--crust-error`, `--crust-info`, `--crust-warning` (icon strokes only) |
| Shape       | `--crust-radius`, `--crust-width`, `--crust-offset`, `--crust-z` |
| Motion      | `--crust-ease`, `--crust-ease-exit`, `--crust-dur-in`, `--crust-dur-morph`, `--crust-dur-out` |

Typography inherits from your page — Crust never loads a font.

## Icons

Icons accept a raw SVG string, a DOM `Element` (cloned per toast), or a
factory function. Set them globally per type, or per toast:

```ts
import { mountToaster, toast } from '@oscarrc/crust/vanilla';
import { createElement, Croissant, Flame } from 'lucide';

mountToaster({
  icons: {
    success: () => createElement(Croissant),
    error: '<svg viewBox="0 0 24 24">…</svg>'
  }
});

toast('One-off icon', { icon: () => createElement(Flame) });
toast('No icon at all', { icon: null });
```

Works with [`lucide`](https://lucide.dev) (vanilla) and `lucide-static`
(strings). `lucide-react` JSX components won't work — the renderer is
vanilla DOM, not React.

The built-in icons are stroke-drawn with `pathLength="1"`, which powers the
draw-in animation. Custom stroke icons can opt in by adding
`class="crust-draw"` and `pathLength="1"` to their paths.
