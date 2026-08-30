# Convex — working rules for agents

Convex is a reactive document database where **queries are live subscriptions**
and all authorization happens **inside the handler**. Both of those invert
common assumptions from a REST/Prisma/Supabase background, and the second one
is where security bugs in this repo have actually come from.

`CLAUDE.md` holds the short hard-rule list and wins on conflict. This file is
the longer form: *why* each rule exists, the failure it prevents, and the
patterns specific to this codebase. Verified against the repo on
**2026-08-30**; Convex `^1.43.0`.

---

## 1. The four non-negotiables

### 1.1 Every client-reachable function declares `args` validators

```ts
export const update = mutation({
  args: { pageId: v.id("pages"), patch: v.object({ title: v.optional(v.string()) }) },
  handler: async (ctx, { pageId, patch }) => { … },
});
```

Missing validators is a **P0**. A public `mutation`/`query`/`action` is
reachable from any browser holding a valid token — there is no route gate in
front of it. `args: {}` is correct for a no-argument function; *absent* args is
not.

Mechanically enforced by `check:rules` → `convex-args`.

### 1.2 Authorization goes **inside the handler**

`proxy.ts` is an optimistic redirect, explicitly *not* the security boundary.
A Convex function is an HTTP endpoint.

```ts
const { userId, doc } = await requireOwned(ctx, "pages", pageId);   // preferred
await requireWorkspaceMember(ctx, workspaceId);                     // multi-workspace
await requireAdminQuery(ctx);                                       // admin surfaces
```

Prefer `requireOwned` from `convex/_shared/auth.ts` over hand-rolling
`getAuthUserId` + `db.get` + compare — the triplet is where a check gets
forgotten. The v1.2.0 release closed four ungated public endpoints found
exactly this way.

**Return DTOs, not raw rows.** A raw row ships every column you later add.
Known live exception: `convex/feedback/queries.ts:listFeedback` returns raw
`feedbackEntries` (including the `repliedBy` provenance column) to the admin
client. Admin-gated, so low severity — but do not copy the shape.

### 1.3 No bare `.collect()`

```ts
.withIndex("by_workspace", q => q.eq("workspaceId", ws)).take(N)   // ✅
.paginate(opts)                                                    // ✅
.collect()                                                         // ❌ unbounded
```

`.collect()` reads the whole result set into memory and the bill scales with
the table. If a walk is provably bounded, waive it *with the reason*:

```ts
// rules-allow: no-collect — one row per human member of ONE workspace, and a
// truncated read here would orphan member rows pointing at a deleted workspace.
```

Enforced by `check:rules` → `no-collect`.

### 1.4 Index every `.filter` / `.order` path

Declare on the table, use by name:

```ts
pages: defineTable({ … }).index("by_workspace_parent", ["workspaceId", "parentId"])
ctx.db.query("pages").withIndex("by_workspace_parent", q => q.eq("workspaceId", ws))
```

Field order in the index must match the equality order in the query.

---

## 2. Two greps that lie — both cost this repo real time

Both are now mechanically checked. Know *why*, because the same blindness
recurs in hand-written analysis.

### 2.1 Index names are not unique — always pair `(table, index)`

`.withIndex("by_user"` has **46 hits** in this repo, on 15 different tables.
So grepping an index name to decide whether it is dead is wrong: a dead
`comments.by_user` is masked by a live `workspaceMembers.by_user`.

The 2026-08-10 audit counted 12 dead indexes with a name-grep. The table-aware
`check:rules` → `dead-index` rule finds **18**, of which **8 were masked**
this way (`comments.by_user`, `files.by_user`, `pageViews.by_user`,
`comments.by_workspace`, `files.by_workspace`, `workspaces.by_owner`,
`oauthCodes.by_user_time`, `recents.by_user_workspace`).

Writing that rule has its own trap, recorded because it produced a real false
positive: a single combined regex from `.query("t")` to `.withIndex("i")` lets
an **unindexed** query earlier in the file swallow the indexed one that
follows, so `feedbackEntries.by_status` was reported dead while
`listFeedback` used it three lines down. Scan each `.query(` and look ahead
only as far as the *next* `.query(`.

All 18 are **baselined, not deleted**. Dropping an index is the only
hard-to-reverse change in the set, six are deliberate roadmap
forward-declarations, and two (`userProfiles.by_lastSeen`,
`webhookDeliveries.by_attempted`) are wanted back by admin/cron work.

### 2.2 Function references have two runtime-equivalent forms

```ts
api["features/inbox/queries"].list        // app/ and frontend/ — 39 sites
api.features.inbox.queries.list           // convex/_test/ — untyped
```

Both work at runtime. `_generated/api.d.ts` types nested modules under the
**slash** key, so the dotted form is not merely a grep problem — it is
*unchecked* code. A dotted-only sweep reports **16 live functions as dead**.

Enforced by `check:rules` → `convex-api-ref`, which accepts both. Currently
green.

---

## 3. Repo-specific patterns

### 3.1 Page blocks are NOT on the page document

Split 2026-07-14. Blocks live in the `pageBlocks` table.

```ts
import { readPageBlocks, writePageBlocks, newPageBlockFields } from "./_shared/pageContent";
const blocks = await readPageBlocks(ctx, pageId);   // ✅
const blocks = page.blocks;                          // ❌ empty for migrated rows
```

`searchText` stays on `pages`. `pages.blocks` is retained-but-emptied as a
fallback for un-backfilled rows; backfill with `admin/pageBlocksBackfill:run`.

### 3.2 Boundary cast for branded ids

Handler args take branded ids (`v.id("pages")`); frontend domain types keep
`string` for ergonomics. The cast lives at the call site, per-file and
grep-able — deliberately *not* a shared helper:

```ts
const asPageId = (s: string): Id<"pages"> => s as Id<"pages">;
mutUpdatePage({ pageId: asPageId(page.id), patch });
```

Never widen a handler arg back to `v.string()` to avoid the cast. One
intentional exception: `convex/mcp/internal.ts`, where `v.string()` is
defensive because the input is external HTTP.

Before tightening a stored *field* (as opposed to an arg), run
`bunx convex run admin/fkAudit:run` — zero `invalidFormat` means the flip is
safe. Orphans (`missingTarget`) do not block the validator.

### 3.3 Schema fields can be added freely, removed only carefully

Convex validates **stored** documents. Dropping a field from the schema fails
the deploy on every existing row that still has it. Seven write-only
provenance columns (`acceptedBy`, `invitedBy`, `grantedBy`, `repliedBy`,
`updatedBy`, `setBy`, `authMode`) are kept for exactly this reason — keep
writing them; remove only after the rows age out.

### 3.4 Rate-limit hot mutations

```ts
await rateLimit(ctx, userId, { scope: "page.update", max: 60, windowMs: 60_000 });
```

A daily prune cron in `convex/maintenance.ts` keeps the backing table small.
Six unbounded tables have retention crons; new unbounded tables need one too.

### 3.5 Workspace scoping

Every new entity row stamps `workspaceId` at insert. Reads filter through
`rowInActiveWorkspace(row, active, userId)` — which also passes legacy rows
that predate multi-workspace. `convex/_shared/workspace.ts` is the gate.

---

## 4. Testing

- Harness: `convex-test`. See `convex/testHarness.test.ts` and the 28 suites
  under `convex/_test/`.
- Run with **`bun run test`** (vitest). Never `bun test` — its runner grabs the
  same globs and breaks the convex-test/jsdom suite.
- Authz suites (`authz-pages`, `authz-databases`, `authz-content`,
  `authz-workspaces`, `page-grants`, `sharing`, `workspace-authz`) assert every
  endpoint from three vantage points: a principal that *should* pass, a
  different authenticated user, and anonymous. Copy that shape for new
  endpoints.
- These files were excluded from **both** tsconfig projects until 2026-08-30 —
  `bun run typecheck` compiled neither, so the security assertions had zero
  type coverage. They are now in the root project. Do not re-exclude them.

---

## 5. Clients

### 5.1 React (current)

`convex/react` — `useQuery`, `useMutation`, `useAction`, `useConvexAuth`.
Auth is `@convex-dev/auth` (`ConvexAuthNextjsProvider` + `convexAuthNextjsMiddleware`
in `proxy.ts`). **No Clerk.** Current usage: 113 `useQuery`, 150
`useMutation`, 20 `useAction`; `usePaginatedQuery` and `preloadQuery` are
**unused**.

### 5.2 Svelte (`convex-svelte`) — if the migration ever happens

Official, maintained by the Convex org. **0.14.0, published 2026-08-06.**
Peers: `convex ^1.30`, `svelte ^5.19`. Still 0.x.

More complete than a first look suggests — it supports queries, mutations,
actions, **pagination, optimistic updates, auth, and SvelteKit SSR**:

```svelte
<!-- +layout.svelte — once, at the root -->
<script>
  import { setupConvex } from 'convex-svelte';
  setupConvex(PUBLIC_CONVEX_URL);
</script>
```

```svelte
<script>
  import { useQuery, useConvexClient } from 'convex-svelte';
  import { api } from '$lib/convex/_generated/api';

  let { pageId } = $props();
  // args are a FUNCTION, not an object — this is the main API difference
  const q = useQuery(api.pages.getById, () => ({ pageId }));
  const client = useConvexClient();
</script>

{#if q.isLoading}…{:else if q.error}…{:else}{q.data.title}{/if}
```

| capability | API |
|---|---|
| setup | `setupConvex(url, opts?)` in a root layout; `closeConvex()` to tear down |
| query | `useQuery(fn, argsFn, { initialData, keepPreviousData })` → `{ data, error, isLoading, isStale }` |
| skip | return `'skip'` from the args function |
| mutate / act | `useMutation(fn)` / `useAction(fn)`, or `useConvexClient()` in `.ts` |
| paginate | `usePaginatedQuery(fn, args, { initialNumItems })` → `loadMore()` |
| optimistic | `store.setQuery()` at the call site |
| auth | `setupAuth(providerGetter, { initialState })` + `useAuth()` |
| SSR | `convexLoad()` / `convexLoadPaginated()` in `load`, upgrades to a live subscription on the client; needs a transport hook in `hooks.ts` |
| server-only | `createConvexHttpClient()` |

**Documented gotchas:**

- Wrapping `useQuery` in a `$derived` that depends on reactive state throws
  `effect_in_teardown`. Use query **skipping** instead.
- `setupConvex()` must run in a *parent* layout before any child calls
  `useQuery`/`useConvexClient`.
- Query references must be `api.*` imports, never plain strings.
- Svelte projects need `convex.json` pointing at `src/convex/` — "Svelte
  doesn't like referencing code outside of `src/`". **This repo's `convex/` is
  at the root**, so a migration moves it, which changes every `@convex/*`
  import path and the deploy config.

### 5.3 The auth gap — the real blocker

`convex-svelte` provides the auth *plumbing* (`setupAuth` takes a reactive
provider getter and manages `client.setAuth()`/`clearAuth()`). What does not
exist is a **`@convex-dev/auth` implementation for Svelte**.
[convex-auth#89](https://github.com/get-convex/convex-auth/issues/89) requested
it on 2024-10-01 and is still open.

The practical path is Better Auth via the community
`@mmailaender/convex-better-auth-svelte` (0.8.2, 2026-07-11). That is a
**backend** change — `convex/auth.ts`, `auth.config.ts`, the users table, and
every existing user session — i.e. a live-account data migration, in the area
that until 2026-08-30 had no type coverage on its tests. Spike this before
committing to anything else.

---

## 6. Deploy

- Cloud (reference): `convex deploy`, `CONVEX_DEPLOY_KEY` in the environment.
  `build:auto` echoes `convex-deploy: RUNNING|SKIPPED` so the build log answers
  whether the backend actually deployed.
- Self-hosted: source `.env.local` first —
  `set -a && source .env.local && set +a && bunx convex deploy --yes`.
  A raw `convex deploy` without it returns `BadAdminKey`. The pre-push hook
  (`scripts/install-pre-push.sh`) does this automatically when the pushed range
  touches `convex/`.

---

## 7. Review checklist

- [ ] `args:` validators on every public function
- [ ] `requireOwned` / `requireWorkspaceMember` / `requireAdmin*` **inside** the handler
- [ ] Returns a DTO, not a raw row
- [ ] No bare `.collect()` (or waived with a bounded-ness reason)
- [ ] Every `.filter`/`.order` path has a matching index
- [ ] New unbounded table has a retention cron
- [ ] New entity row stamps `workspaceId`
- [ ] Page content goes through `readPageBlocks`/`writePageBlocks`
- [ ] Ids cast at the call site, handler args stay branded
- [ ] Hot mutation is rate-limited
- [ ] Authz test added covering allowed / other-user / anonymous
- [ ] `bun run check:rules && bun run typecheck && bun run test` green

---

## Sources (fetched 2026-08-30)

- [Convex Svelte overview](https://docs.convex.dev/client/svelte/overview) ·
  [get-convex/convex-svelte](https://github.com/get-convex/convex-svelte)
- [convex-auth#89 — Svelte support](https://github.com/get-convex/convex-auth/issues/89)
- [@mmailaender/convex-better-auth-svelte](https://www.npmjs.com/package/@mmailaender/convex-better-auth-svelte)
- Repo facts measured directly; package versions from the npm registry.
