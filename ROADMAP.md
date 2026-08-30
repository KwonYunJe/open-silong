# Roadmap

Where open-silong actually is, as of **2026-08-30** (v1.2.0). Derived from
`CHANGELOG.md`, the current audit
(`docs/audit/2026-08-30-svelte-migration-plan.md`) and the pre-open-source backlog
now archived at `docs/archive/notion-clone/`.

This file is the honest version. If something is half-built, it says so.

## Shipped

Block editor (30+ block types, slash menu, drag reorder, nesting, inline
markdown decoration, synced blocks, code + KaTeX) · databases (eleven views,
27 property types, filter/sort/group/hide, relations, rollups, 18 formula
functions, per-database templates) · multi-workspace with member roles and
invites · public share links, custom slugs, wiki mode, per-page viewer/editor
grants · threaded comments, `@page` mentions, `[[wikilinks]]`, `#tags`,
backlinks · knowledge graph (d3-force, global + local) · version snapshots ·
JSON workspace round-trip, ZIP/CSV/Markdown export · full-text search ·
command palette · admin panel with analytics and audit log · webhooks with
HMAC signatures · MCP HTTP surface (Notion-canonical JSON) · AI selection
actions and template generation via OpenRouter · Google OAuth (opt-in) ·
self-host via Docker Compose, or Convex Cloud.

## Next

Nothing here is claimed or scheduled. Pick one and open an issue.

- **More OAuth providers.** `convex/auth.ts` registers Google behind an env
  check; GitHub / Apple / Discord follow the same three-line pattern.
- **Real-time multiplayer cursors.** Presence rows already exist in
  `convex/schema.ts`; nothing renders them as live cursors.
- **PWA + offline read.** Deliberately not a PWA today —
  `frontend/shared/components/ServiceWorkerCleanup.tsx` actively unregisters
  service workers because a stale one served dead chunk URLs. Any offline
  work has to solve that first.
- **Sprint tooling.** The task-database preset seeds Sprints, but
  start/complete/burndown do not exist.
- **Timeline dependency lines.** Drag-to-adjust ships; dependency arrows do
  not.
- **Duplicate a public page into your own workspace** (login-walled clone).
- **Sub-items and dependencies** in databases.
- **Linked databases / shared data sources** — one schema, many surfaces.
- **Presentation mode.**
- **Documentation gaps** — several shipped slices have no `docs/api/` page
  (see "Good first issues" below).

## Known gaps and debt

Real problems, deliberately not fixed yet. Reasoning in
`docs/audit/2026-08-10-audit-bun-perf.md`.

- **12 dead index declarations** in `convex/schema.ts`. Dropping an index is
  the only hard-to-reverse change in that audit, and two of them are wanted
  back. No `pages` or `pageBlocks` index is dead, so block edits pay none of
  this cost.
- **`admin.getOverview` does 8 unindexed scans in one query.** Admin-only,
  one-shot (not a live subscription), so it is a low-ROI fix with a wide
  blast radius.
- **Adapter re-render churn.** Every sub-adapter memoizes on `[store]`, so
  the context value is new on every push and `memo()` on cells buys nothing.
  The real fix is splitting `StoreCtx`, not adding memos.
- **`check:rules` carries 47 baselined known-debt entries.** The gate
  itself is green (0 new violations, 5 waivers) — the remaining work is
  burning down that baseline, not fixing a red check.
- **24 of 40 slices have no dedicated `docs/api/` page.** All 40 do have a
  prose section in `docs/api/slices.md`, so this is a depth gap, not a
  documentation hole. (An earlier revision said "32, including editor and
  admin-panel" — wrong on both counts: that count came from a filename match
  that missed slices documented under a different name, and `editor` is
  covered by `blocks.md` / `block-controls.md` / `inline-decorator.md` while
  `admin-panel` is covered by `admin.md`.)
- **Legacy `Nosion` identifiers** remain across the code: storage keys
  (`nosion:theme-preset`), the `nosion://sync/` URL scheme, the
  `X-Nosion-Signature` webhook header. These are **persisted data and public
  contracts** — renaming them breaks existing installs, so they need a
  migration, not a find-and-replace.

## Out of scope

Not "someday" — decided against.

- **CRDT / operational-transform realtime editing** (Yjs, Automerge).
  Convex's reactive queries cover the collaboration level this project
  targets; a CRDT layer would rewrite the editor's data model.
- **SSO / SAML / SCIM.** Enterprise identity is not what this is for.
- **Clerk or any hosted auth vendor.** `@convex-dev/auth` only — see
  `CLAUDE.md`.
- **A non-Convex backend.** Postgres-direct, Supabase, and Firebase ports
  are out; the reactive query model is load-bearing.
- **Feature parity with Notion.** The goal is a workspace you can own and
  self-host, not a clone of every Notion surface.
- **Bun as the app runtime.** Bun is the package manager and build tool
  only. The app runs on Node/Fluid + Convex V8 isolates; the Docker runtime
  stage stays `node`. Tests stay on vitest — `bun test` breaks the suite.

## Good first issues

Each is small and self-contained. Re-verify the path before starting —
three entries in the previous list had already been fixed. Comment on an
issue (or open one) before starting so two people do not collide.

1. **Turn informal rule exemptions into real waivers.** Seven places carry a
   prose comment like `{/* shadcn Button skipped: role="checkbox" listbox
   semantics */}` (e.g.
   `frontend/slices/databases/views/table/Checkboxes.tsx`,
   `frontend/slices/admin-panel/components/ViewSwitcher.tsx`). The checker
   in `scripts/check-rules.mjs` only understands
   `// rules-allow: <rule-id> — <reason>`. Convert them, keeping the existing
   reason text, and watch the `raw-ui-primitive` count drop when you run
   `bun run check:rules`.

2. **Hardcoded dashboard route.**
   `frontend/slices/ai-keys/components/AISection.tsx:38` calls
   `router.replace("/dashboard/settings?s=ai")`. Slice code must not contain
   `/dashboard` literals — import `ROUTES_ABS` from `@/shared/lib/routes`
   and build the URL from `ROUTES_ABS.settings`.

3. **Three slices missing from the catalog.** `docs/api/slices.md` omits
   `ai-keys`, `memory-graph` and `product-tour`, all of which exist under
   `frontend/slices/`. Add a row for each, matching the format of the
   existing entries.

4. **Write `docs/api/trash.md`.** The `trash` slice
   (`frontend/slices/trash/`) powers `/dashboard/trash` and has no doc page.
   Use `docs/api/inbox.md` as the shape to copy — surface, the Convex
   functions it calls, and the restore/purge behaviour.

5. **Document the editor debug flag.** Appending `?debug=blocks` to a
   dashboard URL turns on block-lifecycle logging in
   `frontend/shared/lib/store/pageActions/blockCrud.ts` and
   `frontend/slices/editor/blocks/nested-block/handlers.ts`. It is
   undocumented — add a short "Troubleshooting" section to
   `docs/api/blocks.md`.

Before you start, read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup and
the slice rules.
