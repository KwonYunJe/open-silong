# open-silong documentation

Live demo: <https://silong-os.vercel.app>

Everything listed below is **current**. Anything under
[`archive/`](./archive/) is a point-in-time record kept for provenance —
see [`archive/README.md`](./archive/README.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand the system in one screen | [`architecture/diagrams.md`](./architecture/diagrams.md) |
| Find a feature and where it lives | [`api/slices.md`](./api/slices.md) |
| Add or change a Convex function | [`api/conventions.md`](./api/conventions.md) |
| Add a block / property / view type | [`extending.md`](./extending.md) |
| Consume pages & databases from a new slice | [`api/integration.md`](./api/integration.md) |
| Know the data shapes | [`types/domain.md`](./types/domain.md) |
| Pick something to work on | [`../ROADMAP.md`](../ROADMAP.md) |
| Set up locally | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Deploy | [`../DEPLOY.md`](../DEPLOY.md) |

## Reference — `api/`

Per-surface contracts. [`api/README.md`](./api/README.md) is the index.

| Doc | Covers |
|---|---|
| `api/slices.md` | catalog of every frontend slice |
| `api/conventions.md` | rules every Convex function follows |
| `api/auth.md` | `requireAuth` / `requireOwned` / `requireAdmin*` / `requireWorkspaceAccess` |
| `api/pages.md` | page CRUD + content (`pageBlocks` split) |
| `api/blocks.md` | block model, registry, slash menu |
| `api/block-controls.md` | drag handle, block menu, turn-into |
| `api/inline-decorator.md` | WYSIWYG markdown decoration in contentEditable |
| `api/databases.md` | schema, properties, views, rows |
| `api/formulas.md` | formula property evaluation |
| `api/comments.md` | page + block comments, moderation |
| `api/snapshots.md` | version history |
| `api/search.md` | full-text search |
| `api/files.md` | Convex storage upload flow |
| `api/inbox.md` | notifications |
| `api/library.md` | `/dashboard/library` surface |
| `api/admin.md` | `/dashboard/admin` surface |
| `api/templates.md` | template catalog, instantiate, AI prompt generator |
| `api/workspaces.md` | multi-workspace model + membership |
| `api/import-export.md` | JSON round-trip + CSV + ZIP |
| `api/notion-shape.md` | Notion-canonical JSON adapter |
| `api/notion-adapter.md` | `useNotionAdapter()` — the slice ↔ backend seam |
| `api/mcp.md` | MCP HTTP + JSON-RPC surface |
| `api/ai.md` | OpenRouter chat action |
| `api/integration.md` | how a slice consumes pages/databases |

## Guides

| Doc | Covers |
|---|---|
| [`extending.md`](./extending.md) | add a block type, property type, view type, or import shape |
| [`export-to-notion.md`](./export-to-notion.md) | moving content between open-silong and Notion |
| [`notion-mega-slice.md`](./notion-mega-slice.md) | embedding the editor + databases bundle in another React app |
| [`FORMULA-ENGINE-API.md`](./FORMULA-ENGINE-API.md) | formula engine API + the plan to publish it standalone |

## Architecture & audits

- [`architecture/diagrams.md`](./architecture/diagrams.md) — system, data
  model, auth flow, slice graph, memory-graph pipeline.
- [`audit/2026-08-10-audit-bun-perf.md`](./audit/2026-08-10-audit-bun-perf.md)
  — **most recent audit.** Dead code, deps, perf, and the pnpm → bun
  migration. Its "Refuted" table is a list of changes not to re-propose.
- The remaining files in [`audit/`](./audit/) are earlier waves that
  `CLAUDE.md` still cites as canonical for in-flight work
  (`2026-05-03-audit-bp.md`, `cache-components.md`,
  `2026-05-09-modularity-audit.md`, `2026-05-10-multiworkspace-roadmap.md`,
  `2026-05-11-portability.md`, `2026-05-12-portability-status.md`,
  `2026-05-12-database-route-refactor.md`).
- [`rr-sync/`](./rr-sync/) — adapter-lift plans. One of the two,
  `2026-05-21-notion-mega-lift-plan.md`, is cited by the live
  `eslint.config.mjs:74` rule message. Both are forward-looking plans,
  not descriptions of shipped code.

## Source of truth

| Thing | Where |
|---|---|
| Server | `convex/` |
| Client | `frontend/slices/<slug>/` + `frontend/shared/` |
| Routes | `app/` + `frontend/shared/lib/routes.ts` |
| Types | `frontend/shared/types/domain.ts` |
| Schema | `convex/schema.ts` |

If a doc disagrees with the code, the code wins — open an issue, or fix
the doc in the same commit as the code.
