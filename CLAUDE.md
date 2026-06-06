# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Crust is a toast notification library (`@oscarrc/crust`) built Astro-first: the core renderer is vanilla DOM with zero dependencies, and React support is a thin optional bridge. pnpm monorepo with two workspaces:

- `packages/crust` — the library (tsup + vitest)
- `apps/docs` — Astro docs site / playground, deployed to GitHub Pages at `https://crust.oscarrc.me`

## Commands

Run from the repo root:

```bash
pnpm build:lib    # build the package → packages/crust/dist (tsup)
pnpm build:docs   # build the docs site (astro build)
pnpm test         # vitest run (store, renderer, react bridge)
pnpm check:pkg    # publint + arethetypeswrong (esm-only profile)
pnpm dev          # tsup --watch + astro dev in parallel
pnpm dev:docs     # docs site only
```

Single test file / watch mode (from `packages/crust/`):

```bash
pnpm vitest run test/store.test.ts
pnpm vitest        # watch mode
```

The docs app also has `pnpm check` (astro check + tsc) inside `apps/docs/`.

CI runs: install → `build:lib` → `test` → `check:pkg` → `build:docs`. Note `build:docs` needs `build:lib` first — docs import the built `dist/`.

## Releases

Conventional commits are required — release-please parses them to cut releases (`bump-minor-pre-major` is on, so `feat:` bumps minor while pre-1.0). Merging the release PR publishes to npm with provenance.

## Architecture

The whole library is three source files in `packages/crust/src/`:

- **`vanilla.ts`** — everything: store, `toast` API, and DOM renderer (`mountToaster`). There is a TODO to split this by feature.
- **`react.tsx`** — thin bridge only: `useToasts()` (`useSyncExternalStore` over the store) and `<Toaster />` (mounts the vanilla renderer in an effect). It renders nothing itself.
- **`styles.css`** — all visuals/motion, shipped as a standalone `dist/styles.css` entry (separate tsup config entry so no side-effect import pollutes the JS).

Key design points that span files:

- **Singleton store on `globalThis`** (`Symbol.for('crust.store')`): defends against two module copies (duplicate installs, Astro script bundles + React island bundle) splitting state. Any new top-level store field needs a migration guard (`state.field ??= ...`) since an older module copy may have created the singleton without it.
- **Store vs renderer split**: the store holds `toasts` (visible) + `queue` (overflow past `maxVisible`); queued toasts get their dismiss timer only on promotion so they can't expire unseen. The renderer subscribes and diffs by toast id against a `cells` map — it never re-renders the whole stack.
- **Interaction state lives in the DOM, not the store**: hover/focus/pin expansion is element classes (`crust-expanded`) and `dataset.pinned`. Store-driven expansion (`expanded: true` via update) is treated as a _command edge_ — only a change to `true` forces the panel open. On content rebuilds (`toast.update`/`toast.promise`), the live element's gesture state is carried over and is authoritative.
- **Timers pause/resume** on hover/focus (the reader gets time); a new `duration` or a programmatic expansion restarts the clock, but a paused toast stays paused with the fresh duration.
- **Astro view transitions**: the renderer re-adopts its region after `astro:after-swap` so live toasts survive ClientRouter `<body>` swaps.
- **Motion constants** `EXIT_FALLBACK_MS` / `ENTER_MS` / `STAGGER_MS` in `vanilla.ts` must stay in sync with the `--crust-dur-*` tokens in `styles.css`.
- **Theming** is entirely `--crust-*` custom properties on `.crust-region`; semantic color lives only in icons. Icons are `string | Element | (() => Element)` — Elements are cloned per render.

Deliberate non-goals (don't add these): JSX/React toast content, reactive `<Toaster />` props (options are read once at mount), bounce/spring motion (ease-out-quint, nothing over 320ms).

## Tests

Vitest with `happy-dom`. Tests use fake timers and reset shared state in `beforeEach` (`toast.dismiss()` + `toastStore.configure(...)`) — the global singleton store persists across tests, so any new test file must do the same.

## Docs site

Astro 6 + React islands + Tailwind 4. Internal links use `import.meta.env.BASE_URL` (currently `/` — the site lives at the domain root `crust.oscarrc.me`).
