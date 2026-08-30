# Audit + migration plan — 2026-08-30

Scope asked for: (1) find unused files, (2) update outdated docs, (3) plan a
migration to **Svelte + Bun, keeping Convex**.

Method: 9-agent workflow — 3 finders (dead files · dead backend/deps · doc
drift), each attacked by an independent skeptic before a claim counted, plus
3 inventory passes (perf baseline · React→Svelte coupling · external
feasibility). **50 confirmed, 6 refuted.** Every number below was measured on
this machine on 2026-08-30, not estimated.

---

## 0. The recommendation, up front

**Do not migrate to Svelte. Migrate to Bun's runtime instead — the package
manager half already shipped.**

The migration's premise is performance. The measurements say performance is
not where this project is losing:

| measured | value |
|---|---|
| shared entry every route pays | **176 KB gzipped** (582 KB raw, 8 chunks) |
| all 124 chunks, all routes combined | 1.57 MB gzipped (5.26 MB raw) |
| production build | **1 min 14 s** (compile 33.5 s · tsc 33.2 s · 28 static pages 0.9 s) |
| test suite | 29.4 s — 87 files, 1175 tests |
| routes on Partial Prerender | **22 of 30** |

176 KB gzipped is already a good number for a Notion-class app. Svelte's
famous win is the framework runtime — React 19 + react-dom is roughly 45 KB
gzipped of that 176 KB. A perfect Svelte rewrite saves **~40 KB gzipped on
first load**, about 3–4 % of total transfer, and costs:

| surface | LOC | fate |
|---|---|---|
| `frontend/**/*.tsx` | 40,086 | **rewrite** |
| `app/**/*.tsx` | 4,847 | **rewrite** (routes → SvelteKit) |
| `frontend/**/*.ts` | 20,066 | ports as-is |
| `app/**/*.ts` | 406 | ports as-is |
| `convex/**` | 25,119 | **untouched** |

**≈ 45,000 LOC of JSX to rewrite to save ~40 KB gzipped.** That is the whole
trade, stated plainly. Section 3 prices it properly anyway, because you asked
for the plan and the decision is yours.

What actually pays, in order of return-per-hour:

1. **§1 — delete the confirmed dead code** (~600 LOC, 1 file, 1 dep). Hours.
2. **§2 — fix the 28 confirmed doc lies.** A day. Highest value in the set:
   two of them are in `CLAUDE.md`, the file every agent reads first, and one
   is a security-disclosure doc pointing researchers at a dead host.
3. **§2.4 — 28 Convex test files are typechecked by zero tsconfig projects**,
   including the entire authz suite. This is a real hole, found by the
   skeptic, not the finder.
4. **§4 — Bun runtime adoption.** Days, keeps every line of React.
5. §3 — Svelte. Quarters.

---

## 1. Unused files — the honest headline

**There is essentially no dead-file problem.** An import-graph reachability
scan over all 1006 `.ts`/`.tsx` files (roots = `app/**`, `scripts/**`, all of
`convex/**`, all `*.test.*`; resolving `@/`, `@convex/`, index barrels,
dynamic `import()`, `require()`, and bare side-effect imports) found:

> **1006 files, 1003 reached, 3 orphans.**

Two of the three are `slices/dashboard/index.ts` and `slices/trash/index.ts`,
which the 2026-08-10 audit already refused to delete as written contracts.
That leaves **one genuinely dead file**. The 2026-08-10 sweep did its job;
what remains is dead *symbols inside live files*.

### 1.1 Delete now — confirmed, no contract collision

| target | size | why |
|---|---|---|
| `frontend/test/setup.ts` + the empty `frontend/test/` | 15 L | `vitest.config.ts` declares no `setupFiles`; nothing imports it. Zero tests use a jest-dom matcher, so wiring it up instead is not worth it. Drop `@testing-library/jest-dom` with it — **keep `@testing-library/react`** (`useAsyncError.test.tsx` imports it). |
| `frontend/shared/lib/seed/pages.ts`, `seed/tasksDb.ts` | 196 L | Demo seed. `store.tsx` imports `seedUser` and nothing else from the barrel. Bonus: `NOW = Date.now()` at module scope in `seed/profile.ts` runs on every `store.tsx` import — it dies with them. |
| `frontend/shared/lib/seed/profile.ts` + `seed.ts` barrel | 28 L → ~9 L | `seedWorkspace` / `seedPreferences` have zero consumers. Collapse to one `seedUser` const. |
| `slices/workspace-sidebar/components/SidebarAction.tsx` | 41 L | Barrel-only. Never rendered, no doc records it. The one deletion in the whole batch with nothing pointing at it. |
| `isHiddenInView` (`databases/lib/visibility.ts:11`) | ~4 L | Zero references, including inside its own file. |
| `resolvePhosphorIcon` (`icon-picker/lib/phosphor-icons.ts:248`) | ~4 L | Same. |
| `__resetErrorCapture` (`shared/lib/error.ts:298`) | ~3 L | Self-described "test seam" no test calls. |
| `CodeLanguage` interface (`code-block/types/index.ts`) | 5 L of 16 | `CODE_LANGUAGES` declares its own inline type; the `aliases` field is used nowhere. Keep the file for `CodeBlockProps`. |
| `IconStyle` alias (`icon-picker/index.ts`) | 1 L | Renamed re-export that never found a consumer. |
| `@types/geoip-lite` (`package.json:99`) | 1 L | Its only consumer casts the module to `any` and declares a local result type; `noImplicitAny:false` means the untyped import raises nothing. **The only genuinely unused dependency of 62 checked.** |

Total ≈ **600 LOC + 2 devDeps**. Note the near-miss the skeptic caught:
`@edge-runtime/vm` looks equally unused to a name-grep but is pragma-loaded by
11 test files. Do not batch it in.

### 1.2 Keep — flagged, refuted, or contract-bearing

- **`public/` "orphans" (183 KB, 15 files)** — REFUTED as a deletion.
  `.gitignore:58-60` documents these as a deliberate brand kit
  (light/dark logo + banner svg/png/webp trios). Ask the owner before dropping
  the raster twins; do not gut the set for 183 KB.
- **`CsvActions`, `DatabasePresetPicker`, comments Kitab wrappers, ~25 shadcn
  sub-primitive re-exports, `frontend/shared/components/notion/` (675 L)** —
  all barrel-declared or doc-declared external surface. Same class the
  2026-08-10 audit already refused. Fix the *docs* that describe them
  wrongly (§2), do not delete the code.
- **`.env.local.selfhosted.bak`** — gitignored, untracked, local-only. Not
  the repo's business.
- **`propertyTypeMeta.ts` deprecation shim** — REFUTED, it has 4 consumers,
  not the 2 claimed.
- **16 over-wide `export` keywords** — real but do not hand-pick 16 of 166.
  Per CLAUDE.md's own rule ("a rule not in that script is a rule that will
  rot"), either accept the pattern or add a `check:rules` check that flags
  non-type exports with zero external references, prop-type interfaces exempt.

### 1.3 The gotcha that must be published

The first reachability pass (regex on `from "…"` / `import()` / `require()`)
reported **843 live lines as orphans**: `ColumnBlockEditor.tsx` (225),
`NestedBlock.tsx` (147), `NestedBlockControls.tsx` (166),
`nested-block/NestedContent.tsx` (152), `NestingCap.tsx` (10),
`nested-block/handlers.ts` (143). They are reached through a **bare
side-effect import** at `slices/editor/BlockEditor.tsx:23`
(`import "./blocks/NestedBlock";` — the subtree self-registers into
`nestedRegistry` and consumers resolve it at runtime). Any future dead-code
sweep that ignores side-effect imports will delete the nested-block editor.

---

## 2. Documentation — 28 confirmed lies

Git history is squashed (9 commits), so file dates prove nothing. Every claim
below was checked against the code.

### 2.1 Fix first — `CLAUDE.md`, the rule SSOT every agent reads

| line | says | truth |
|---|---|---|
| ~133-137 | "`shared/providers/` — cross-cutting providers … exports `WorkspaceIOProvider`" | `frontend/shared/providers/` **does not exist**. The provider is still at `slices/workspace-io/components/WorkspaceIOProvider.tsx`. The 2026-05-12 move was reverted or never landed — yet `docs/audit/2026-05-12-portability-status.md:13` still records it "✅ done", and a stale comment inside the provider claims the alias re-exports. |
| ~130 | "Old `router-compat.tsx` is now a thin re-export" | File gone. `shared/lib/router/` holds only `index.tsx` (122 L). |
| 4, 30 | "Convex ^1.36" | `package.json` = `^1.43.0`. |

The other 17 backticked paths in `CLAUDE.md` all resolve. Anyone following
the two above imports from a directory that is not there.

### 2.2 Wrong in a way that costs a stranger real time

- **`SECURITY.md:40`** — vulnerability-disclosure scope names
  `silong.rahmanef.com` as the in-scope deploy. **That host returns 502**;
  the self-hosted lane was turned off 2026-06-04. A researcher follows this
  doc, tests a dead host, and the actual production deploy is nominally out
  of scope. → `silong-os.vercel.app`.
- **`DEPLOY.md:10,232-238`** — "Lane 3 — Use the public demo" points at the
  same dead host. Also `:178,180`, where the OAuth-callback examples name the
  dead `api-silong` / `site-silong` hosts.
- **`docs/api/mcp.md:115,121,141`** — all three copy-pasteable curl recipes
  target `https://api-silong.rahmanef.com/mcp/v1`, which does not serve.
- **`docs/api/mcp.md:13,34,61,156-167`** — documents a standalone `mcp/`
  directory (`mcp/server.ts`, `mcp/tools.ts`, `cd mcp && npm install`). No
  such directory. The catalog is `convex/mcp/jsonrpc.ts:98`.
- **`docs/api/mcp.md:96,171-174`** — "per-user tokens are a follow-up",
  comments "blocked on backend table", users "single-user model today". All
  three shipped. `mcpTokens` is live. `MCP_API_KEY` is undocumented.
- **`CONTRIBUTING.md:127`** — "TypeScript strict mode". The app tsconfig is
  `strict:false`, `noImplicitAny:false`, `strictNullChecks:false`. Only
  `convex/tsconfig.json` is strict. A contributor writes code assuming
  guarantees the app build does not provide.
- **`CONTRIBUTING.md:152`** — "CI runs typecheck + lint + tests". CI does not
  run lint. It runs `check:rules → typecheck → tests → build`.
- **`CONTRIBUTING.md:110,159`** (+ `.github/PULL_REQUEST_TEMPLATE.md:25-26`)
  — tells contributors to add `convex/features/<name>/_schema.ts` (no
  `_schema.ts` exists anywhere) and to put migrations in `convex/migrations/`
  (no such dir; they live in `convex/admin/`).
- **`docs/api/notion-adapter.md:186-199` + `docs/notion-mega-slice.md:22-25`
  + `frontend/slices/notion/README.md:25,29,108`** —
  `useLocalStorageNotionAdapter()` is documented, given a copy-paste snippet,
  and given a comparison-table row. **It does not exist.** The snippet fails
  on import.
- **`docs/api/slices.md:94`** and `docs/rr-sync/2026-05-21-notion-mega-lift-plan.md`
  — hand out runnable recipes for `scripts/copy-slice.mjs` and
  `scripts/sync-to-rr.mjs`. Neither script exists. The doc claims "35
  generated" `slice.manifest.json` files; there are **0**.

### 2.3 Drifted — accurate once, wrong now

- `docs/api/slices.md:14-51` — 11 "Backend mirror" cells name directories
  that do not exist (`convex/agent/`, `convex/features/analytics/`,
  `convex/search.ts`, `convex/sharing.ts`, `convex/wiki.ts`, …).
- `docs/api/slices.md:45` — theme-presets advertises `<ThemePicker/>`,
  `useThemePreset()`, `THEME_PRESETS`. **None of the three exist.** Real
  exports: `TweakcnSwitcher`, `WorkspaceThemePicker`, `ThemeColorSync`,
  `TWEAKCN_PRESET_GROUPS`.
- `docs/api/slices.md:21,33` — `useLocalStorageFilesAdapter()` and
  `<CommentDrawer/>` do not exist.
- `docs/api/slices.md:13-51` — claims "every feature is summarised here",
  lists 37 of 40. Missing: `ai-keys`, `memory-graph`, `product-tour`.
- `docs/api/blocks.md:14-38` — "21 leaf + container types"; 10 shipped types
  are missing (`h4`, `h5`, `h6`, `columns4`, `columns5`, `synced`, `toc`,
  `audio`, `video`). README and ROADMAP correctly say "30+".
- `docs/types/domain.md:14-56` — same 21-member `BlockType` union; the
  printed `Block` also omits `activeViewId`, `viewOverrides`, `layoutGroup`,
  `admonition`.
- **`docs/api/pages.md` + `blocks.md:44` contradict a CLAUDE.md hard rule.**
  Neither mentions `pageBlocks`, `readPageBlocks`, or `writePageBlocks`;
  pages.md documents `blocks` as a normal patchable field of the page doc.
  CLAUDE.md says never read `page.blocks` directly.
- `docs/api/conventions.md:305-312` — "130 tests today", "no server-side test
  harness", "manual smoke after `npm run build`". Reality: **1175 tests / 87
  files**, a convex-test harness with 28 files, and bun.
- `docs/api/conventions.md:22,41` — lists a `PropertyTypeIcon.tsx` that does
  not exist; claims `limits.ts` exports `RETENTION` (it exports `AI_QUOTA`);
  omits `pageContent.ts` and `workspace.ts`, both mandatory per CLAUDE.md.
- **Two `propertyTypeMeta.ts` files exist** (`slices/databases/lib/` and
  `shared/lib/databases/`) and two docs name *different* ones as the SSOT
  (`conventions.md:19` vs `databases.md:245`). Path-existence sweeps are blind
  to this — both resolve.
- `README.md:7,11,165` — release badge `v1.1.0` (is 1.2.0), Convex badge
  `1.36` (is 1.43). Same 1.36 in `docs/architecture/diagrams.md:33`.
- `README.md:63` + `ROADMAP.md:13` — "Ten property types". There are **27**
  (`databases.md:245` has it right).
- `ROADMAP.md:3` — header still v1.1.0 / 2026-08-10.
- `ROADMAP.md:63-66` — "`check:rules` reports ~68 violations". It is green:
  0 new, 5 waivers, 47 baselined.
- `ROADMAP.md:99-131` — 3 of 8 "good first issues", advertised as "verified
  to exist at the paths given", are **already fixed**. A contributor would PR
  against fixed code.
- `docs/FEATURES.md` — titled "notion-page-clone", calls relations, rollups,
  formulas and timeline "mock"/"placeholder". All four are real.
- `docs/README.md:32,50,77` — bills `pages.md` as covering the pageBlocks
  split (it never mentions it), `mcp.md` as documenting a stdio server (does
  not exist), and claims two rr-sync docs are referenced by
  `eslint.config.mjs` (one is).
- **Rebrand rot**: `nosion` / `notion-page-clone` in 30 `.md` and 20 source
  files. Four *current* user-facing docs still greet the reader as Nosion —
  `docs/extending.md:1`, `docs/export-to-notion.md:3-9`,
  `docs/api/README.md:3`, `docs/api/mcp.md:1-5`. Distinct from the legitimate
  internal ids (`nosion-*` MCP tool names, the `nosion:theme-preset` key,
  `X-Nosion-Signature`) which CLAUDE.md says stay.
- **24 `.md` files still say pnpm / npx / npm run.** The repo has been bun
  since 2026-08-10. Includes `CLAUDE.md`, `CONTRIBUTING.md`, `ROADMAP.md`,
  `docs/README.md`, `docs/api/conventions.md`, `docs/api/mcp.md` — and
  `.claude/RULES.md` + `.claude/SLICES.md`, two rule files CLAUDE.md never
  mentions.
- `scripts/capture-screenshots.mjs` — emits `graph.png` and
  `graph-controls.png` that README does not use, and **cannot regenerate 5 of
  the 11 images README embeds** (command-palette, database-board, mobile-home,
  setup, templates). `bun run capture:screenshots` silently under-delivers.
- **32 of 40 slices have no `docs/api/` page** — including `editor` and
  `admin-panel`, the 1st and 3rd largest.

### 2.4 The backend findings — one of them is a real hole

- **28 Convex test files are typechecked by zero tsconfig projects.** Proved,
  not inferred: `convex/tsconfig.json` excludes `./**/*.test.ts`, and the root
  `tsconfig.json` include list is `next-env.d.ts` + `app/` + `frontend/` +
  `.next/types` — `convex/` appears nowhere.
  `bunx tsc -p convex/tsconfig.json --noEmit --listFiles | grep -c '\.test\.ts'`
  → **0**, and the root project → **0**. So `bun run typecheck` compiles
  neither. **The entire authz suite** — `authz-pages`, `authz-databases`,
  `authz-content`, `authz-workspaces`, `page-grants`, `sharing`,
  `workspace-authz` — has zero type coverage on its security assertions.
  This is also *why* the untyped dotted `api.features.x.y` form survives there.
- **Convex functions are referenced in two runtime-equivalent forms**, and the
  standard `api.<path>.<name>` grep misses one. Nested modules appear as
  `api["features/inbox/queries"].list` in `app/`+`frontend/` (39 bracket
  sites) but as `api.features.inbox.queries.list` in `convex/_test/`. **A
  dotted-only sweep reports 16 live functions as dead.** The dotted form is
  untyped and only compiles because of the gap above.
- **Dead index count moved up: 17 of 87, not the 12 the prior audit held** —
  and **7 of the 17 are invisible to a `.withIndex("name"` grep because the
  same index name is live on a different table** (`comments.by_user` and
  `pageViews.by_user` hide behind 46 `by_user` hits elsewhere). The count will
  stay wrong every cycle until the check is table-aware. Keep-flagged, split
  three ways: 6 are roadmap forward-declarations (keep, cite the
  multiworkspace roadmap), 2 want wiring up (`userProfiles.by_lastSeen`), the
  rest are candidates. Delete only `pageLinks.by_workspace_target_title` — the
  archived design proves the feature would need a differently-shaped index
  anyway.
- **7 write-only schema fields** (`acceptedBy`, `invitedBy`, `grantedBy`,
  `repliedBy`, `updatedBy`, `setBy`, `authMode`) — documented provenance
  columns. Keep writing them; Convex validates *stored* documents so removal
  fails the deploy on existing rows. The more interesting adjacent finding:
  `repliedBy` reaches the admin client through a **DTO-less `listFeedback`**.
- **Genuinely clean**: no dead tables (all 34 touched), no test-only public
  function, no function kept alive solely by `http.ts` or `crons.ts` (14
  httpAction sites + 10 cron entries all resolve).

### 2.5 Two mechanical checks to add to `scripts/check-rules.mjs`

CLAUDE.md: *"a rule that is not in that script is a rule that will rot."*
Both of these rotted exactly that way.

1. **Table-aware dead-index check** — pair `(table, index)` instead of
   grepping the index name globally.
2. **Bracket-aware Convex API reference sweep** — accept both
   `api.a.b.c` and `api["a/b"].c`.

---

## 3. The Svelte migration, priced properly

You asked for the plan. Here it is, with the load-bearing risk first.

### 3.1 Blocker: `@convex-dev/auth` has no Svelte support

> **Refined 2026-08-30 after reading the actual libraries.** Two corrections to
> what this section first claimed. (a) `convex-svelte` is considerably more
> complete than "no Svelte client ships" implied — it is official, and supports
> pagination, optimistic updates, auth plumbing (`setupAuth`) and SvelteKit SSR
> (`convexLoad`). (b) The blocker is therefore *narrower and sharper* than
> "Convex has no Svelte story": the plumbing exists, the
> **`@convex-dev/auth` implementation for Svelte** does not. Detail in
> `agents/convex.md` §5.

`node_modules/convex/` ships `react/`, `nextjs/`, `react-auth0/`,
`react-clerk/` — no `svelte/` in the core package (the Svelte client is the
separate `convex-svelte` package). No `@convex-dev/auth` Svelte binding
exists.
[convex-auth issue #89](https://github.com/get-convex/convex-auth/issues/89)
asked for it on **2024-10-01** and is still open, ~2 years later.

CLAUDE.md pins **"Auth = `@convex-dev/auth` — NO Clerk"**. Svelte forces that
pin off. The only working path is **Better Auth** via the community
[@mmailaender/convex-better-auth-svelte](https://www.npmjs.com/package/@mmailaender/convex-better-auth-svelte)
(0.8.2, published 2026-07-11).

That is not a frontend change. It rewrites `convex/auth.ts`,
`convex/auth.config.ts`, the users table, and **every existing user session** —
a live-account data migration, in the one part of the codebase §2.4 just
showed has **zero type coverage on its authz tests**. This is the single
biggest risk in the whole document, and it lands on the backend you wanted to
keep untouched.

### 3.2 What the Svelte ecosystem actually offers (checked 2026-08-30)

| package | version | published | who |
|---|---|---|---|
| `convex-svelte` | **0.14.0** | 2026-08-06 | **official Convex** (@convex.dev maintainers). peer: `convex ^1.30`, `svelte ^5.19` |
| `convex-sveltekit` | 0.1.12 | **2026-03-12** (5½ months stale) | community, self-described experimental, "expect breaking changes" |
| `@mmailaender/convex-better-auth-svelte` | 0.8.2 | 2026-07-11 | community |
| `bits-ui` | 2.19.0 | 2026-08-20 | healthy |
| `shadcn-svelte` | 1.5.1 | 2026-08-27 | healthy |
| `svelte-dnd-action` | 0.9.79 | 2026-08-21 | healthy |
| `@sveltejs/adapter-vercel` | 6.3.4 | 2026-08-21 | healthy |

`convex-svelte` being official and recently published is the good news, and it
covers more than expected: queries, mutations, actions, **pagination,
optimistic updates, query skipping, auth adapters, and SvelteKit SSR** via
`convexLoad`. Two of the hardest React-only Convex APIs are moot here anyway —
this repo uses `usePaginatedQuery` **0 times** and `preloadQuery` **0 times**.
It is still **0.x**, against a React client this repo uses in 300+ call sites.

One structural cost this document missed: Svelte projects need `convex.json`
pointing at **`src/convex/`** ("Svelte doesn't like referencing code outside of
`src/`"). This repo's `convex/` is at the root, so a migration relocates the
entire backend directory — changing every `@convex/*` import path and the
deploy config.

### 3.3 Coupling inventory — what actually has to change

**Confined and mechanical (the good news):**

- **Radix → bits-ui.** All 17 Radix packages are used, but **each appears in
  exactly one wrapper** under `frontend/shared/ui/` (33 files) — only
  `react-slot` (4) and `react-dialog` (3) repeat. The entire design-system
  blast radius is 33 files, and shadcn-svelte/bits-ui covers every primitive
  in the list. Rewriting `shared/ui/` is the single highest-leverage step.
- **`@convex-dev/auth` on the client is only 3 files** — `store.tsx` and
  `NavUser.tsx` (`useAuthActions`) and `AppProviders.tsx`
  (`ConvexAuthNextjsProvider`). The 20+ `getAuthUserId` imports are all
  server-side and survive. (The §3.1 blocker is about the *provider*, not the
  call-site count.)
- **`frontend/shared/lib/router/`** — 122 lines, one file. Becomes dead weight
  under SvelteKit; delete rather than port. `ROUTES` / `ROUTES_ABS` in
  `routes.ts` port as-is.
- **10 `.tsx` files exceed 300 LOC.** The `.tsx` mass is wide, not deep.

**Genuinely hard:**

- **`convex/react` call sites: 113 `useQuery` + 150 `useMutation` + 20
  `useAction` + 12 `useConvexAuth` + 6 `useConvex` + 3 `withOptimisticUpdate`.**
  ≈ 300 hooks to port to `convex-svelte`'s rune API. Mostly mechanical, but
  every one is a place the reactive semantics can differ. Silver lining:
  **`usePaginatedQuery` = 0 and `preloadQuery` = 0**, so two of the hardest
  React-only Convex APIs are not in use.
- **`@dnd-kit` → `svelte-dnd-action`: 26 files** (editor 14, databases 9,
  sidebar 3). Different mental model — dnd-kit is sensor/collision-based,
  svelte-dnd-action is zone-based. Block drag-reorder, board columns and
  table columns are three separate re-derivations, not a codemod.
- **Editor slice, 9,599 LOC — only 43 % portable** (4,132 `.ts` / 5,467
  `.tsx`). `inlineDecorator.ts` itself is a friendly 39 lines of plain DOM,
  but the contentEditable + caret-preservation + IME-safety logic is welded
  to the React render cycle. This is the highest-risk rewrite in the app —
  and per §1.3 it has a runtime self-registration pattern a naive port breaks.
- **Databases slice, 16,802 LOC — 43 % portable** (7,317 `.ts` / 9,485
  `.tsx`). Eleven views, 27 property types.
- **React glue**: 222 `"use client"` files, 17 `createContext`, 28
  `forwardRef` (bits-ui uses a different ref pattern entirely), ~1,500 hook
  call-sites.
- **Next-specific surface**: 75 route files, `proxy.ts`
  (`convexAuthNextjsMiddleware` — dies with §3.1), `next/link` ×17,
  `next/image` ×12, `next/navigation` ×25, `opengraph-image`,
  `instrumentation.ts`. SvelteKit has an answer for most.
  **It has no answer for Partial Prerendering — and 22 of 30 routes use it.**
  `experimental.cacheComponents` is a real capability being given up, not a
  Next tax being escaped.
- **Tests: 58 of 87 files are frontend** (`@testing-library/react`) and are
  rewritten. The **28 Convex test files survive untouched** — which is exactly
  the suite §2.4 shows is currently untypechecked.

### 3.4 If you do it anyway — the only sane sequencing

Strangler pattern. Never a big-bang branch.

| phase | work | gate |
|---|---|---|
| **0** | Land §1 + §2 + §2.5 first. Migrating a codebase whose own rule file points at directories that do not exist multiplies every error. Non-negotiable. | check:rules green, docs true |
| **1** | **Resolve §3.1 or stop.** Spike Better Auth + `convex-better-auth-svelte` on a throwaway Convex deployment. Migrate real user rows. If this fails, the migration fails — find out in week 1, not month 6. | test users can sign in/out; sessions survive |
| **2** | Typecheck the 28 Convex test files (§2.4). You are about to lean on them as the only surviving safety net. | `tsc` covers `convex/**/*.test.ts` |
| **3** | Extract portable logic. 20,472 LOC of `.ts` already ports; make that explicit — push framework-free logic *down* out of `.tsx` before rewriting any of it. Every LOC moved here is a LOC not rewritten twice. | ratio moves from 31 % portable upward |
| **4** | Rewrite `frontend/shared/ui/` (33 files) on shadcn-svelte/bits-ui. Highest leverage: unblocks every slice. | visual parity |
| **5** | Port slices **smallest-first** to build fluency on cheap targets: `search` (43 L) → `equation` (99) → `snapshots` (111) → `notifications` (151) → `wiki` (194). Two apps run side by side; SvelteKit serves the ported routes. | per-slice parity |
| **6** | `dnd-kit` → `svelte-dnd-action`, 3 separate re-derivations. | drag parity on all 3 |
| **7** | **Editor** (9.6k) then **databases** (16.8k). 40 % of the frontend, last, when the pattern is proven. | full parity |
| **8** | Delete `frontend/shared/lib/router/`, `proxy.ts`, React deps. Accept losing PPR on 22 routes or re-derive equivalent caching. | bundle re-measured |

**Honest estimate for a solo maintainer:** phases 1–8 are **6–12 months**,
with phase 7 alone being months. The trigger to abandon is phase 1 — if the
Better Auth data migration is not clean, stop there and keep React.

---

## 4. The migration that actually pays: Bun runtime

Half of "migrasi ke Bun" already shipped on 2026-08-10 (`80cfffe`):
`packageManager: bun@1.3.14`, `bun.lock` tracked, `pnpm-lock.yaml` gone.
Two things deliberately did not move, and only one of them still should not:

- **Tests stay on vitest** — correct, keep. `bun test`'s runner grabs the same
  globs and breaks the convex-test/jsdom suite. 29.4 s for 1175 tests is fine.
- **Docker runtime stage is `node`** because `output: "standalone"` emits a
  node `server.js`. This document originally proposed swapping it to
  `oven/bun` for a faster cold start. **Measured on 2026-08-30, and the
  proposal is refuted:**

  | runtime | boot → first served request, 3 runs |
  |---|---|
  | `node server.js` | 602 / 627 / 647 ms |
  | `bun server.js` | 1144 / 656 / 664 ms |

  Bun serves the standalone output correctly but is **not faster** — it is
  marginally slower at steady state and much slower cold. The Dockerfile's
  existing comment was right; that measurement is now recorded in the
  Dockerfile so the "upgrade" is not proposed again.

Remaining Bun surface, after that measurement:

1. ~~Dockerfile runtime stage → `oven/bun`.~~ **Measured, refuted** (above).
2. **Do not** chase `bun test`. Documented ceiling, still true.

So the Bun migration is, in substance, **done**. What was actually left of it
was the 24 `.md` files still saying pnpm/npx (§2.3) — now swept.

The 24 `.md` files still saying pnpm/npx (§2.3) are the actual unfinished
part of the Bun migration.

---

## 5. Order of work — steps 1–6 are DONE

Shipped in the same session as this document. Gates after: `check:rules`
0 new violations · typecheck 0 · **87 files / 1175 tests** · build green.

| | | status |
|---|---|---|
| 1 | **§1.1** delete ~600 LOC + 2 devDeps | ✅ done |
| 2 | **§2.1** fix `CLAUDE.md` — everything reads it first | ✅ done |
| 3 | **§2.2** fix `SECURITY.md`, `DEPLOY.md`, `mcp.md`, `CONTRIBUTING.md` | ✅ done |
| 4 | **§2.4** typecheck the 28 Convex test files | ✅ done — was 0, now 28 |
| 5 | **§2.5** add both `check:rules` checks | ✅ done — `dead-index`, `convex-api-ref` |
| 6 | **§2.3** drift sweep + bun/pnpm text + the four Nosion-facing docs | ✅ done |
| 7 | **§4.1** Dockerfile → `oven/bun`, measured | ✅ measured → **refuted**, see §4 |
| 8 | **§3** Svelte — only if §3.1 spikes clean | open, not recommended |

Also shipped, beyond the original list:

- **`agents/svelte.md` + `agents/convex.md`** — framework guidance written for
  coding agents, because a model's priors are not evenly distributed: React and
  Next are over-represented in training data, so the default Svelte answer is
  usually a React answer in different syntax. `svelte.md` leads with a
  reflex-correction table (`useEffect`-to-sync-state → `$derived`, module-level
  `$state` leaking across SSR requests, the `contenteditable` binding gotcha
  that hits this repo's editor directly). `convex.md` carries the long-form
  reasoning behind the CLAUDE.md rules plus the two greps that lie (§2.4).
  Linked from `CLAUDE.md` step 5 so they are actually found.
- **Dockerfile** — the `NEXT_PUBLIC_CONVEX_URL` build-arg defaulted to
  `https://api-silong.rahmanef.com`, the maintainer's own backend, down since
  2026-06-04. A self-hoster who forgot the build-arg got an image silently
  pointed at someone else's dead deployment. Default removed and replaced with
  a build-time guard that fails loudly.
- **`scripts/capture-screenshots.mjs`** — added the 5 shots it could not
  produce (`command-palette`, `database-board`, `mobile-home`, `setup`,
  `templates`). It now regenerates every image README embeds; before it
  covered 6 of 11 and silently left 5 stale.
- **A false positive in the `dead-index` rule, caught before it mattered.**
  A single combined regex let an unindexed `.query()` swallow the indexed one
  that followed, reporting the very-much-alive `feedbackEntries.by_status` as
  dead. Real count is **18**, not 19. Every one of the 18 was then re-verified
  by an independent script that resolves each `.withIndex` back to its
  enclosing `.query()` table.
- **A self-referential bug in `no-pnpm`.** The baseline records violation text
  verbatim, so baselining a `no-pnpm` hit wrote the offending string into a
  file the rule then scanned — each update generating a fresh violation. The
  ledger is now excluded from its own scan.

Notes from doing it:

- The `dead-index` rule reports **19**, not the 17 this document estimated
  and not the 12 the 2026-08-10 audit held. The extra ones are exactly the
  masked cases: `by_user` and `by_workspace` are live on `workspaceMembers`,
  which hid the dead `comments.by_user`, `pageViews.by_user`,
  `files.by_workspace` and `comments.by_workspace`. All 19 are **baselined,
  not deleted** — dropping an index is the only hard-to-reverse change in
  the set. The check is the SSOT for the count from here.
- `convex-api-ref` came up **green**, which is the useful negative result:
  no broken function reference in either form today. It exists to keep it
  that way.
- The 28 Convex test files were **type-clean** once included — the authz
  suite had no type errors hiding in it, it simply had no coverage. Root
  `tsconfig.json` already resolved the `@/` and `@convex/` aliases they
  need, so this was a two-line include change, not a new tsconfig project.
- `docs/FEATURES.md` was deleted rather than rewritten. Two earlier audits
  had already marked it stale and deferred it; `ROADMAP.md` plus the
  `docs/api/` pages are the maintained SSOT, and a third copy of the
  feature list only rots again.
- The `docs/rr-sync/` lift plans were given a dated status banner rather
  than a rewrite: they are forward plans for a cross-repo lift that has not
  landed, and `eslint.config.mjs:74` cites one of them in a live rule
  message, so they cannot simply move to `docs/archive/`.

What is deliberately **not** done, and why:

- **The 19 dead indexes are still declared.** Baselined as known debt. Six
  are roadmap forward-declarations, two (`userProfiles.by_lastSeen`,
  `webhookDeliveries.by_attempted`) are wanted back by admin/cron work.
- **32 slices still have no `docs/api/` page.** Tracked in `ROADMAP.md` as
  a good-first-issue; writing 32 doc pages is not a drift fix.
- **`scripts/capture-screenshots.mjs` still cannot regenerate 5 of the 11
  README images.** Needs someone to run it against a live deploy and decide
  which shots to keep — a judgement call, not a text fix.
- **The `nosion` identifiers in source** (`adapters/nosion.tsx`, the
  `nosion-*` MCP tool names, `X-Nosion-Signature`). CLAUDE.md says internal
  ids stay until a coordinated re-key. Only user-facing prose was swept.

---

## Appendix — measured baseline, 2026-08-30

```
build            1m14.158s   (compile 33.5s · tsc 33.2s · 28 static pages 0.872s)
tests            29.413s     87 files, 1174 passed / 1 skipped
client JS        5.26 MB raw / 1.57 MB gzip, 124 chunks
shared entry     582 KB raw / 176 KB gzip, 8 chunks
largest chunk    568 KB raw; recharts isolated in its own 426 KB chunk
.next            484 MB
node_modules     1013 MB
routes           30 total, 22 Partial Prerender, 6 dynamic, 2 static
source           frontend 760 files / 66,599 L · convex 170 / 25,119 L · app 75 / 5,253 L
portable vs jsx  20,472 L .ts  vs  44,933 L .tsx
slices           40 (databases 16,802 L · editor 9,599 L = 40 % of frontend)
```

Reachability: 1006 files scanned, 1003 reached, 3 orphans.
Audit: 50 confirmed / 6 refuted across 3 adversarially-verified dimensions.

Sources: [convex-svelte](https://www.npmjs.com/package/convex-svelte) ·
[Convex Svelte docs](https://docs.convex.dev/client/svelte/overview) ·
[convex-auth#89](https://github.com/get-convex/convex-auth/issues/89) ·
[convex-better-auth-svelte](https://www.npmjs.com/package/@mmailaender/convex-better-auth-svelte) ·
[convex-sveltekit](https://github.com/axel-rock/convex-sveltekit)
