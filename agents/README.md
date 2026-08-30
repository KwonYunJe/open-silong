# `agents/` — framework guidance for coding agents

Deep-dive rules for the frameworks this repo uses (or is evaluating), written
for AI coding agents. These exist because a model's priors are not evenly
distributed: React and Next.js are massively over-represented in training
data, so the default answer for anything else is often a React answer wearing
different syntax.

`CLAUDE.md` stays the short, authoritative rule list and **wins on conflict**.
These files are the long form — the reasoning, the failure each rule prevents,
and the traps that are specific to this codebase.

| file | read it when |
|---|---|
| [`convex.md`](./convex.md) | touching anything under `convex/`, or wiring a client to it |
| [`svelte.md`](./svelte.md) | writing any Svelte — **and before advising on the migration** |

## Conventions for these files

- **Date every claim about the outside world**, with a source link. Package
  versions and library capabilities go stale; an undated assertion is a
  future bug.
- **Prefer the correction to the tutorial.** Nobody needs "what is a
  component". They need "the thing you are about to write is wrong here, and
  here is why".
- **Cite this repo's real numbers and file paths**, not invented examples.
- If a rule turns out to be wrong, fix it here and say so — a stale guidance
  file is worse than none, because it is read with authority.

## Related

- `CLAUDE.md` — the hard rules (SSOT)
- `scripts/check-rules.mjs` — the rules that are mechanically enforced.
  Per CLAUDE.md: *a rule that is not in that script is a rule that will rot.*
- `docs/audit/2026-08-30-svelte-migration-plan.md` — the audit and the
  migration assessment these files support
