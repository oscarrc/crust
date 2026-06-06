---
layout: ../../layouts/DocsLayout.astro
title: Theming & icons
---

Crust ships a warm matte theme with automatic dark mode, and assumes you'll
want to make it yours. Every token is a CSS custom property on
`.crust-region` — override what you need, keep the rest. Typography always
inherits from your page; Crust never loads a font.

## Custom properties

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

Semantic color is deliberately confined to the icon strokes — surfaces stay
neutral, text stays ink. If you override the semantic tokens, they'll still
only color the icons.

## Dark mode

Out of the box, Crust follows the operating system through
`prefers-color-scheme` — no setup, no flash.

If your site has its own theme toggle (a `.dark` class on `<html>` is the
common pattern), take over both halves explicitly. Your stylesheet loads
after Crust's, so flat declarations win the cascade over its media query:

```css
/* Pin the light theme regardless of OS… */
.crust-region {
  --crust-surface: oklch(0.98 0.005 75);
  --crust-ink: oklch(0.28 0.012 75);
}

/* …and switch on your class instead. */
.dark .crust-region {
  --crust-surface: oklch(0.26 0.01 60);
  --crust-ink: oklch(0.93 0.008 80);
  --crust-border: oklch(0.35 0.012 60);
}
```

Two notes from experience: dark mode is not inverted light mode — keep your
hue family and let depth come from surface lightness, not shadows. And
semantic colors want a little more lightness on dark surfaces (the built-in
dark theme raises them for exactly this reason).

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

## Reduced motion

Under `prefers-reduced-motion: reduce`, every entrance, exit and morph
collapses to a fade — same durations, no movement. There's nothing to
configure; it's a theme, not a degraded fallback.
