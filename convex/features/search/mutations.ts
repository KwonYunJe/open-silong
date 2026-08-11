import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { buildSearchText } from "./lib";
import { readPageBlocks } from "../../_shared/pageContent";

/** Pages per transaction. Each page also costs a `pageBlocks` read
 *  (`readPageBlocks`) plus a patch, so this stays well under the Convex
 *  per-transaction read/write budget even for a user with thousands of
 *  pages. */
const BATCH = 100;

/** Explicit so tsc does not have to infer the handler's return type
 *  through `internal.features.search.mutations.backfillSearchText` — the
 *  self-reference the re-schedule needs, which otherwise trips TS7022
 *  (circular initializer). Same pattern as `convex/maintenance.ts`. */
type BackfillResult = {
  updated: number;
  total: number;
  isDone: boolean;
  cursor: string;
};

/** Backfill `searchText` on the pages owned by the given user.
 *  Internal — caller is a migration script, not a logged-in client.
 *  Idempotent — recomputes regardless of existing value.
 *
 *  Processes ONE batch per transaction and re-schedules itself with the
 *  continuation cursor until the paginator reports done. `pages.by_user`
 *  is unbounded per user, so the previous single-shot `.collect()` would
 *  bust the transaction limit on exactly the accounts that most need the
 *  backfill. Callers can still fire-and-forget with just `{ userId }`;
 *  `updated` / `total` describe THIS batch, `isDone: false` means the
 *  remainder is still landing asynchronously. */
export const backfillSearchText = internalMutation({
  args: { userId: v.id("users"), cursor: v.optional(v.string()) },
  handler: async (ctx, { userId, cursor }): Promise<BackfillResult> => {
    const res = await ctx.db
      .query("pages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate({ cursor: cursor ?? null, numItems: BATCH });
    let updated = 0;
    for (const p of res.page) {
      const blocks = await readPageBlocks(ctx, p);
      const next = buildSearchText(p.title, blocks);
      if (next !== p.searchText) {
        await ctx.db.patch(p._id, { searchText: next });
        updated++;
      }
    }
    if (!res.isDone) {
      await ctx.scheduler.runAfter(0, internal.features.search.mutations.backfillSearchText, {
        userId,
        cursor: res.continueCursor,
      });
    }
    return {
      updated,
      total: res.page.length,
      isDone: res.isDone,
      cursor: res.continueCursor,
    };
  },
});
