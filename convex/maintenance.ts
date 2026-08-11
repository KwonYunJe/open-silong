import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { FunctionReference } from "convex/server";

const ONE_DAY_MS = 24 * 60 * 60_000;
const TRASH_TTL_MS = 30 * ONE_DAY_MS;

/** Rows deleted per prune transaction. Convex caps a transaction's reads and
 *  writes, so an append-only table with a long backlog cannot be drained in
 *  one shot — the prunes below `.take(PRUNE_BATCH)` and re-schedule
 *  themselves while a full batch keeps coming back. */
const PRUNE_BATCH = 500;

type SelfRef = FunctionReference<"mutation", "internal", Record<string, never>>;

/** Annotated explicitly on every prune handler below. Without it each one
 *  infers through `internal.maintenance.<itself>` and tsc bails with TS7022
 *  (circular initializer) — which then cascades into implicit-any errors in
 *  unrelated files that read the generated api type. */
type PruneResult = { pruned: number; more: boolean };

/** Delete a fetched batch; if it came back full there is probably more, so
 *  queue another pass immediately instead of waiting a day per 500 rows. */
async function drain(
  ctx: MutationCtx,
  rows: { _id: Parameters<MutationCtx["db"]["delete"]>[0] }[],
  self: SelfRef,
) {
  for (const r of rows) await ctx.db.delete(r._id);
  const more = rows.length === PRUNE_BATCH;
  if (more) await ctx.scheduler.runAfter(0, self, {});
  return { pruned: rows.length, more };
}

/** Daily prune of expired rate-limit windows. Uses `by_window` index
 *  range scan — cron processes only rows older than 24h, no full scan.
 *  The range is still one row per (user, scope) that went quiet, so a
 *  backlog after a missed/failed cron drains via `drain()` rather than
 *  busting the transaction row limit forever. */
export const pruneRateLimits = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("rateLimits")
        .withIndex("by_window", (q) => q.lt("windowStart", Date.now() - ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneRateLimits,
    ),
});

/** Daily prune of expired visitor-beacon rate-limit windows
 *  (convex/features/traffic). Same rationale as pruneRateLimits: the
 *  fixed-window counter resets in place, but a row per distinct visitor IP
 *  would sit forever — this drops buckets whose window ended > 24 h ago via
 *  the `by_reset` range index. */
export const pruneVisitorRateLimits = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("visitorRateLimits")
        .withIndex("by_reset", (q) => q.lt("resetAt", Date.now() - ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneVisitorRateLimits,
    ),
});

/** Pages purged per pass. Much smaller than `PRUNE_BATCH` because each
 *  page drags a snapshot cascade behind it, and snapshot docs carry a full
 *  `blocks` array — the transaction's byte budget, not its row count, is
 *  the binding constraint here. */
const TRASH_PAGE_BATCH = 20;
/** Snapshot docs read+deleted per pass. When a pass hits this the page loop
 *  stops early; the untouched pages are still `trashed` + still inside the
 *  index range, so the next pass picks them up. */
const TRASH_SNAPSHOT_BUDGET = 200;
/** Snapshots fetched per chunk while cascading ONE page. Looped until the
 *  page has none left, so a page is only deleted after every one of its
 *  snapshots is gone — no orphans, whatever the per-page count. */
const SNAPSHOT_CHUNK = 100;

type PurgeResult = { pages: number; snaps: number; dbs: number; more: boolean };

/** Permanently delete pages + databases whose `trashed === true` and
 *  last `updatedAt` is older than 30 days. Mirrors `pages.permanently
 *  Delete` / `databases.permanentlyDeleteDatabase` (also drops
 *  associated snapshots). Trash is a soft-delete UX; this gives users
 *  30 days to restore before storage gets reclaimed.
 *
 *  Uses `by_trashed_updated` range index — only scans `(trashed=true,
 *  updatedAt < cutoff)` — and drains that range `TRASH_PAGE_BATCH` pages
 *  at a time, re-scheduling itself while work remains. A 30-day trash
 *  backlog is exactly the shape that would exceed a single transaction
 *  and then fail every night in silence. */
export const purgeStaleTrash = internalMutation({
  args: {},
  handler: async (ctx): Promise<PurgeResult> => {
    const cutoff = Date.now() - TRASH_TTL_MS;
    const staleTrashedPages = await ctx.db
      .query("pages")
      .withIndex("by_trashed_updated", (q) =>
        q.eq("trashed", true).lt("updatedAt", cutoff),
      )
      .take(TRASH_PAGE_BATCH);
    const staleTrashedDbs = await ctx.db
      .query("databases")
      .withIndex("by_trashed_updated", (q) =>
        q.eq("trashed", true).lt("updatedAt", cutoff),
      )
      .take(PRUNE_BATCH);
    let snaps = 0;
    let pages = 0;
    let budgetHit = false;
    for (const p of staleTrashedPages) {
      if (snaps >= TRASH_SNAPSHOT_BUDGET) {
        budgetHit = true;
        break;
      }
      // Snapshots first, page last — an interrupted pass leaves the page
      // trashed (and re-selected next pass) rather than orphaning its
      // snapshots behind a deleted parent.
      for (;;) {
        const ss = await ctx.db
          .query("snapshots")
          .withIndex("by_user_page", (q) => q.eq("userId", p.userId).eq("pageId", p._id))
          .take(SNAPSHOT_CHUNK);
        for (const s of ss) {
          await ctx.db.delete(s._id);
          snaps++;
        }
        if (ss.length < SNAPSHOT_CHUNK) break;
      }
      await ctx.db.delete(p._id);
      pages++;
    }
    for (const d of staleTrashedDbs) await ctx.db.delete(d._id);
    const more =
      budgetHit ||
      staleTrashedPages.length === TRASH_PAGE_BATCH ||
      staleTrashedDbs.length === PRUNE_BATCH;
    if (more) await ctx.scheduler.runAfter(0, internal.maintenance.purgeStaleTrash, {});
    return { pages, snaps, dbs: staleTrashedDbs.length, more };
  },
});

/** Webhook delivery log — append-only, one row per attempt. 30 days is
 *  enough to debug a failing endpoint. */
export const pruneWebhookDeliveries = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("webhookDeliveries")
        .withIndex("by_attempted", (q) => q.lt("attemptedAt", Date.now() - 30 * ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneWebhookDeliveries,
    ),
});

/** Admin audit trail. Longest retention of the set — it is the record of who
 *  changed what, so 180 days rather than 30. */
export const pruneAuditLog = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("auditLog")
        .withIndex("by_created", (q) => q.lt("createdAt", Date.now() - 180 * ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneAuditLog,
    ),
});

/** Anonymous marketing beacon rows. The admin traffic panel defaults to a
 *  30-day window; 90 days leaves room for quarter-over-quarter reads. */
export const pruneVisitorPageviews = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("visitorPageviews")
        .withIndex("by_at", (q) => q.lt("at", Date.now() - 90 * ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneVisitorPageviews,
    ),
});

/** Notifications older than 90 days, read or not — a 90-day-old unread
 *  mention is not something anyone is going back to. */
export const pruneNotifications = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("notifications")
        .withIndex("by_created", (q) => q.lt("createdAt", Date.now() - 90 * ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneNotifications,
    ),
});

/** OAuth authorization codes carry a 5-minute TTL and are single-use, but
 *  nothing ever swept the spent/expired rows. Cutoff is a full day past
 *  expiry so an in-flight exchange can never race the delete. */
export const pruneOauthCodes = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("oauthCodes")
        .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now() - ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneOauthCodes,
    ),
});

/** Per-run AI step logs. Transient UI state for a run in flight — anything
 *  older than a day is an orphan from a dropped connection. `schema.ts` and
 *  `ai/internal.ts` both already claimed this cron existed; now it does. */
export const pruneAiRunProgress = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> =>
    drain(
      ctx,
      await ctx.db
        .query("aiRunProgress")
        .withIndex("by_updated", (q) => q.lt("updatedAt", Date.now() - ONE_DAY_MS))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneAiRunProgress,
    ),
});

/** Drop aiTokenUsage rows older than 30 days. Bucket key = floor(ms /
 *  86_400_000) so the cutoff is dayKey-based. */
export const pruneAiTokenUsage = internalMutation({
  args: {},
  handler: async (ctx): Promise<PruneResult> => {
    const RETAIN_DAYS = 30;
    const cutoffDay = Math.floor((Date.now() - RETAIN_DAYS * ONE_DAY_MS) / ONE_DAY_MS);
    return drain(
      ctx,
      await ctx.db
        .query("aiTokenUsage")
        .withIndex("by_day", (q) => q.lt("dayKey", cutoffDay))
        .take(PRUNE_BATCH),
      internal.maintenance.pruneAiTokenUsage,
    );
  },
});
