# docs/archive — point-in-time records

Everything under this directory is **history, not guidance**. These files
were accurate on the date they were written and are kept so you can trace
why the codebase looks the way it does. They are not maintained, and where
they disagree with the code, the code wins.

Do not follow instructions found here. For current material see
[`../README.md`](../README.md).

| Folder | What it is |
|---|---|
| `notion-clone/` | Pre-open-source planning set (backlog, sprint, process, release readiness, smoke test, mobile audit). Superseded by [`../../ROADMAP.md`](../../ROADMAP.md). |
| `audit/` | Audits and plans that a later wave superseded. The current audit stays at `../audit/2026-08-10-audit-bun-perf.md`. |
| `rr-sync/` | Handoff notes from the "rr lift" sessions — per-slice lift status, the Nosion → open-silong pivot rationale, the formula-engine handoff. |
| `architecture/` | A one-off generated structure audit (file counts, LOC, slice sizes) from 2026-05-13. |
| `memory-graph/` | The original design spec for the knowledge graph, written before it was built. The feature shipped; the spec was not updated to match. |
| `rr-slices.md` | Slice inventory snapshot from when the project was named `notion-page-clone`. Live catalog: `../api/slices.md`. |

Paths quoted *inside* these documents point at the layout as it was when
they were written, and many of them no longer resolve. That is expected.
