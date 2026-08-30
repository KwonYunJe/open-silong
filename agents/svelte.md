# Svelte 5 + SvelteKit — working rules for agents

**Why this file exists.** Every coding model's training set is overwhelmingly
React and Next.js. Svelte 5 shipped runes in late 2024 and they invert several
React reflexes — the honest failure mode is not "I don't know Svelte", it is
"I write React with Svelte syntax and it silently works badly". This file is
the correction list: the places where the React-shaped answer is *wrong*, not
merely unidiomatic.

Verified against the official docs on **2026-08-30**. Sources at the bottom.
If a rule here disagrees with `svelte.dev/docs`, the docs win — say so and fix
this file.

> **Status for this repo:** open-silong is React 19 + Next 16 today. Nothing
> here is live. Read this before writing *any* Svelte, and read
> `docs/audit/2026-08-30-svelte-migration-plan.md` first for whether the
> migration should happen at all (short answer: the numbers say no — 45k LOC
> of JSX to rewrite to save ~40 KB gzipped).

---

## 0. The reflex table

The single highest-value section. Left column is what a React-trained model
reaches for by default. **Do not carry these over.**

| React reflex | Svelte 5 | why the reflex is wrong |
|---|---|---|
| `useState` | `let x = $state(0)` | `$state` is a *deep proxy*, not a setter pair. Mutate it: `x.items.push(1)` works. |
| `useMemo(() => a + b, [a, b])` | `let sum = $derived(a + b)` | No dependency array. Dependencies are tracked automatically at read time. A stale array cannot exist. |
| `useEffect(() => setB(a * 2), [a])` | `let b = $derived(a * 2)` | **The #1 misuse.** Never sync state from state with an effect. |
| `useEffect` for anything | `$effect` — but usually nothing | Effects are an escape hatch, not the default data-flow tool. See §2. |
| `useCallback` | just a function | No referential-identity problem to solve; there is no VDOM diff comparing prop identity. |
| `React.memo` | nothing | Svelte compiles fine-grained updates. There is no re-render to memoize away. |
| `useRef` for a DOM node | `bind:this={el}` | — |
| `useRef` for mutable non-render state | plain `let` | A non-`$state` variable already survives re-runs and triggers nothing. |
| `useContext` / provider component | `setContext()` / `getContext()` | Must be called during component *init*, not in a handler or effect. |
| `children` prop / `<slot>` | snippets + `{@render children()}` | Slots are deprecated in Svelte 5. |
| `key={id}` on a list | `{#each items as item (item.id)}` | The key goes in parens after the binding, and it is easy to forget. |
| `className` | `class` | — |
| `onClick` | `onclick` | Lowercase DOM attribute. `on:click` is the deprecated Svelte 4 form. |
| `style={{color: c}}` | `style:color={c}` | — |
| a module-level store as app state | `setContext` with a class holding `$state` | **Module-level state leaks across users under SSR.** See §3. |
| `useQuery` from `convex/react` | `useQuery` from `convex-svelte` — args are a **function** | `useQuery(api.x.y, () => ({ id }))`, not an object. See `agents/convex.md`. |

---

## 1. Runes: the decision rule

Three questions, in order. Stop at the first yes.

1. **Does anything re-render or re-compute when this changes?** No → plain
   `let`. Not everything needs to be `$state`; plain variables are cheaper and
   clearer.
2. **Can it be written as a pure function of other state?** Yes → `$derived`.
   This covers the large majority of what React puts in `useEffect`.
3. **Only then** → `$effect`, and only for genuinely external systems.

```svelte
<script>
  let items   = $state([]);              // reactive, deeply proxied
  let filter  = $state('');
  let visible = $derived(                // recomputed automatically
    items.filter(i => i.name.includes(filter))
  );
  let count   = $derived(visible.length);// derive from derived — fine

  let scratch = 0;                       // NOT $state — nothing reads it reactively
</script>
```

### `$state.raw` — the performance knob worth knowing

`$state` deep-proxies the whole object graph, which costs on large structures.
When you **replace** a value wholesale rather than mutate parts of it — a
fetched API response, a big array you reassign — use `$state.raw`:

```js
let page = $state.raw(await fetchPage());   // reassign whole; no proxy overhead
page = await fetchPage();                   // ✅ triggers
page.title = 'x';                           // ❌ does NOT trigger — raw is not deep
```

For this repo's shapes: a page's `blocks: Block[]` being replaced on every save
is a `$state.raw` candidate; a block being edited in place is not.

### Destructuring breaks reactivity

```js
let { title } = page;   // ❌ snapshot at destructure time, never updates
let title = $derived(page.title);  // ✅
```

Same for passing state into a function — pass a **getter**, not the value, if
the callee needs to keep seeing updates. This is the Svelte analogue of the
stale-closure bug, and it bites in exactly the same places.

---

## 2. `$effect` — the trap

The official docs say it plainly: *"Effects are an escape hatch and should
mostly be avoided"* and *"you should **not** update state inside effects, as it
will make code more convoluted and will often lead to never-ending update
cycles."*

**Legitimate uses** — synchronising with something outside Svelte's
reactivity: a canvas API, a third-party library instance, `setInterval`,
`IntersectionObserver`, a WebSocket, writing to `localStorage`, manual DOM
work the compiler cannot see.

**Illegitimate uses** — the ones a React-trained model writes by default:

```js
// ❌ deriving state
$effect(() => { total = price * qty; });
let total = $derived(price * qty);              // ✅

// ❌ reacting to a prop to call something
$effect(() => { if (open) load(); });
// ✅ do it in the handler that set `open`, or derive it

// ❌ fetching on mount
$effect(() => { fetch(url).then(r => data = r); });
// ✅ SvelteKit `load()`, or convex-svelte `useQuery`
```

Mechanics worth knowing:

- Dependencies are whatever is read **synchronously** in the body. Reads after
  `await` or inside `setTimeout` are **not tracked** — a silent source of
  "my effect doesn't re-run".
- Return a function for cleanup; it runs before each re-run and on unmount.
- Runs **after** DOM updates. Use `$effect.pre` for before (autoscroll etc.).
- **Does not run during SSR.** Never put anything the server-rendered HTML
  needs inside `$effect`.
- Re-runs are batched within a tick.
- If you genuinely must write state in an effect and hit a loop, `untrack()`
  breaks the cycle — but treat reaching for it as a signal the design is wrong.

---

## 3. State that must not leak — the SSR footgun

This has no React-Next analogue that behaves the same way, and it is a
**security** issue, not a style issue.

```ts
// lib/store.svelte.ts
export const session = $state({ userId: null });   // ❌ ONE INSTANCE PER SERVER PROCESS
```

A `.svelte.ts` module with top-level `$state` is a singleton in the server
process. Under SSR it is shared by **every concurrent request**, so one user's
data leaks into another user's render. In a workspace app with per-user
authorization this is the worst possible bug.

**The rule:** per-request or per-user state is created in `load()` and passed
down through context.

```svelte
<!-- +layout.svelte -->
<script>
  import { setContext } from 'svelte';
  let { data, children } = $props();

  class WorkspaceState {
    active = $state(null);
    constructor(initial) { this.active = initial; }
  }
  setContext('workspace', new WorkspaceState(data.workspace));
</script>
{@render children()}
```

```svelte
<!-- any descendant -->
<script>
  import { getContext } from 'svelte';
  const ws = getContext('workspace');   // during init only
</script>
```

Module-level state is only safe for genuinely global, non-user-specific,
client-only values (a theme token table, a constant registry). If in doubt:
context.

---

## 4. Snippets replaced slots

```svelte
<!-- Card.svelte -->
<script>
  let { header, children } = $props();
</script>
<div class="card">
  {#if header}<div class="hd">{@render header()}</div>{/if}
  {@render children()}
</div>
```

```svelte
<Card>
  {#snippet header()}<h2>Title</h2>{/snippet}
  <p>Body</p>          <!-- becomes the implicit `children` snippet -->
</Card>
```

Snippets take arguments (`{#snippet row(item)}` → `{@render row(x)}`), which is
what makes them strictly better than slots for the table/list rendering this
repo does everywhere. `<slot>` still works but is deprecated — do not write new
ones.

---

## 5. `contenteditable` — read this before touching the editor

Directly load-bearing for open-silong, whose editor is a plain-text
contenteditable with a decorator pass (`slices/editor/lib/inlineDecorator.ts`).

**The documented gotcha:** a `contenteditable` node with a binding *and*
reactive content inside it will not update from the reactive value —

```svelte
<!-- ❌ `count` changes will NOT appear -->
<div contenteditable bind:textContent>count is {count}</div>
```

The binding takes full control of the node's content immediately; the only way
to change it is through the binding.

**Consequence for a block editor:** the same architecture this repo already
uses is the correct one in Svelte too — treat the contenteditable as an
uncontrolled DOM surface, intercept `beforeinput`/`input` yourself, and write
the DOM manually rather than letting the framework render into it. Do **not**
try to render blocks declaratively into a contenteditable and bind them; you
will fight the framework and lose the caret.

Caret preservation, IME `compositionstart`/`compositionend` guards, and the
decorate-after-input pass are all framework-agnostic DOM work and port over
essentially unchanged. That is the good news: `inlineDecorator.ts` is 39 lines
of plain DOM and is one of the few editor files that ports as-is.

---

## 6. Other correctness rules

- **Key your `{#each}`.** `{#each items as item (item.id)}`. Unkeyed blocks
  update by index, so removing an item mid-list mutates the wrong DOM nodes —
  the same class of bug as a missing React `key`, but easier to forget because
  the syntax is positional.
- **`$props()` once.** `let { a, b = 1, ...rest } = $props();` — destructure at
  the top, with defaults. Props are not deeply reactive by default; use
  `$bindable()` for two-way.
- **Prefer CSS custom properties over `:global`** when styling a child
  component. `:global` escapes scoping permanently and is not greppable later.
- **`style:` directive** for JS→CSS values, not string concatenation.
- **Do not wrap effect bodies in `if (browser)`.** That is a Svelte 4 habit;
  effects already do not run on the server.

---

## 7. SvelteKit

### File roles — pick by *where the code may run*

| file | runs | use for |
|---|---|---|
| `+page.svelte` | client (+ SSR render) | markup only. Keep it thin. |
| `+page.ts` | server **and** client | universal load; no secrets, no DB |
| `+page.server.ts` | server only | DB, secrets, anything privileged; also **form actions** |
| `+server.ts` | server only | JSON/REST endpoints |
| `+layout*.ts(.server.ts)` | as above | shared data, providers, context setup |
| `hooks.server.ts` | server | auth resolution, request middleware — the `proxy.ts` analogue |

The `+page.svelte` should ideally do nothing but import components and hand
them `data` from `load`. That maps cleanly onto this repo's existing
"routes are thin, slices hold the UI" convention.

### Form actions beat hand-rolled fetch

```svelte
<form method="POST" action="?/rename" use:enhance>
```

`use:enhance` gives progressive enhancement — works without JS, upgrades to no
-reload when JS is present. Actions are plain functions and testable in
isolation from the UI. Reach for this before writing a `+server.ts` endpoint
plus a client `fetch`.

### What SvelteKit does **not** have

Be explicit about this when advising, because the React answer assumes it
exists: **there is no Partial Prerendering equivalent.** This repo currently
runs `experimental.cacheComponents` with **22 of 30 routes on PPR**. That
capability does not transfer; it has to be re-derived with `load` + cache
headers + ISR, and the result is not the same thing.

`@sveltejs/adapter-vercel` (6.3.4, 2026-08-21) supports ISR on Vercel, which
covers part of the gap.

---

## 8. UI layer

- **shadcn-svelte** (1.5.1, 2026-08-27) — community-led Svelte port of
  shadcn/ui, built on **bits-ui** (2.19.0, 2026-08-20), 70+ components.
  bits-ui is the headless layer, i.e. the Radix analogue.
- For this repo the mapping is unusually clean: all 17 Radix packages are used,
  but **each appears in exactly one wrapper** under `frontend/shared/ui/` (33
  files). bits-ui covers every primitive in that list. Rewriting
  `frontend/shared/ui/` is the highest-leverage single step of any migration.
- `forwardRef` (28 sites here) has no counterpart — bits-ui uses a different
  ref/composition model. These are rewrites, not renames.
- Other swaps: `sonner` → `svelte-sonner`; `cmdk` → bits-ui Command;
  `vaul` → Vaul-Svelte; `next-themes` → `mode-watcher`;
  `lucide-react` (247 files!) → `@lucide/svelte` (near-identical API, the one
  genuinely mechanical codemod in the set); `@dnd-kit` (26 files) →
  `svelte-dnd-action` — **not** a codemod, a different model (zone-based vs
  sensor/collision-based).

---

## 9. Review checklist

Before calling any Svelte change done:

- [ ] No `$effect` that only assigns to state → should be `$derived`
- [ ] No top-level `$state` in a `.svelte.ts` holding per-user data → context
- [ ] Every `{#each}` over a mutable list is keyed
- [ ] No destructured reactive value that needs to stay live
- [ ] `$state.raw` used for large wholesale-replaced values
- [ ] No `<slot>` in new code
- [ ] Nothing the SSR output depends on lives in `$effect`
- [ ] Effect dependencies are read synchronously (not after `await`)
- [ ] Privileged work is in `+page.server.ts`, not `+page.ts`
- [ ] Forms use actions + `use:enhance` before a bespoke fetch

---

## 10. Getting ground truth at runtime

There is **no Svelte skill** in the installed skill set or the plugin
marketplace as of 2026-08-30 — the only catalog match for "svelte" is
`sentry-svelte-sdk`, an error-tracking SDK, not guidance. This file is the
substitute.

For live lookups beyond it, the useful tool is
**[`mcp-svelte-docs`](https://github.com/spences10/mcp-svelte-docs)** — an MCP
server that serves Svelte 5 / SvelteKit definitions extracted from the
**TypeScript declarations**, i.e. ground truth rather than recalled prose. It
exposes a `svelte_definition` tool covering every rune (`$state`, `$derived`,
`$props`, `$effect`), snippets, event syntax, and SvelteKit patterns, with
syntax/quick/full detail levels and compressed variants for small context
windows.

That is the right shape of fix for this problem: the failure mode is a
confidently-recalled Svelte 4 or React answer, and a declarations-derived
lookup is the cheapest way to catch it. Prefer it over web search when the
question is "what is the exact signature/syntax of X".

Rule of thumb: **if you are about to write a Svelte API from memory, look it
up.** Runes are recent enough that recall is unreliable in a way it is not for
React.

---

## Sources (fetched 2026-08-30)

- [Svelte best practices](https://svelte.dev/docs/svelte/best-practices)
- [`$effect`](https://svelte.dev/docs/svelte/$effect)
- [SvelteKit state management](https://svelte.dev/docs/kit/state-management)
- [Svelte 5 migration guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [shadcn-svelte](https://shadcn-svelte.com/docs) · [bits-ui](https://bits-ui.com)
- [SvelteKit form actions (Vercel)](https://vercel.com/kb/guide/using-sveltekit-form-actions)
- Package versions read from the npm registry on 2026-08-30.
