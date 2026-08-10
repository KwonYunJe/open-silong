import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Prune rateLimits buckets older than 24 h. The fixed-window helper resets
 *  on first call of a new window, but rows for users who churned will sit
 *  forever — this keeps the table small without paging. */
crons.daily(
  "prune-rate-limits",
  { hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.pruneRateLimits,
);

/** Prune visitor-beacon rate-limit buckets older than 24 h (traffic feature). */
crons.daily(
  "prune-visitor-rate-limits",
  { hourUTC: 3, minuteUTC: 15 },
  internal.maintenance.pruneVisitorRateLimits,
);

/** Permanently deletes pages soft-deleted > 30 days ago. */
crons.daily(
  "purge-stale-trash",
  { hourUTC: 3, minuteUTC: 30 },
  internal.maintenance.purgeStaleTrash,
);

/** Drop aiTokenUsage rows older than 30 days. Ledger only needs to
 *  span the current quota window (1 day); 30d kept for diagnostics. */
crons.daily(
  "prune-ai-token-usage",
  { hourUTC: 4, minuteUTC: 0 },
  internal.maintenance.pruneAiTokenUsage,
);

/** Append-only tables with no prior sweep. Each prune is an indexed range
 *  scan bounded to PRUNE_BATCH rows that re-schedules itself while a full
 *  batch keeps coming back, so a large first-run backlog drains in minutes
 *  instead of one row-limit-busting transaction. Staggered so a backlog on
 *  one table does not collide with the next. */
crons.daily(
  "prune-webhook-deliveries",
  { hourUTC: 4, minuteUTC: 15 },
  internal.maintenance.pruneWebhookDeliveries,
);
crons.daily(
  "prune-audit-log",
  { hourUTC: 4, minuteUTC: 30 },
  internal.maintenance.pruneAuditLog,
);
crons.daily(
  "prune-visitor-pageviews",
  { hourUTC: 4, minuteUTC: 45 },
  internal.maintenance.pruneVisitorPageviews,
);
crons.daily(
  "prune-notifications",
  { hourUTC: 5, minuteUTC: 0 },
  internal.maintenance.pruneNotifications,
);
crons.daily(
  "prune-oauth-codes",
  { hourUTC: 5, minuteUTC: 15 },
  internal.maintenance.pruneOauthCodes,
);
crons.daily(
  "prune-ai-run-progress",
  { hourUTC: 5, minuteUTC: 30 },
  internal.maintenance.pruneAiRunProgress,
);

export default crons;
