/** Query-support helpers for the memory-graph feature.
 *
 *  The pure graph algorithms (`buildGraphFromEdges`, `buildAdjacency`,
 *  `bfs`) live in `convex/_shared/graph.ts` (foundation) and the edge
 *  extractor/reindexer in `convex/_shared/links.ts`. This module only
 *  holds the DB-touching helpers the graph queries share: page → node
 *  projection, the by_source edge fan-out, and same-workspace page reads.
 *
 *  Every index walk is bounded (CLAUDE.md P0: no bare `.collect()`).
 *  Where a matching cap already exists in `_shared/limits.ts` we reuse it;
 *  the graph-specific caps below are runaway guards, not product limits.
 */

import type { QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { COUNT_CAPS } from "../../_shared/limits";
import type {
  GraphPageMeta,
  Graph,
  GraphNode,
  GraphEdge,
  EdgeKind,
} from "../../_shared/graph";

/** Outgoing edges fetched per source page (`pageLinks.by_source`). A page
 *  with more links than this is pathological; the cap guards the handler. */
export const LINKS_PER_PAGE_CAP = 1_000;
/** Page-node budget for a workspace graph — reuse the dashboard scan cap so
 *  the graph never walks more page rows than the rest of the app already
 *  does per read. */
export const GRAPH_PAGE_CAP = COUNT_CAPS.pagesPerWorkspaceScan;

/** Project a page doc to the minimal shape `buildGraphFromEdges` needs.
 *  `wiki` (verified marker) flags the node as a hub. */
export function pageMeta(p: Doc<"pages">): GraphPageMeta {
  return {
    _id: p._id,
    title: p.title || "Untitled",
    icon: p.icon,
    wiki: p.wiki,
    parentId: p.parentId ?? null,
  };
}

/** Fetch every outgoing `pageLinks` row for a set of source pages (bounded
 *  per source). Used to assemble a whole-workspace edge set: there is no
 *  single by_workspace index over `pageLinks`, so we fan out by_source. */
export async function collectOutgoing(
  ctx: QueryCtx,
  pages: Doc<"pages">[],
): Promise<Doc<"pageLinks">[]> {
  // Parallel fan-out: one indexed read per source page, awaited together
  // instead of serially (was up to GRAPH_PAGE_CAP sequential round-trips).
  const perPage = await Promise.all(
    pages.map((p) =>
      ctx.db
        .query("pageLinks")
        .withIndex("by_source", (q) => q.eq("sourcePageId", p._id))
        .take(LINKS_PER_PAGE_CAP),
    ),
  );
  return perPage.flat();
}

/** Databases fanned into the graph (`getGlobalGraph`). Runaway guards, not
 *  product limits — a database or workspace larger than these still renders,
 *  just truncated at the graph layer. */
export const DB_CAP = 40;
/** Row pages materialized per database (its `rowIds`). */
export const DB_ROWS_CAP = 60;
/** Total `relation`-property edges added across all databases. */
export const DB_REL_CAP = 400;

/** Query-time augmentation: layer the database structure onto a base graph
 *  already built from `pageLinks`. Pure — the caller fetches the workspace's
 *  databases + a `pageId → page` lookup so this stays deterministic:
 *
 *   - one `database` node per (non-trashed) database,
 *   - a `db-row` edge database → each resolved (non-trashed, known) row page,
 *   - a `relation` edge row-page → related-page for every id in a
 *     relation-typed property's value (`rowProps[relProp.id]: string[]`).
 *
 *  Nodes/edges are copied (base is not mutated), deduped by an unordered
 *  `${a}|${b}|${kind}` key, and every loop is bounded. Degree is recomputed
 *  from the final edge set. Silent truncation on a cap hit is intentional. */
export function augmentWithDatabases(
  base: Graph,
  databases: Doc<"databases">[],
  pagesById: Map<string, Doc<"pages">>,
): Graph {
  const nodes = new Map<string, GraphNode>();
  for (const n of base.nodes) nodes.set(n.id, { ...n });
  const edges: GraphEdge[] = base.edges.map((e) => ({ ...e }));

  const edgeKey = (a: string, b: string, kind: string) =>
    a < b ? `${a}|${b}|${kind}` : `${b}|${a}|${kind}`;
  const seenEdge = new Set<string>();
  for (const e of edges) seenEdge.add(edgeKey(e.source, e.target, e.kind));

  const ensurePageNode = (p: Doc<"pages">) => {
    if (nodes.has(p._id)) return;
    nodes.set(p._id, {
      id: p._id,
      title: p.title || "Untitled",
      icon: p.icon,
      kind: "page",
      degree: 0,
    });
  };
  /** Add a deduped edge; returns true only when a new edge was pushed. */
  const addEdge = (source: string, target: string, kind: EdgeKind): boolean => {
    const key = edgeKey(source, target, kind);
    if (seenEdge.has(key)) return false;
    seenEdge.add(key);
    edges.push({ source, target, kind, resolved: true });
    return true;
  };

  let dbCount = 0;
  let relEdgeCount = 0;

  for (const db of databases) {
    if (db.trashed) continue;
    if (dbCount >= DB_CAP) break;
    dbCount++;

    if (!nodes.has(db._id)) {
      nodes.set(db._id, {
        id: db._id,
        title: db.name || "Database",
        icon: db.icon,
        kind: "database",
        degree: 0,
      });
    }

    const relProps = (db.properties ?? []).filter(
      (p: any) => p?.type === "relation",
    );

    const rowIds = (db.rowIds ?? []).slice(0, DB_ROWS_CAP);
    for (const rowId of rowIds) {
      const rowPage = pagesById.get(rowId as string);
      if (!rowPage || rowPage.trashed) continue;
      ensurePageNode(rowPage);
      addEdge(db._id, rowPage._id, "db-row");

      const rp = (rowPage.rowProps ?? {}) as Record<string, unknown>;
      for (const relProp of relProps) {
        if (relEdgeCount >= DB_REL_CAP) break;
        const targets = Array.isArray(rp[relProp.id])
          ? (rp[relProp.id] as string[])
          : [];
        for (const targetId of targets) {
          if (relEdgeCount >= DB_REL_CAP) break;
          const targetPage = pagesById.get(targetId);
          if (!targetPage) continue;
          ensurePageNode(targetPage);
          if (addEdge(rowPage._id, targetId, "relation")) relEdgeCount++;
        }
      }
    }
  }

  // Recompute degree from the final edge set (base degrees are stale once
  // db-row / relation edges are added). Missing endpoints are guarded.
  for (const n of nodes.values()) n.degree = 0;
  for (const e of edges) {
    const s = nodes.get(e.source);
    if (s) s.degree++;
    const t = nodes.get(e.target);
    if (t) t.degree++;
  }

  return { nodes: [...nodes.values()], edges };
}
