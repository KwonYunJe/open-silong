/** Public graph read API for the memory-graph slice + the graph MCP tools.
 *
 *  `getGlobalGraph` declares `args:{v.*}` validators and gates authz inside
 *  the handler (CLAUDE.md P0): it resolves the viewer's active workspace via
 *  `readActiveWorkspace`, which only returns a workspace the user is a
 *  verified member of (or their own personal one). Same pattern as
 *  `features/search/queries.ts`.
 *
 *  All index walks are bounded (no bare `.collect()`).
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  readActiveWorkspace,
  pagesInActiveWorkspace,
  databasesInActiveWorkspace,
} from "../../_shared/workspace";
import { buildGraphFromEdges, type Graph } from "../../_shared/graph";
import {
  pageMeta,
  collectOutgoing,
  augmentWithDatabases,
  GRAPH_PAGE_CAP,
} from "./lib";

const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

/** Whole-workspace force-graph model. Edges are fanned out per source
 *  page (no single by_workspace index over `pageLinks`), then reduced by
 *  `buildGraphFromEdges` (degree, hubs, ghost/tag materialization). */
export const getGlobalGraph = query({
  args: {
    includeTags: v.optional(v.boolean()),
    includeGhosts: v.optional(v.boolean()),
    includeOrphans: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Graph> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return EMPTY_GRAPH;
    const active = await readActiveWorkspace(ctx, userId);
    if (!active) return EMPTY_GRAPH;

    const pages = await pagesInActiveWorkspace(ctx, userId, active);
    const live = pages.filter((p) => !p.trashed);
    const edges = await collectOutgoing(ctx, live);

    const limit =
      args.limit && args.limit > 0
        ? Math.min(args.limit, GRAPH_PAGE_CAP)
        : undefined;

    const base = buildGraphFromEdges(edges, live.map(pageMeta), {
      includeTags: args.includeTags,
      includeGhosts: args.includeGhosts,
      includeOrphans: args.includeOrphans,
      limit,
    });

    // Layer the database structure on top at query time: database nodes,
    // db → row-page edges, and row → related-page relation edges. Reuses the
    // same by_workspace read (+ legacy by_user fallback) that pages use.
    const databases = await databasesInActiveWorkspace(ctx, userId, active);
    const pagesById = new Map<string, Doc<"pages">>(
      live.map((p) => [p._id, p]),
    );
    return augmentWithDatabases(
      base,
      databases.filter((d) => !d.trashed),
      pagesById,
    );
  },
});
