# Contributing to open-silong

Thanks for considering a contribution — bug reports, feature ideas,
docs fixes, and code PRs are all welcome.

## How this repo actually works

Being straight with you, because the two halves of this differ:

- **The maintainer pushes directly to `main`.** Solo dev, conventional
  commits, no self-review theatre. So `main` moves without PRs and you
  will not see an internal review queue.
- **Contributions from everyone else come as pull requests**, and they
  get reviewed and CI-checked before merge. That is the only path in for
  outside code, and it is a real one — the checks below are the same ones
  the maintainer runs locally before pushing.

Practical consequences: rebase on `main` before you open a PR (it may
have moved), and open an issue first for anything larger than a bug fix
so you do not build something that collides with work in flight.

## Quick links

- **Looking for something to work on?** [`ROADMAP.md`](./ROADMAP.md) has
  a "Good first issues" list — real, verified, small tasks with file
  paths.
- **Got a bug?** Open an issue with the bug template — a small repro
  helps most.
- **Want to discuss before coding?** Open a GitHub Discussion (or an
  issue with the feature template).
- **Tiny doc fix?** Just open a PR.

## Dev setup

### Prerequisites

- Node 20+ (LTS)
- Bun 1.3+ (the repo pins `packageManager: bun@1.3.14`)
- Docker + Docker Compose (for self-hosted Convex lane)
- A Convex Cloud account (for the cloud lane)

### Local install

```bash
git clone https://github.com/rahmanef63/open-silong.git
cd open-silong
bun install
cp .env.example .env.local
# Pick your Convex lane — see DEPLOY.md
bun run dev
```

Hot-reload Next at `http://localhost:3000`. The Convex dev backend
streams logs in the terminal you ran `bun run convex:dev` in.

### Useful scripts

```bash
bun run dev               # Next dev server (port 3000)
bun run typecheck         # tsc --noEmit, app + convex tsconfigs (green before commit)
bun run test              # vitest run
bun run lint              # eslint
bun run check:rules       # project-specific rule checker (see below)
bun run convex:dev        # Convex dev backend (cloud lane)
bun run convex:deploy     # push functions to your Convex backend
```

**Bun, not npm/pnpm.** The repo migrated in v1.1.0 (`bun.lock`, no
`pnpm-lock.yaml`). One exception: **tests run on vitest** — use
`bun run test` or `bunx vitest run`. Never `bun test`; its runner claims
the same file globs and breaks the convex-test/jsdom suite.

`bun run check:rules` enforces the house rules below (theme tokens,
shadcn primitives, Convex validators, bun-only commands). It currently
reports pre-existing violations, so treat it as "no *new* violations from
your diff" rather than a clean gate. Deliberate exceptions are waived
inline with `// rules-allow: <rule-id> — <reason>`.

## Codebase tour

Read [`CLAUDE.md`](./CLAUDE.md) — it's the same file we hand to AI
agents working in this repo, so it's the most current architectural
brief. Then:

- `app/` — Next 16 App Router routes. Dashboard lives under
  `/dashboard/*`.
- `frontend/slices/<name>/` — vertical feature slices (editor,
  databases, comments, …). Each slice exports through `index.ts`
  and is consumed directly by routes.
- `frontend/shared/` — cross-slice primitives (UI, store hooks,
  routes, providers).
- `convex/` — backend (queries/mutations/actions/schema/auth).
- `docs/` — per-feature reference, architecture notes, current audit.
  [`docs/README.md`](./docs/README.md) is the index;
  [`docs/archive/`](./docs/archive/) is history, not guidance.

### Slice contract

A slice is a self-contained feature folder. Cross-slice imports go
**through the barrel only** (`@/features/<slice>`, not deep imports
into another slice's internals). Backend code lives in
`convex/features/<slice>/`.

When adding a new feature:

1. Decide if it's a slice or a primitive (single component →
   `frontend/shared/components/`; multi-file feature → slice).
2. Scaffold `frontend/slices/<name>/` with `components/`, `hooks/`,
   `lib/`, `types.ts`, `index.ts`.
3. If it needs backend, add `convex/features/<name>/` with
   `queries.ts` + `mutations.ts`. Schema stays central in
   `convex/schema.ts` — features do not carry their own schema file.
4. Add a doc page at `docs/api/<name>.md`.

## Conventions

### Commits

Conventional commits, scope optional:

```
feat(editor): add tag autocomplete in inline mentions
fix(databases): preserve sort when adding a row
docs(deploy): clarify self-hosted POSTGRES_URL format
chore(deps): bump convex to 1.37
```

### Code style

- The app `tsconfig.json` is **not** strict (`strict: false`,
  `noImplicitAny: false`, `strictNullChecks: false`); only
  `convex/tsconfig.json` is. "No `any` without justification" is a
  convention here, not a compiler guarantee.
- Tailwind v4 + theme tokens only — no hex literals.
- shadcn primitives only — never raw `<button>` / `<dialog>` /
  `<input type=date>`.
- Convex public functions declare `args: { v.* }` validators.
- `defineTable(...).index(...)` for every `.filter` / `.order` path.
- No bare `.collect()` — use `.withIndex(...).take(N)` or paginate.
- File size cap: ~200 LOC as a soft target. Larger files exist; if you
  are adding to one, prefer splitting.

### Authz

Every public Convex mutation/query performs authz **inside the
handler** — use `requireOwned` / `requireWorkspaceMember` from
`convex/_shared/`. Route gates are convenience, not the boundary.

### Opening a pull request

1. Fork → branch (`feat/...`, `fix/...`, `docs/...`).
2. Commits with conventional prefixes.
3. `bun run typecheck` + relevant `bun run test` green before push.
   Rebase on `main` — it moves without PRs.
4. Open the PR against `main`. The template prompts for context,
   screenshots (UI), and breaking-change callouts.
5. CI runs `check:rules` → typecheck → tests → build (no lint step).
   Triage target is a week; nudge the
   PR if it goes quiet.

### Breaking changes

Backend schema migrations require a backfill/migration function under
`convex/admin/` (e.g. `admin/pageBlocksBackfill:run`) and a callout in
the PR description. Frontend
prop renames need a deprecation note in the changelog.

## Reporting bugs

Use the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md).
Include:

- Lane (Convex cloud / self-hosted / public demo)
- Browser + OS
- Console errors / Convex logs (`bunx convex logs --tail`)
- A minimal repro if possible

## Feature requests

Check [`ROADMAP.md`](./ROADMAP.md) first — it lists what is planned and,
just as importantly, what is deliberately out of scope. Then use the
[feature request template](./.github/ISSUE_TEMPLATE/feature_request.md).
Describe the user need before the proposed implementation — we'd rather
discuss the "why" first.

## Security disclosures

See [`SECURITY.md`](./SECURITY.md) — don't open public issues for
vulnerabilities.

## Code of Conduct

Participation in this project is governed by the
[Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Report unacceptable
behaviour to the email in `SECURITY.md`.

## License

By contributing, you agree that your contributions will be licensed
under the project's [MIT License](./LICENSE).
