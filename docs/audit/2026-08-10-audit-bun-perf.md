# Audit — 2026-08-10 (dead code · deps · perf · pnpm → bun)

Multi-agent audit: 7 parallel finders (dead files · dead Convex · deps ·
frontend perf · Convex perf · over-engineering · bun surface), each finding
attacked by an independent skeptic before it counted. **30 confirmed, 69
refuted.** Only confirmed findings were applied. Shipped in `80cfffe`.

Baseline → after: client JS **5.30 → 5.17 MB** raw (125 → 123 chunks),
`node_modules` **1.9G → 1.0G**, `.next/standalone` **288M → 175M**, compile
**44s → 29s**, tsc **85s → 39s**. Gates: typecheck (both tsconfigs) · 1111
tests · build · prod server boot.

## Shipped

**Deleted** — `convex/features/{graph,search}/index.ts` (`export *` barrels
that made Convex deploy a *second copy* of 8 public functions);
`graph/queries.ts` 5 of 6 queries (−212 lines — backlinks/local-graph/tags
are all computed client-side); `admin/fkGc.ts` (one-shot FK GC, its
schema-tightening shipped); `changelog.listPublished`;
`ai._getGlobalAISettings`; `aiQuota.readAiTokenUsage`; 4 caps +
`pagesInSameWorkspace` orphaned by the above; `ResponsiveDialog`'s
Trigger/Close/`forceMode`/sticky-layout branch + 5 never-passed props (−108
lines) and the alert-dialog equivalent; `drawer-lazy.DrawerTrigger`;
`relationMirror` shim; placeholder `example.test.ts`; orphan
`docs/media/auth.png`; empty `slices/notion/lib`; the dangling
`rr-sync-status.mjs` call in the pre-push hook.

**Deps −3** — `eslint-config-next` (unreferenced; `eslint.config.mjs` imports
the plugins directly, ~14.6 MB), `@tailwindcss/typography` (Tailwind v4 needs
an `@plugin` directive that does not exist, so it emitted nothing),
`@radix-ui/react-toggle` (only consumer was an unrendered component).

**Perf** — icon-picker barrel leaked Radix Popover + floating-ui + the emoji
catalog into `/share` and `/site` (leaf import; `IconPicker` now absent from
both route manifests); adapter hooks rebuilt whole-workspace Maps per
consumer per push across 65 call sites (identity-keyed `WeakMap`);
`store.tsx`'s `?? []` invalidated the whole store context during cold boot;
search debounced 180 ms (was one Convex resubscribe + up to 4 index scans
*per keystroke*); `SearchModal`/`MobileBottomNav` lazy chunks were fetched on
every dashboard load (`React.lazy` fires on element render, not on
`open={true}`); `DatabasePicker` mounted once per text block; `fkAudit`
scanned `pages` 3× in one query; OG image dropped `runtime = "edge"`;
`optimizePackageImports += @phosphor-icons/react`.

**Analytics** — stopped writing `lat`/`lon`/`region` (nothing read them).
Kept in the schema: Convex validates *stored* documents, so dropping the
fields would fail the deploy on existing rows. Drop them once those rows age
out.

## Held deliberately

- **14 dead index declarations** (`schema.ts` ×13 + `traffic/tables.ts` ×1).
  Real but marginal — the audit's own correction: no `pages` and no
  `pageBlocks` index is dead, so **block edits pay zero of this cost**.
  Dropping an index is the only hard-to-reverse change in the set, and two
  of the 14 (`webhookDeliveries.by_attempted`, `userProfiles.by_lastSeen`)
  are wanted back by the prune-cron and admin fixes below. Not worth it yet.
- **Prune crons.** Six tables grow forever: `webhookDeliveries`, `auditLog`,
  `visitorPageviews`, `notifications`, `oauthCodes`, `aiRunProgress`. The
  last one has a cron documented **twice** (`schema.ts:~580`,
  `ai/internal.ts:~28`) that does not exist. Additive feature work, not
  cleanup — separate task. Note `aiRunProgress.by_user_updated` is
  `["userId","updatedAt"]` and **cannot** drive an age-based prune; that
  needs a new single-field `by_updated`.
- **`admin.getOverview`** — 8 unindexed 25k scans in one query. Admin-only,
  non-live (`OverviewPanel` is a one-shot `convex.query`, not a
  subscription), once per panel open. Low ROI for the blast radius.
- **`BoardView.tsx:95`** — pre-existing `react-hooks/rules-of-hooks` error
  (`useMemo` called conditionally). Predates this audit; `bun run lint`
  exits 1 because of it. Own fix.

## Refuted — do NOT re-propose

| claim | why it is wrong |
|---|---|
| delete `geoip-lite` (111 MB), Vercel headers cover it | `x-vercel-ip-*` exists **only on Vercel**; the self-hosted Docker lane is README-advertised and would lose `country`/`city` permanently. Only `lat`/`lon`/`region` were dead. |
| remove `rahman-shared`, "it's just `cn`" | Direct CLAUDE.md violation, and the dep is being *grown* — `docs/FORMULA-ENGINE-API.md` specifies publishing the formula engine into it, with enforcing boundary tests already live. |
| drop `@phosphor-icons/react`, lucide covers it | Deletes documented public API + a user-facing picker tab; `phosphor:Name` is **persisted user data**. The 41 MB never ships — `DynamicIcon` lazy-splits it. |
| map `phosphor:X → lucide:X` as fallback | Different name spaces (`House`/`Gear`/`EyeSlash` vs `Home`/`Settings`/`EyeOff`) — corrupts exactly the stored icons it claims to protect. |
| lazy-load the lucide icon map | `DynamicIcon` is SSR-rendered into `/share` and `/site` HTML; lazying it renders every page icon as a Suspense fallback in server HTML — an LCP/SEO regression on the routes being optimized. |
| delete `workspaces.get`/`upsert`, `comments` Kitab wrappers, `dashboard`/`trash` barrels | Zero in-repo callers, but all are written public contracts (`docs/api/workspaces.md` records the retention decision explicitly; the comments wrappers are the live kitab v0.2.0 surface). |
| downgrade `backfillMyWorkspaceId` to `internalMutation` | Breaks it — it calls `requireAuth`, which throws when there is no end-user identity. |
| vendor `@dnd-kit/modifiers` inline | Bundle saving is **0 bytes**; the whole ESM build is 2,941 B and tree-shakes. 224 KB was the pnpm store dir. |
| `useDbWriters()` / `memo(PropertyCell)` cut re-renders | Every sub-adapter memoizes on `[store]`, so the context value is new on every push and no memo stops the re-render. Needs a `StoreCtx` split. |
| `export const revalidate` on the OG image | Pre-Cache-Components API; this project sets `cacheComponents: true`. |
| add `recharts` to `optimizePackageImports` | Already in Next 16.2.6's built-in default list — a literal no-op. So is the existing `lucide-react` entry. |
| hand-trim `katex.min.css` | KaTeX selects among ~10 font families by command; trimming silently breaks `\mathfrak`/`\texttt`/`\mathscr`. |
| moving `"use client"` off the route shells cuts bundle | It swaps *which* module is the boundary. Net client JS unchanged — do it for the metadata capability, not the bytes. |
| delete 16 "stale" docs | None survived verification; several are cited by CLAUDE.md as canonical for in-flight work. "Fix the file" was never shown to be worse than "delete the file". |

## Bun migration

pnpm 10 → bun 1.3.14. `bun.lock` replaces `pnpm-lock.yaml`; `next` pinned to
`~16.2.6` first so the lockfile regen could not drift it — **verified zero
version drift across all 62 deps**. Dockerfile builds on `oven/bun:1.3-alpine`
and keeps a `node:20-alpine` **runtime** stage (`output: "standalone"` emits a
node `server.js`). Both workflows use `oven-sh/setup-bun@v2`; `vercel.json`,
the pre-push hook, `setup-auth.mjs` and the docs follow.

Two things did not move, on purpose:

- **Tests stay on vitest.** `bun test` grabs the same file globs with an
  incompatible runner — it breaks the 81-file convex-test/jsdom suite. Always
  `bun run test` / `bunx vitest run`, never `bun test`.
- **Docker runtime stays node**, per above.

`docs/audit/2026-07-16-perf-round2.md` recorded Bun as NO-GO. That finding is
still factually right — **bun buys zero app-runtime performance** (the app
runs on Vercel Node/Fluid + Convex V8 isolates, neither of which bun touches).
It was adopted for install/DX speed by owner decision, and the hardcoded-pnpm
walls that finding listed have all been removed.
