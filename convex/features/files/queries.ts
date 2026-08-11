import { query } from "../../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../../_generated/dataModel";

/**
 * Signed download URL for an uploaded blob.
 *
 * Gated. `ctx.storage.getUrl` will happily mint a working URL for ANY storage
 * id, so an ungated wrapper is an IDOR: anyone holding — or replaying — a
 * storage id could pull another tenant's private upload, without even being
 * logged in. The caller must therefore be authenticated AND connected to the
 * blob: either the uploader, or a member of the workspace the upload was
 * stamped with.
 *
 * Returns `null` rather than throwing on every denial, including "no such
 * file", so the endpoint cannot be used to probe which storage ids exist.
 *
 * Note this is NOT the path public share pages use — those render images from
 * the URL stored on the block itself, so gating here does not affect /share
 * or /site.
 */
export const getUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const file = await ctx.db
      .query("files")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    // Untracked blob: no ownership record exists, so nothing can authorize it.
    if (!file) return null;

    if (file.userId !== userId) {
      // Shared uploads are reachable by workspace membership; legacy rows with
      // no workspaceId are owner-only.
      if (!file.workspaceId) return null;
      const member = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", userId).eq("workspaceId", file.workspaceId!),
        )
        .unique();
      if (!member) return null;
    }

    return await ctx.storage.getUrl(args.storageId as Id<"_storage">);
  },
});
