# Changelog

All notable changes to **open-silong** (formerly `notion-page-clone` /
`nosion`). Format inspired by
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); commits
follow [Conventional Commits](https://www.conventionalcommits.org/).

For granular per-commit history see `git log` or the per-wave audit
notes under `docs/audit/`.

## [Unreleased]

### Changed

- **Public routes are ~9% lighter.** `DynamicIcon` statically imported the
  icon-picker's 255-component lucide map, so every page that rendered a
  single icon paid for all 255 — including `/share/[id]` and `/site/[ws]`,
  the anonymous read-only routes that should be the leanest in the app. The
  map is now code-split behind `React.lazy` exactly as the phosphor map
  already was. Measured on a running production server, gzipped, counting
  every script and stylesheet the HTML references:

  | route | before | after |
  |---|---|---|
  | `/share/[id]` | 280 KB | **254 KB** |
  | `/site/[ws]` | 270 KB | **245 KB** |

  `/` and `/auth` are unchanged — they import lucide icons directly rather
  than through `DynamicIcon`. Trade: the first `lucide:` icon on a page now
  renders a frame late and is absent from the server HTML, same as phosphor
  already behaved. Emoji page icons, the common case, now cost nothing.
- **The public demo no longer exposes its integration surface.** With
  `NEXT_PUBLIC_DEMO=1`, Settings hides MCP, Script tokens and Webhooks, and
  the AI tab warns against pasting a real provider key into a shared,
  periodically-reset deployment. The tabs are filtered in the nav AND in the
  key resolver, so `?s=mcp-apps` cannot deep-link past it. The MCP endpoint
  is not secret (it is discoverable via `.well-known`), but inviting an
  anonymous visitor to wire a real ChatGPT connector or mint bearer tokens
  against the shared demo backend is a footgun for them and a spam vector
  for it. `IS_DEMO` moved to `frontend/shared/lib/demoMode.ts` — it had been
  copy-pasted into four files.

### Added

- **`structure_upsert` — idempotent bulk page-tree ingest over MCP.** The
  per-node tools express a tree only as N round-trips with no identity, so a
  second send duplicated everything; that made open-silong unusable as a
  *destination* for another project publishing structure into it. Each node
  now carries a caller-assigned `key`, stored as `pages.externalKey`
  namespaced `"<source>:<key>"` and resolved through a new
  `by_workspace_externalKey` index, so re-sending the same source+key updates
  in place. Page bodies are replaced on update (the sender owns that
  content); pages a human created are never adopted, because matching is by
  `externalKey` and only this tool writes it. Markdown parses into real
  blocks and reindexes into the knowledge graph. Limits 200 nodes / 6 levels.
  Six tests pin the idempotency guarantee — it is the whole point of the
  tool, and if it broke, every sync would double the workspace.

- **`agents/` — framework guidance for coding agents** (`svelte.md`,
  `convex.md`, `README.md`), linked from `CLAUDE.md`. A model's priors are not
  evenly distributed: React and Next.js dominate training data, so the default
  answer for another framework is often a React answer in different syntax.
  `svelte.md` leads with a reflex-correction table and covers the traps that
  bite hardest here — `$effect` used to sync state that should be `$derived`,
  module-level `$state` in a `.svelte.ts` leaking across SSR requests, and the
  `contenteditable` binding gotcha that lands directly on this repo's editor.
  `convex.md` carries the long-form reasoning behind the CLAUDE.md rules, the
  two greps that lie (index names are not unique across tables; function
  references have two runtime-equivalent forms), and the real state of
  `convex-svelte`. `CLAUDE.md` stays the SSOT and wins on conflict.
- **Two mechanical rules in `scripts/check-rules.mjs`** — `dead-index` and
  `convex-api-ref`. Both close a class of drift that a plain grep cannot see,
  per CLAUDE.md's own "a rule that is not in that script is a rule that will
  rot".
  - `dead-index` pairs `(table, index)` instead of grepping the index name
    globally. That matters: 7 dead indexes were invisible to the old
    name-only sweep because the same name is live on a *different* table
    (`comments.by_user` and `pageViews.by_user` hide behind 46 `by_user`
    hits elsewhere). Real count is **19**, not the 12 the 2026-08-10 audit
    held. Baselined as known debt, not deleted — dropping an index is the
    only hard-to-reverse change in the set and several are deliberate
    roadmap forward-declarations.
  - `convex-api-ref` accepts **both** reference forms. Nested modules are
    written `api["features/inbox/queries"].list` in `app/` and `frontend/`
    but `api.features.inbox.queries.list` in `convex/_test/`; a dotted-only
    sweep reports 16 live functions as dead. Currently green.
- **The 28 Convex test files are now type-checked.** They were excluded from
  `convex/tsconfig.json` and absent from the root `tsconfig.json` include, so
  `bun run typecheck` compiled *neither* — the entire authz suite
  (`authz-pages`, `authz-databases`, `authz-content`, `authz-workspaces`,
  `page-grants`, `sharing`, `workspace-authz`) had zero type coverage on its
  security assertions. Added to the root project, which already resolves the
  `@/` and `@convex/` aliases they need. They were type-clean; they were just
  unchecked.

- **`scripts/capture-screenshots.mjs` now regenerates every README image.** It
  could produce 6 of the 11 embedded shots, so re-running it silently left five
  stale; added `command-palette`, `database-board`, `mobile-home`, `setup` and
  `templates`, and documented the full output set at the top of the file.

- **Documented `requireWorkspaceAccess`** — the multi-workspace guard with 28
  call sites, and the most-used authorization helper in the codebase, had zero
  documentation.

### Removed

- ~600 LOC of dead code, all verified unreachable: `frontend/test/setup.ts`
  (vitest declares no `setupFiles`), the demo seed tree
  (`seed/pages.ts`, `seed/tasksDb.ts`, `seedWorkspace`, `seedPreferences` —
  only `seedUser` had a consumer), `SidebarAction.tsx`, `isHiddenInView`,
  `resolvePhosphorIcon`, `__resetErrorCapture`, the `CodeLanguage` interface,
  the `IconStyle` barrel alias, and `docs/FEATURES.md` (a stale third copy of
  the feature list that two prior audits had already deferred; `ROADMAP.md`
  and `docs/api/` are the SSOT).
- `frontend/slices/databases/lib/propertyTypeMeta.ts` — a deprecated one-line
  re-export shim. Two files named `propertyTypeMeta.ts` existed and two docs
  disagreed about which was the SSOT, which a path-existence sweep cannot
  catch because both resolved. The four consumers now import
  `@/shared/lib/databases/propertyTypeMeta` directly.
- Two unused devDependencies: `@testing-library/jest-dom` (reachable only
  from the dead setup file; no test uses a jest-dom matcher) and
  `@types/geoip-lite` (its only consumer casts the module to `any`).
  `@testing-library/react` and `@edge-runtime/vm` are **kept** — the latter
  looks unused to a name-grep but is pragma-loaded by 11 test files.

### Fixed

- **28 documentation claims that were false against the code.** The ones that
  cost a stranger real time: `SECURITY.md` pointed vulnerability reporters at
  `silong.rahmanef.com`, which has returned 502 since the self-hosted lane was
  turned off on 2026-06-04, leaving the actual production deploy nominally out
  of scope; `DEPLOY.md`'s "public demo" lane and `docs/api/mcp.md`'s three
  copy-pasteable curl recipes named the same dead hosts; `mcp.md` documented a
  standalone `mcp/` server directory that does not exist and listed per-user
  tokens as unbuilt when `mcpTokens` ships; `CONTRIBUTING.md` promised
  TypeScript strict mode (the app tsconfig is `strict: false`), claimed CI runs
  lint (it does not), and sent contributors to `convex/features/<name>/_schema.ts`
  and `convex/migrations/`, neither of which exists.
- **`CLAUDE.md`, the rule SSOT, named two paths that do not exist** —
  `frontend/shared/providers/` (the 2026-05-12 promotion of
  `WorkspaceIOProvider` was never landed; it is still in the slice) and
  `router-compat.tsx`. Also pinned Convex at 1.36 against a `^1.43.0`
  dependency.
- `docs/api/slices.md`: 11 "Backend mirror" cells named directories that do
  not exist, three slices were missing from a catalog claiming to list all 40,
  and the theme-presets / files / comments rows advertised six symbols
  (`<ThemePicker/>`, `useThemePreset()`, `THEME_PRESETS`,
  `useLocalStorageFilesAdapter()`, `<CommentDrawer/>`) that appear nowhere in
  the repo.
- `docs/api/pages.md` and `blocks.md` contradicted a CLAUDE.md hard rule by
  documenting `blocks` as a field of the page doc; block content has lived in
  the `pageBlocks` table since 2026-07-14.
- `useLocalStorageNotionAdapter()` was documented, given a copy-paste snippet
  and a comparison-table row across three files. It does not exist — only
  `adapter/convexAdapter/` ships.
- Block-type docs listed 21 of 30 types (`blocks.md`, `types/domain.md`);
  README and ROADMAP said "ten property types" against 27; README badges and
  four prose sites still said v1.1.0 / Convex 1.36; ROADMAP claimed
  `check:rules` reports ~68 violations when the gate is green, and three of
  its eight "good first issues" — advertised as "verified to exist at the
  paths given" — were already fixed.
- The four user-facing docs that still greeted readers as "Nosion"
  (`extending.md`, `export-to-notion.md`, `api/README.md`, `api/mcp.md`) now
  say open-silong. Internal ids (`nosion-*` MCP tool names,
  `nosion:theme-preset`, `X-Nosion-Signature`) are unchanged per CLAUDE.md.
<!-- rules-allow: no-pnpm — quoting the stale commands this entry replaced -->
- `.claude/RULES.md` and `.claude/SLICES.md` still handed out `npx tsc` /
  `npm run build` / `pnpm exec convex deploy` after the 2026-08-10 bun
  migration.

### Fixed

- `build:auto` was silent about which branch it took, so a Vercel build log
  never revealed whether the Convex backend had been deployed alongside the
  frontend. It now echoes `convex-deploy: RUNNING` or `convex-deploy: SKIPPED`
  with the reason, which makes the question answerable by one grep of the build
  log instead of by inference.
  - Confirmed from the build log for `6def9e3` that `CONVEX_DEPLOY_KEY` is
    **not** present in the production build environment: the conditional fell
    through to a bare `next build`. Backend deploys therefore still happen only
    via a manual `bunx convex deploy` or the `convex-deploy` workflow. Do not
    confuse this variable with `NEXT_PUBLIC_CONVEX_URL`, which is set.

## [1.2.0] - 2026-08-11

Security and quality-assurance release. Four ungated public Convex endpoints
were found and closed — every one of them surfaced by the handler-test suite
and API-surface audit added in this same release, which is the argument for
both. Also: CI that actually blocks, a machine-checked version of the rules
that were previously prose, and a dependency refresh.

### Security

- **`aiKeys.forResolver` exposed encrypted API-key envelopes to anonymous
  callers.** It was declared `query()` — fully public — while its own docstring
  said "Resolver-only … Never expose to the client directly". It takes `userId`
  and `workspaceId` as plain arguments and performs no authentication, so any
  caller could pass someone else's ids and read back that user's stored
  `encryptedKey`, provider and endpoint for every BYOK key. The ciphertext is
  not decryptable without the server-side secret, but this leaked key
  existence, ownership and provider, and handed out ciphertext for offline
  attack. Now an `internalQuery`; its single caller
  (`_shared/aiKeyResolver.ts`) goes through `internal.*`.
- **`ai.getProgress` streamed any user's in-flight AI run.** `runId` is a
  client-supplied string and the handler had no auth, so anyone holding or
  guessing one could read the run's steps, which carry prompt and tool-call
  content. Now owner-scoped, returning `null` on every miss so it cannot be
  used to probe which run ids exist.
- **`files.getUrl` served any tenant's private upload to any caller, including
  anonymous ones.** The handler wrapped `ctx.storage.getUrl(storageId)` with no
  authentication and no ownership lookup, so anyone holding, guessing or
  replaying a storage id could download another workspace's file. It now
  requires authentication and checks `files.by_storage` ownership, falling back
  to workspace membership, and returns `null` on every denial so it cannot be
  used to probe which storage ids exist. Public `/share` and `/site` pages are
  unaffected — they render images from the URL stored on the block, not through
  this query. Found by the new authz suite, which had pinned the insecure
  behaviour as a failing-by-design regression test.
- **`pages.update` allowed cross-workspace tree injection.** `parentId` was in
  the patch whitelist and written straight through; `requirePageWritable`
  authorizes the page being patched, never the destination. Any authenticated
  user could reparent one of their own pages under a page in a workspace they
  are not a member of. The handler now validates that the target parent exists,
  is in the same workspace, and is writable by the caller, and rejects cycles
  (moving a page under its own descendant, which would detach the subtree and
  make every `parentId` walk loop).

### Added

- **Rules linter — `bun run check:rules`** (`scripts/check-rules.mjs`, zero
  dependencies). Machine-checks seven hard rules from CLAUDE.md that were
  previously prose only: no bare `.collect()`, mandatory `args:` validators on
  client-reachable Convex functions, no raw `<button>`/`<dialog>`/
  `<input type=date|file>`, no raw internal `<a href="/…">`, no raw `<img>`,
  no hex colours in `className`, and no `pnpm`/`npx` left in commands.
  - Masks comments and string literals before matching. This matters: eight
    places in this repo mention `.collect()` *inside a comment quoting the
    rule*, and a naive grep reports every one of them.
  - Waivers: `// rules-allow: <rule-id> — <reason>` above the statement, found
    even when the violation sits at the end of a multi-line builder chain.
    Waiver count is printed so they stay visible instead of becoming silent debt.
  - Baseline ratchet (`scripts/check-rules.baseline.json`): the 47 pre-existing
    raw-UI-primitive violations are recorded as known debt so the gate is green
    on new code, while anything new fails. `--update-baseline` shrinks it.
- **CI that actually gates** (`.github/workflows/frontend-ci.yml`): rules →
  typecheck → tests → build, on every push to `main` and every pull request.
  Previously `workflow_dispatch`-only with tests marked `continue-on-error`, so
  nothing was enforced anywhere except one bypassable local hook. This
  repository is public, so GitHub-hosted runners are free — the
  dispatch-only convention used for private repos does not apply.
- **Backend deploy that does not need the maintainer's laptop**
  (`.github/workflows/convex-deploy.yml`). Pushing deploys the frontend but not
  Convex, so a schema change reached production only via a local `convex
  deploy`. Gated behind the same checks and a `CONVEX_DEPLOY_KEY` secret;
  fails fast with instructions when the secret is absent.
- **59 new Convex handler tests** across four suites covering the page,
  workspace, database and content authorization surfaces. Each endpoint is
  asserted from three vantage points — owner allowed, a *different*
  authenticated user denied, anonymous denied — with a raw read-back after each
  denial so a handler that throws *after* writing still fails. Verified by
  mutation testing: disabling `canReadPage` in `pages.getById` and the
  membership gate in `workspaces.setActive` each made tests fail, then the
  mutations were reverted.
- `ROADMAP.md`, a contribution on-ramp, and `docs/archive/` for the dated
  internal records that made the docs tree hard to navigate.

### Fixed

- The pre-push hook and CI now run `check:rules` before typecheck, so a rule
  violation is reported in seconds rather than behind a full type pass.

### Dependencies

- Refreshed everything within its declared semver range: `convex` 1.38 → 1.43,
  all 17 `@radix-ui/*` packages, `react`/`react-dom` 19.2.6 → 19.2.8, `next`
  16.2.6 → 16.2.12, plus `katex`, `highlight.js`, `tailwindcss`, `postcss`,
  `vitest`, `eslint`, `typescript-eslint`, `jose` and `playwright`.
  - This broke the typecheck in exactly one place: React 19.2.8 widened
    `React.Key` while Radix and vaul still declare `key?: string | number |
    bigint`, so spreading `React.ComponentProps<typeof X>` through the
    `Responsive*Dialog` title/description wrappers no longer typechecked. Fixed
    by omitting `key` from those prop types — which is also simply correct,
    since `key` is consumed by React and never reaches the component.
- **Deliberately NOT taken** — each is a major with real migration work, and
  none should ride along with a release whose point was closing security holes:
  `zod` 3 → 4, `recharts` 2 → 3, `sonner` 1 → 2, `lucide-react` 0.462 → 1.31,
  `jsdom` 25 → 30, `vitest` 3 → 4, `eslint` 9 → 10, `typescript` 5.9 → 7,
  `@auth/core` 0.37 → 0.41, `rahman-shared` 0.2 → 0.3, `next` 16.2 → 16.3,
  `katex` 0.16 → 0.18.

### Known

- `invites.accept` does not switch a first-time user into the workspace they
  just joined: `ensurePersonalWorkspace` never inserts a `userProfiles` row, so
  the `activeWorkspaceId` patch silently no-ops. Documented by a skipped test in
  `convex/_test/authz-workspaces.test.ts`.
- `pages.permanentlyDelete` removes only the *caller's* snapshots, so another
  workspace member's snapshots of a deleted page survive and stay readable.
  Needs a `by_workspace_page` index before it can be fixed properly.
- There is no member role-change mutation: an owner cannot demote an editor to
  viewer without deleting the workspace.

## [1.1.0] - 2026-08-10

Repo-wide audit wave: dead-code and dependency removal, a bundle/render
performance pass, a hook-order crash fix, retention crons for six
append-only tables, and a package-manager migration from pnpm to Bun.
Every finding was adversarially verified before it counted — 30 confirmed,
69 rejected. Full write-up, including the rejected claims, in
`docs/audit/2026-08-10-audit-bun-perf.md`.

### Changed

- **BREAKING for contributors and self-hosters — the package manager is now
  Bun 1.3** (was pnpm 10). `bun install` / `bun run <script>` / `bunx <bin>`.
  `bun.lock` replaces `pnpm-lock.yaml`; `Dockerfile`, both CI workflows,
  `vercel.json`, the pre-push hook and all docs follow. `next` is pinned to
  `~16.2.6` so the lockfile regeneration could not drift it — verified zero
  version drift across all 62 dependencies.
  - Tests still run on **vitest** (`bun run test`). Do **not** use
    `bun test` — its runner claims the same file globs and is incompatible
    with the convex-test/jsdom suite.
  - The Docker **runtime** stage stays on `node`; `output: "standalone"`
    emits a node `server.js`.
  - This buys install and build speed, not application speed. See the note
    in `docs/archive/audit/2026-07-16-perf-round2.md`.
- Analytics beacon no longer writes the `lat`, `lon` and `region` columns
  (nothing ever read them). The fields remain in the schema so
  already-stored rows still validate.
- `admin/fkAudit` scanned the `pages` table three times per run; hoisted to
  one scan.

### Added

- **Retention crons for six append-only tables** that previously grew
  without bound: `webhookDeliveries` (30 d), `auditLog` (180 d),
  `visitorPageviews` (90 d), `notifications` (90 d), `oauthCodes`
  (expiry + 1 d) and `aiRunProgress` (1 d). `schema.ts` and `ai/internal.ts`
  had both documented an `aiRunProgress` prune cron that did not exist.
  Each prune is an indexed range scan bounded to 500 rows that re-schedules
  itself while a full batch keeps returning, so a large first-run backlog
  drains without exceeding Convex's per-transaction limits.
- New indexes `notifications.by_created`, `oauthCodes.by_expires` and
  `aiRunProgress.by_updated`. The last is required because
  `by_user_updated` is `["userId", "updatedAt"]`, and a compound index
  cannot range-scan by age without an `eq()` on `userId` first.
- `convex/_test/maintenance-prune.test.ts` — 4 tests covering the cutoff,
  the no-op case, the batch cap, and the follow-up scheduling.

### Fixed

- **Board view could crash the database route.** `BoardView` called
  `useMemo` after an early return, so the hook count changed whenever the
  group-by property appeared or disappeared — switching a property's type or
  a first load could raise React's "rendered fewer hooks than expected".
  This was also the repo's only ESLint error, so `bun run lint` now exits
  clean and is a usable gate again.
- The pre-push hook invoked `scripts/rr-sync-status.mjs`, which does not
  exist in the repo (silently swallowed by `|| true`).

- **`scripts/capture-screenshots.mjs` now regenerates every README image.** It
  could produce 6 of the 11 embedded shots, so re-running it silently left five
  stale; added `command-palette`, `database-board`, `mobile-home`, `setup` and
  `templates`, and documented the full output set at the top of the file.

- **Documented `requireWorkspaceAccess`** — the multi-workspace guard with 28
  call sites, and the most-used authorization helper in the codebase, had zero
  documentation.

### Removed

- Three unused dependencies: `eslint-config-next` (nothing referenced it —
  `eslint.config.mjs` imports the plugins directly, ~14.6 MB),
  `@tailwindcss/typography` (Tailwind v4 loads plugins through an `@plugin`
  CSS directive that does not exist here, so it emitted nothing) and
  `@radix-ui/react-toggle` (its only consumer was a component that is never
  rendered).
- `convex/features/{graph,search}/index.ts` — `export *` barrels that caused
  Convex to deploy a **second copy** of 8 public functions.
- Five of the six `features/graph` queries (−212 lines). Backlinks, the
  local graph and tags are all computed client-side; only `getGlobalGraph`
  had a caller.
- `convex/admin/fkGc.ts`, the one-shot FK garbage collector whose
  schema-tightening migration had already shipped.
- Dead exports: `changelog.listPublished`, `ai._getGlobalAISettings`,
  `aiQuota.readAiTokenUsage`, `drawer-lazy.DrawerTrigger`, and the
  `relationMirror` re-export shim.
- `ResponsiveDialog`'s `Trigger`/`Close` exports, the `forceMode` prop and
  the entire sticky-layout branch behind three never-passed props
  (−108 lines); same treatment for the alert-dialog variant.
- A placeholder test asserting `expect(true).toBe(true)`, an orphaned
  screenshot, and an empty directory.

### Performance

- `/share` and `/site` imported `DynamicIcon` through the icon-picker
  barrel, which pulled Radix Popover, `@floating-ui` and the emoji catalog
  into the two public SEO routes. Switched to a leaf import; `IconPicker` is
  now absent from both route manifests.
- The database and editor adapter hooks rebuilt whole-workspace lookup Maps
  once per consumer per store push, across 65 call sites. Now built once per
  push and shared through an identity-keyed `WeakMap`.
- `store.tsx` used `?? []`, minting a fresh array identity on every render
  and invalidating the entire store context during cold boot.
- Search debounced by 180 ms — previously every keystroke tore down and
  reopened a Convex subscription, running up to four search-index scans.
- `SearchModal` and `MobileBottomNav` chunks were downloaded on every
  dashboard load: `React.lazy` fires its import on element render, so
  `open={false}` deferred nothing.
- `DatabasePicker` mounted once per text block, unguarded.
- Dropped `runtime = "edge"` from the OG image route (deprecated guidance on
  Vercel, and it disabled static generation for the route).
- Added `@phosphor-icons/react` to `optimizePackageImports`.

Measured, same machine, same command: client JS 5.30 → 5.17 MB raw across
125 → 123 chunks, `node_modules` 1.9 G → 1.0 G, `.next/standalone`
288 → 175 MB, production compile 44 → 28 s, TypeScript 85 → 39 s.

## [1.0.0] - 2026-07-17

First public open-source release. Consolidates the OSS-readiness prep, the
Obsidian-style knowledge graph, and a large performance + security + mobile
pass. Production-deployed on Vercel + Convex Cloud; typecheck + 1,110 tests +
build green.

### Added
- **Per-page share grants** — share a single page with a specific user (by
  email) as viewer or editor, independent of workspace membership; granted
  pages surface in the library "Shared" section. Bounded authz through two
  helpers (`canReadPage` / `requirePageWritable`) so an editor grant reaches
  page content only — never trash / delete / re-share / grant management.
- **Convex handler test suite** — a `convex-test` harness
  (`convex/testHarness.test.ts`) + 33 in-process handler tests covering pages
  CRUD + descendant cascade, database rows, the workspace membership gate
  (owner / non-member / viewer / unauth), public share slugs, and per-page
  grant authz.
- **Knowledge graph, Obsidian-style** (`/dashboard/graph`) — interactive
  cloud of pages, `[[wikilinks]]`, `@mentions`, `#tags`, and database rows,
  with backlinks and unresolved "ghost" nodes.
- **Architecture diagrams** — `docs/architecture/diagrams.md` (Mermaid:
  system, auth/authz flow, data model, slice graph, memory-graph pipeline),
  embedded in the README.
- **`TRADEMARKS.md`** — plain-language inspiration + trademark clarification
  for Notion & Obsidian (idea/expression distinction, nominative fair use,
  interoperability). Not legal advice.

### Changed
- **Partial Prerendering (Next Cache Components)** — the auth + realtime stack
  is scoped to an `(app)` route group and `cacheComponents` is enabled, so
  every route builds as a static shell + server-streamed data; public
  `/share`·`/site`·`/forms` no longer boot the Convex client.
- **Performance pass** — −~400 KB dashboard first-load (barrel→leaf import
  split), dropped the always-mounted global snapshot subscription,
  content-keyed structural sharing so a single edit re-renders one row,
  `getById` DTO (drops the ~8 KB `searchText` duplicate off the hot editor
  sub), admin analytics made non-reactive, and ~2.6 k lines of dead code +
  the orphaned slice-portability apparatus removed.
- **Mobile UX** — the AI console and the page action menu are now vaul
  bottom-sheet drawers (drag the handle to close); nested submenus portal
  into the drawer; the mobile topbar was decluttered (theme relocated into
  the page menu, redundant search hidden); submenus open centered.
- **Graph Forces rebuilt on the d3-force model** — inverse-square repulsion,
  degree-normalised link springs, `forceX/Y` centre gravity. (`8c95727`)
- **Graph Animate + controls** — alpha/temperature simulation with reheat +
  breathing, neighbourhood focus dimming, curved edges, cluster tinting,
  zoom-to-fit, persisted settings. (`f43df31`, `3bb3c92`)

### Fixed
- **`@`-mention rendered an extra line** — Tailwind Preflight forces
  `svg{display:block}`, which pushed the inline mention icon onto its own line
  above the label; the icon is now `display:inline-block`.
- **Nested trash / restore / permanently-delete threw in production** — the
  descendant BFS called `.paginate()` once per level, but Convex allows only
  one paginated query per function execution; each level now reads with an
  indexed `.take`.

Prior polish wave — root `CHANGELOG.md`, smoke-test golden flow doc, env
gitignore hardening, OSS readiness tick-off.

## 2026-05-23 — Production hardening (post-Phase 7)

### Fixed
- **Add View** silently failed after Phase 3 (`38f8243`): clicking
  "+ Add view" flashed but the new view never persisted. Root cause
  was a race in `useDbAdapter.addView`'s two-step compose
  (addView + updateView); the second call read stale `databaseMap`
  mid-callback and clobbered the first mutation's writes. Fix:
  `adapter.databases.addView` contract now accepts the full view
  config so the create completes in one round-trip. (`a5a950d`)
- **Duplicate Property** lost cloned `options` / `formulaExpression` /
  `rollupAggregate` for the same race-pattern reason. Added a
  dedicated `adapter.databases.duplicateProperty` method that
  delegates to the store's single-mutation clone. (this release)
- **PageEditor** mounted an inner `EditorComponentsProvider` with an
  empty `{}` fallback, shadowing `NotionAppProvider`'s bundled
  `DatabaseBlock` registry — block renderer showed a "not registered"
  stub even though the provider was mounted. Fix: merge outer
  registry into per-call overrides. (`bdcdcbf`)

### Added
- **Undo / Redo buttons** in the dashboard header, surfacing the
  existing workspace-level `useUndoRedo()` stack. Tooltip exposes
  ⌘Z / ⌘⇧Z hotkeys (Mac/Win-aware). Native contenteditable undo
  still handles in-block text edits. (`186617f`)
- **Error boundaries** for `/forms/:slug`, `/oauth/authorize`,
  `/site/:ws` — three public routes that previously bubbled render
  errors to the root boundary. (`5ae4356`)
- **301 / 308 redirects** from `nosion.rahmanef.com` and
  `notion-page-clone.rahmanef.com` to the canonical
  `silong.rahmanef.com`, preserving path + query. (`e1b69d7`)

## 2026-05-20 — Open-source pivot (v0.1.0-pre)

The first public OSS release prep. Project renamed
`notion-page-clone` → `open-silong`. Repo flipped license to MIT.
Brand becomes "Silong" for display surfaces.

### Phase 1 — OSS readiness foundation (commit `4c560f2`)

- Added `LICENSE` (MIT, 2026 Rahman Effendi and contributors)
- Rewrote `README.md` with 3-lane quick start (Convex Cloud /
  self-hosted Docker / public demo) and Notion-Labs disclaimer
- New `CONTRIBUTING.md` — dev setup, slice contract, PR conventions
- New `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- New `SECURITY.md` — disclosure email + private advisory fallback
- New `DEPLOY.md` — Lane 1/2/3 + backup + migration + troubleshooting
- New `.env.example` — annotated per-lane sections
- New `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config.yml}`
  + `.github/PULL_REQUEST_TEMPLATE.md`
- `package.json` — name = `open-silong`, license = MIT, author, repo,
  homepage, 10 keywords
- `next.config.mjs` — default URLs → `silong.rahmanef.com`
- `CLAUDE.md` — rebrand header + transition notes block

### Phase 2 — Surface rebrand Nosion → Silong (commit `cebf1d9`)

18 files touched. UI labels, OG image, sitemap, OAuth discovery,
share view, install prompt, export filenames.

Preserved for back-compat (deferred to coordinated re-key):
- localStorage keys (`nosion:iconRecents`, `nosion:theme-preset`, …)
- MCP server tool names (`nosion-search`, `nosion-list-pages`, …) +
  package `@nosion/mcp-server`
- Convex `INSTANCE_NAME` + backend domain
- Webhook header `X-Nosion-Signature`
- Code identifiers (`NosionCommandPalette`, `nosion://sync/`)

### Phase 3 — First-run demo seed (commit `1f012ad`)

- `convex/_shared/seedWelcomeContent.ts` — NEW. Three welcome pages
  auto-seeded into a freshly-created personal workspace:
  - 👋 Welcome to Silong (features overview)
  - ✨ Try the slash menu (interactive cheat sheet)
  - 🚀 Self-hosting & next steps (deploy lanes + repo links)
- `convex/_shared/workspace.ts` — `ensurePersonalWorkspace` adds
  `justCreated` flag; calls seed only on first creation.
- Opt-out: set `SILONG_DISABLE_SEED=1` on the Convex backend.

### Phase 5 — rr-side pointer update (rr commit `313777b`)

In the [rahmanef-resources-site](https://github.com/rahmanef63/resources)
monorepo:
- `notion-page-clone-os` template description clarifies "localStorage
  demo" + pointer to open-silong as the production stack
- `notion-shell` slice agentRecipe adds product-pointer block
- Two-surface model: rr = template marketplace + lifted slice;
  open-silong = production OSS Notion-inspired workspace

### rr-sync round 1 (rr commit `193f9f0`, this repo commit `abb17f6`)

- `theme-presets` slice lifted to rr (20 files; pure React + Tailwind
  v4 + next-themes)
- Tag `notion-like` added to 5 rr catalog entries: `command-menu`,
  `icon-picker`, `notion-blocks`, `notion-shell`, `theme-presets`
- `docs/archive/rr-sync/lift-status.md` NEW — per-slice status + adapter
  contract for 11 blocked-pending-adapter slices

### Infra ops

- GitHub repo renamed `notion-page-clone` → `open-silong` (old URL
  redirects)
- Repo description + 10 topics set
- Local git remote updated to SSH `git@github.com:rahmanef63/open-silong.git`
- Dokploy domain `silong.rahmanef.com` configured (port 3000,
  https=true, letsencrypt)
- DNS A record for `silong.rahmanef.com` → `<YOUR_VPS_IP>`: pending
  user-side at DNS provider
- Legacy `nosion.rahmanef.com` kept as transition redirect

## Pre-OSS history (before 2026-05-20)

Feature roadmap and per-wave changelog lived at
`docs/archive/notion-clone/ROADMAP.md` + `docs/archive/notion-clone/SPRINT.md`.
Highlights:

- Multi-workspace (cycle 7) — per-user `userProfiles.activeWorkspaceId`,
  membership ledger, role-based access (owner / editor / viewer)
- Sharing — public share links with optional password + indexable toggle
- Comments + mentions + snapshots
- Wiki mode
- Import/export — JSON round-trip + Notion-compatible ZIP
- MCP — Notion-canonical JSON HTTP surface (ChatGPT + Claude Desktop +
  Cursor integration)
- AI agent + AI router
- BH/BI/BJ waves — notion-shell wrappers lifted to rr's
  `frontend/slices/notion-shell` (v0.4.0): SlashMenu, BlockActionsMenu,
  InsertBlockButton, inlineDecorator, NotionDatabase with 6 views, 10
  property cells, SortableBlockList, PageActionsMenu, ImageRenderer +
  EmbedRenderer

See `docs/archive/audit/2026-05-20-rr-bh-bi-bj-completion.md` for the full
BH/BI/BJ provenance map.
