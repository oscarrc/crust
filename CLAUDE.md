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

CI is path-filtered per workspace: `ci.yml` (lib: `build:lib` → `test` → `check:pkg`) runs on `packages/crust` changes; `ci-docs.yml` and `deploy-docs.yml` (`build:lib` → `build:docs`) run on `apps/docs` *or* `packages/crust` changes — docs import the built `dist/`, so lib changes retrigger them. Lockfile/workspace changes trigger everything. `release.yml` is unfiltered: release-please path-scopes by its own config, and the publish job re-runs build+test as the gate before npm.

## Releases

Conventional commits are required — release-please parses them to cut releases (`bump-minor-pre-major` is on, so `feat:` bumps minor while pre-1.0). Merging the release PR publishes to npm with provenance.

## Architecture

The library lives in `packages/crust/src/`, flat (no subfolders until a module grows a second file):

- **`store.ts`** — the `globalThis` singleton, timers, queue/promotion, and `toastStore`. The **only** file that touches `state`. Also exports `removeAll`/`normalizeDuration` as *package-internal* helpers for `toast.ts` — they are deliberately not part of the published surface.
- **`toast.ts`** — the `toast` API (shorthands, `update`, `promise`, `dismiss`). A pure client of `toastStore`'s public surface plus the two internal store helpers; owns `PromiseMessages`.
- **`renderer.ts`** — `mountToaster`, default icons, motion constants; owns the `Toaster*` types. Talks to the store only through `toastStore` methods.
- **`vanilla.ts`** — the public interface manifest for `@oscarrc/crust/vanilla`: pure re-exports of the documented API and **nothing else**. Internal exports (`removeAll`, `normalizeDuration`, private types) must never be added here "for convenience". tsup flattens everything into one `dist/vanilla.js`, so this structure is invisible to consumers.
- **`react.tsx`** — thin bridge only: `useToasts()` (`useSyncExternalStore` over the store) and `<Toaster />` (mounts the vanilla renderer in an effect). It renders nothing itself, and imports from `./vanilla` — it consumes the library exactly as documented.
- **`styles.css`** — all visuals/motion, shipped as a standalone `dist/styles.css` entry (separate tsup config entry so no side-effect import pollutes the JS).

Internal import policy: siblings import siblings directly (`toast.ts → store.ts`, `renderer.ts → store.ts`; the manifest sits above them, never imported internally). Everything outside the trio — `react.tsx` and all tests — imports the `vanilla` manifest. Types live with the module that gives them meaning; there is deliberately no `types.ts` or `utils.ts`.

Key design points that span files:

- **Singleton store on `globalThis`** (`Symbol.for('crust.store')`): defends against two module copies (duplicate installs, Astro script bundles + React island bundle) splitting state. Any new top-level store field needs a migration guard (`state.field ??= ...`) since an older module copy may have created the singleton without it.
- **Store vs renderer split**: the store holds `toasts` (visible) + `queue` (overflow past `maxVisible`); queued toasts get their dismiss timer only on promotion so they can't expire unseen. The renderer subscribes and diffs by toast id against a `cells` map — it never re-renders the whole stack.
- **Interaction state lives in the DOM, not the store**: hover/focus/pin expansion is element classes (`crust-expanded`) and `dataset.pinned`. Store-driven expansion (`expanded: true` via update) is treated as a _command edge_ — only a change to `true` forces the panel open. On content rebuilds (`toast.update`/`toast.promise`), the live element's gesture state is carried over and is authoritative.
- **Timers pause/resume** on hover/focus (the reader gets time); a new `duration` or a programmatic expansion restarts the clock, but a paused toast stays paused with the fresh duration.
- **Astro view transitions**: the renderer re-adopts its region after `astro:after-swap` so live toasts survive ClientRouter `<body>` swaps.
- **Motion constants** `EXIT_FALLBACK_MS` / `ENTER_MS` / `STAGGER_MS` in `renderer.ts` must stay in sync with the `--crust-dur-*` tokens in `styles.css`.
- **Theming** is entirely `--crust-*` custom properties on `.crust-region`; semantic color lives only in icons. Icons are `string | Element | (() => Element)` — Elements are cloned per render.

Deliberate non-goals (don't add these): JSX/React toast content, reactive `<Toaster />` props (options are read once at mount), bounce/spring motion (ease-out-quint, nothing over 320ms).

## Tests

Vitest with `happy-dom`. Tests use fake timers and reset shared state in `beforeEach` (`toast.dismiss()` + `toastStore.configure(...)`) — the global singleton store persists across tests, so any new test file must do the same.

Tests import from `src/vanilla` only — the manifest is the test surface. Never import `src/store`/`src/toast`/`src/renderer` from a test: passing tests must mean the *published* interface works.

## Docs site

Astro 6 + React islands + Tailwind 4. Internal links use `import.meta.env.BASE_URL` (currently `/` — the site lives at the domain root `crust.oscarrc.me`).
