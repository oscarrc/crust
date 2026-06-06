# Auto-Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toasts can open their morph-expand themselves — programmatically (`expanded`), after a delay (`expandAfter`), or when a promise settles (`expandOnSettle`).

**Architecture:** `expanded` becomes a store-level field on `Toast` (the primitive). `expandAfter` is store-side sugar: an internal timer that fires `update(id, { expanded: true })`, starting when the toast becomes visible. `expandOnSettle` adds `expanded: true` to `toast.promise`'s settle-time update. The renderer maps store-driven `expanded` to its existing pin mechanism (`data-pinned` + `.crust-expanded`). Spec: `docs/superpowers/specs/2026-06-06-auto-expand-design.md`.

**Tech Stack:** TypeScript (strict), vitest + happy-dom, fake timers (`vi.useFakeTimers()` already in both test files' `beforeEach`). All library code lives in `packages/crust/src/vanilla.ts`. Run commands from `packages/crust/`.

**Key semantics (from spec):**
- `update(id, { expanded: true })` **restarts** the dismiss timer (full duration again).
- `expanded: true` at creation does NOT interact with timers — toast arrives open.
- `expandAfter` clock starts at visibility (queue promotion), cancelled on dismiss, ignored without a `title`.
- Store-driven expanded renders **pinned**: hover-out won't collapse, click will.

---

### Task 1: `expanded` primitive — types + arrive-open

**Files:**
- Modify: `packages/crust/src/vanilla.ts` (types + `add`)
- Test: `packages/crust/test/store.test.ts`

- [ ] **Step 1: Write the failing tests.** Add a new describe block in `test/store.test.ts`, before `describe('subscription & snapshots', …)`:

```ts
describe('expanded primitive', () => {
  test('toast can arrive expanded', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    expect(toastStore.getSnapshot()[0]!.expanded).toBe(true);
  });

  test('update(id, { expanded: true }) restarts the dismiss timer', () => {
    const id = toast('m', { title: 't', duration: 4000 });
    vi.advanceTimersByTime(3900);
    toast.update(id, { expanded: true });
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run test/store.test.ts -t 'expanded'`
Expected: 2 FAIL — first: `expected undefined to be true`; second: toast already dismissed at the 3999 check (timer not restarted).

- [ ] **Step 3: Implement.** In `src/vanilla.ts`:

(a) Add to the `ToastOptions` interface, after the `icon` line:

```ts
  /** Arrive with the message panel open (pinned). */
  expanded?: boolean;
  /** ms after becoming visible until the toast auto-expands. Needs a `title`. */
  expandAfter?: number;
```

(b) Add to the `Toast` interface, after `icon?: CrustIcon | null;`:

```ts
  expanded?: boolean;
  expandAfter?: number;
```

(c) In `add()`, extend the `next: Toast` object literal — after the `icon:` line add:

```ts
    expanded: options?.expanded,
    expandAfter: options?.expandAfter
```

(d) In `update()`, change the timer-restart condition from:

```ts
  if (patch.duration !== undefined) {
```

to:

```ts
  // A new duration — or a programmatic expansion (new content just
  // appeared, the reader gets the full duration again) — restarts the clock.
  if (patch.duration !== undefined || patch.expanded === true) {
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run test/store.test.ts`
Expected: all pass (36).

- [ ] **Step 5: Commit.**

```bash
git add src/vanilla.ts test/store.test.ts
git commit -m "feat(crust): expanded toast primitive with timer-restart semantics"
```

---

### Task 2: `expandAfter` sugar in the store

**Files:**
- Modify: `packages/crust/src/vanilla.ts` (state, timers, `add`, `promote`, `remove`, `removeAll`)
- Test: `packages/crust/test/store.test.ts`

- [ ] **Step 1: Write the failing tests.** Append inside the `expanded primitive` describe block:

```ts
  test('expandAfter auto-expands after N ms and restarts the dismiss timer', () => {
    const id = toast('m', { title: 't', duration: 4000, expandAfter: 2000 });
    vi.advanceTimersByTime(1999);
    expect(toastStore.getSnapshot()[0]!.expanded).not.toBe(true);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ id, expanded: true });
    // dismiss timer restarted at the 2000ms mark: full 4000 remain
    vi.advanceTimersByTime(3999);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });

  test('expandAfter is cancelled by dismissal', () => {
    const id = toast('m', { title: 't', duration: Infinity, expandAfter: 1000 });
    toast.dismiss(id);
    const listener = vi.fn();
    const unsubscribe = toastStore.subscribe(listener);
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('expandAfter starts when a queued toast is promoted, not when added', () => {
    const pinned = Array.from({ length: 5 }, (_, i) => toast(`p${i}`, { duration: Infinity }));
    const queued = toast('m', { title: 't', duration: Infinity, expandAfter: 1000 });
    vi.advanceTimersByTime(10_000); // sits in queue well past expandAfter
    toast.dismiss(pinned[0]!);
    expect(toastStore.getSnapshot().find((t) => t.id === queued)!.expanded).not.toBe(true);
    vi.advanceTimersByTime(1000);
    expect(toastStore.getSnapshot().find((t) => t.id === queued)!.expanded).toBe(true);
  });

  test('expandAfter without a title is ignored', () => {
    toast('no title here', { duration: Infinity, expandAfter: 500 });
    vi.advanceTimersByTime(5000);
    expect(toastStore.getSnapshot()[0]!.expanded).not.toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run test/store.test.ts -t 'expandAfter'`
Expected: 4 FAIL — `expanded` never becomes true (first/third), listener IS called in the cancel test only if scheduling existed (it doesn't yet, so that one may pass vacuously — acceptable; it guards the implementation you're about to write).

- [ ] **Step 3: Implement.** In `src/vanilla.ts`:

(a) Add to the `StoreState` interface, after `timers: Map<string, TimerEntry>;`:

```ts
  expandTimers: Map<string, ReturnType<typeof setTimeout>>;
```

(b) Extend the singleton initializer object (the `??=` literal) with:

```ts
  expandTimers: new Map(),
```

and directly after the `const state: StoreState = …` line add a migration guard (an older module instance may have created the singleton without the map):

```ts
state.expandTimers ??= new Map();
```

(c) Add helpers next to `startTimer`/`clearTimer`:

```ts
const scheduleExpand = (toast: Toast) => {
  // Only meaningful when there is a hidden message panel to reveal.
  if (!toast.title || toast.expandAfter === undefined) return;
  if (!Number.isFinite(toast.expandAfter)) return;
  state.expandTimers.set(
    toast.id,
    setTimeout(() => {
      state.expandTimers.delete(toast.id);
      update(toast.id, { expanded: true });
    }, toast.expandAfter)
  );
};

const clearExpandTimer = (id: string) => {
  const timeoutId = state.expandTimers.get(id);
  if (timeoutId != null) clearTimeout(timeoutId);
  state.expandTimers.delete(id);
};
```

Note: `scheduleExpand` references `update`, which is declared later in the file — fine, `const` arrow functions here are only *invoked* after module evaluation completes.

(d) Call `scheduleExpand(next)` right after `startTimer(next)` in the visible branch of `add()`, and `scheduleExpand(next)` right after `startTimer(next)` in `promote()`.

(e) In `remove()`, add `clearExpandTimer(id);` directly after `clearTimer(id);`. In `removeAll()`, add after the timers loop:

```ts
  for (const id of [...state.expandTimers.keys()]) clearExpandTimer(id);
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run test/store.test.ts`
Expected: all pass (40).

- [ ] **Step 5: Commit.**

```bash
git add src/vanilla.ts test/store.test.ts
git commit -m "feat(crust): expandAfter option — auto-expand on a visibility-anchored timer"
```

---

### Task 3: `expandOnSettle` sugar on `toast.promise`

**Files:**
- Modify: `packages/crust/src/vanilla.ts` (`toast.promise`)
- Test: `packages/crust/test/store.test.ts`

- [ ] **Step 1: Write the failing tests.** Append inside the existing `describe('toast.promise', …)` block:

```ts
  test('expandOnSettle expands the success outcome', async () => {
    toast.promise(
      Promise.resolve('ok'),
      { loading: 'w…', success: 'done', error: 'failed' },
      { expandOnSettle: true, title: 'Job' }
    );
    expect(toastStore.getSnapshot()[0]!.expanded).not.toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ type: 'success', expanded: true });
  });

  test('expandOnSettle expands the error outcome', async () => {
    toast.promise(
      Promise.reject(new Error('boom')),
      { loading: 'w…', success: 'done', error: { message: 'failed', title: 'Bad' } },
      { expandOnSettle: true }
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ type: 'error', expanded: true });
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run test/store.test.ts -t 'expandOnSettle'`
Expected: 2 FAIL — TS may also complain about the unknown option; that's the same missing feature.

- [ ] **Step 3: Implement.** In the `toast.promise` member of the `toast` object:

(a) Widen the options type:

```ts
    promise: <T>(
      promise: Promise<T>,
      messages: PromiseMessages<T>,
      options?: Omit<ToastOptions, 'type' | 'duration'> & {
        duration?: number;
        /** Open the outcome's message panel when the promise settles. */
        expandOnSettle?: boolean;
      }
    ): string => {
```

(b) In `conclude`, add the conditional expansion to the update patch, after the `duration:` line:

```ts
          ...(options?.expandOnSettle ? { expanded: true } : {})
```

(c) The loading toast must not inherit `expanded`/`expandAfter` from spread options unintentionally — the existing `add(…, { ...options, … })` spread is fine because `expandOnSettle` is not a `ToastOptions` key and `expanded`/`expandAfter` passed by the caller should apply to the loading toast if explicitly given. No change needed; this step is verification-by-reading.

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run test/store.test.ts && pnpm exec tsc --noEmit`
Expected: all pass (42), TS clean.

- [ ] **Step 5: Commit.**

```bash
git add src/vanilla.ts test/store.test.ts
git commit -m "feat(crust): expandOnSettle option for toast.promise"
```

---

### Task 4: Renderer — store-driven expansion renders pinned

**Files:**
- Modify: `packages/crust/src/vanilla.ts` (`buildToastEl`)
- Test: `packages/crust/test/renderer.test.ts`

- [ ] **Step 1: Write the failing tests.** Add a describe block in `test/renderer.test.ts`, after `describe('in-place updates', …)`:

```ts
describe('store-driven expansion', () => {
  beforeEach(() => {
    toaster = mountToaster();
  });

  test('toast arriving expanded renders open and pinned', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });

  test('hover-out does not collapse a store-expanded toast, click does', () => {
    toast('details', { title: 'Open', expanded: true, duration: Infinity });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    el.dispatchEvent(new Event('mouseleave'));
    expect(el.classList.contains('crust-expanded')).toBe(true);
    (el as HTMLElement).click();
    expect(el.classList.contains('crust-expanded')).toBe(false);
  });

  test('toast.update({ expanded: true }) opens a visible toast', () => {
    const id = toast('details', { title: 'Later', duration: Infinity });
    expect(document.querySelector('.crust-expanded')).toBeNull();
    toast.update(id, { expanded: true });
    const el = document.querySelector<HTMLElement>('.crust-toast')!;
    expect(el.classList.contains('crust-expanded')).toBe(true);
    expect(el.dataset.pinned).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run test/renderer.test.ts -t 'store-driven'`
Expected: 3 FAIL — no `.crust-expanded` / no `data-pinned`.

- [ ] **Step 3: Implement.** In `buildToastEl`, directly after `el.dataset.id = item.id;`:

```ts
    if (expandable && item.expanded) {
      // Store-driven expansion behaves like click-to-pin: it stays open
      // until the user collapses or dismisses it.
      el.classList.add('crust-expanded');
      el.dataset.pinned = '1';
    }
```

(`toast.update` flows through `updateCell`, which rebuilds the element from the new item — this same branch renders the patched `expanded: true`. The existing carry-over in `updateCell` preserves gesture state when the patch doesn't mention expansion.)

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run`
Expected: all green (store 42 + renderer 25 + react 4 = 71). Also run `pnpm exec tsc --noEmit` — clean.

- [ ] **Step 5: Commit.**

```bash
git add src/vanilla.ts test/renderer.test.ts
git commit -m "feat(crust): render store-driven expansion as pinned-open"
```

---

### Task 5 amendment (user request, mid-execution): interactive position playground

The docs playground additionally gains a **Positions** section: a miniature
viewport map (rounded rect, 16:9) with six tiny toast-shaped buttons placed
where toasts would anchor (`top-left` … `bottom-right`). Clicking one
remounts the toaster at that position (`mountToaster()` → `.unmount()` →
`mountToaster({ position })` — idempotent first call returns the live
handle) and fires a confirmation toast. Active position shows `aria-pressed`
+ filled style. Styled to the warm-paper design context (`.impeccable.md`).

Prerequisite library fix (TDD, separate commit): `unmount()` must only null
the module-level `mounted` singleton **if it is still the current handle**
— otherwise a stale handle (e.g. the React island's cleanup after the
playground has remounted) would orphan the active toaster and allow
duplicate regions.

### Task 5: Docs, playground, README

**Files:**
- Modify: `apps/docs/src/pages/docs/api.md`
- Modify: `apps/docs/src/pages/index.astro`
- Modify: `README.md`

- [ ] **Step 1: API docs.** In `apps/docs/src/pages/docs/api.md`:

(a) Add a row to the `toast()` options table, after the `icon` row:

```md
| `expandAfter` | `number` | — | ms after becoming visible until the toast auto-expands (needs `title`); restarts the dismiss timer when it fires |
```

(b) In the **Updating** section, append a sentence to the paragraph:

```md
Patching `expanded: true` opens the message panel (pinned) and restarts the
dismiss timer — it's the primitive under `expandAfter` and `expandOnSettle`.
```

(c) In the **Promises** section, change the example to include the option and add a closing sentence:

```ts
toast.promise(saveDraft(), {
  loading: 'Saving draft…',
  success: (draft) => `Saved “${draft.title}”`,
  error: (e) => `Save failed: ${(e as Error).message}`
}, { expandOnSettle: true });
```

```md
With `expandOnSettle`, the outcome arrives with its message panel already
open — and the fresh duration gives the reader the full time to read it.
```

- [ ] **Step 2: Playground.** In `apps/docs/src/pages/index.astro`:

(a) Add a tray button after the `data-bake="expand"` button:

```html
        <button class="btn" data-bake="expand-after">Expand after 2s</button>
```

(b) Add to the `bakes` record after the `expand` entry:

```ts
    'expand-after': () =>
      toast('Two seconds after landing, this toast opens itself — and the dismiss timer starts over.', {
        title: 'Patience',
        type: 'info',
        expandAfter: 2000
      }),
```

(c) In the `promise` entry, add the third argument after the messages object:

```ts
        { expandOnSettle: true }
```

- [ ] **Step 3: README.** In the API-at-a-glance code block, after the `toast.promise(…)` call, add:

```ts
toast('Read me', { title: 'Hi', expandAfter: 2000 }); // opens itself after 2s
// toast.promise(…, { expandOnSettle: true }) opens the outcome
```

- [ ] **Step 4: Verify everything.**

Run from repo root: `pnpm build:lib && pnpm test && pnpm check:pkg && pnpm build:docs`
Expected: 3× Build success, 71 tests pass, check:pkg exit 0, 4 pages built.

- [ ] **Step 5: Commit.**

```bash
git add apps/docs README.md
git commit -m "docs: expandAfter and expandOnSettle across docs, playground, README"
```
