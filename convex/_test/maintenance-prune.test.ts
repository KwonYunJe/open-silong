// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";

const ONE_DAY_MS = 24 * 60 * 60_000;
// Must match PRUNE_BATCH in convex/maintenance.ts — the point of the
// >batch case is to prove a backlog does not silently stop at one pass.
const BATCH = 500;

/** aiRunProgress is the cheapest of the six prunes to seed (4 fields, no FK
 *  beyond userId), and it exercises the `by_updated` index that had to be
 *  added because the pre-existing `by_user_updated` is compound and cannot
 *  range-scan by age alone. The other five prunes are the same shape. */
async function seedRuns(
  t: ReturnType<typeof testCtx>,
  userId: string,
  ages: number[],
) {
  await t.run(async (ctx) => {
    for (const [i, ageMs] of ages.entries()) {
      await ctx.db.insert("aiRunProgress", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        userId: userId as any,
        runId: `run-${i}`,
        steps: [],
        updatedAt: Date.now() - ageMs,
      });
    }
  });
}

const countRuns = (t: ReturnType<typeof testCtx>) =>
  t.run(async (ctx) => (await ctx.db.query("aiRunProgress").collect()).length);

test("prune drops rows past the cutoff and keeps fresh ones", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);

  await seedRuns(t, userId, [
    3 * ONE_DAY_MS, // stale
    2 * ONE_DAY_MS, // stale
    60_000, // a minute old — a run in flight, must survive
    0, // just written
  ]);
  expect(await countRuns(t)).toBe(4);

  const res = await t.mutation(internal.maintenance.pruneAiRunProgress, {});
  expect(res).toEqual({ pruned: 2, more: false });
  expect(await countRuns(t)).toBe(2);
});

test("prune is a no-op when nothing is old enough", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);
  await seedRuns(t, userId, [0, 60_000]);

  const res = await t.mutation(internal.maintenance.pruneAiRunProgress, {});
  expect(res).toEqual({ pruned: 0, more: false });
  expect(await countRuns(t)).toBe(2);
});

test("a backlog larger than one batch reports more and drains on re-run", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);
  await seedRuns(t, userId, Array.from({ length: BATCH + 7 }, () => 3 * ONE_DAY_MS));

  // First pass fills the batch → must flag `more` AND queue itself again, so
  // the backlog drains now instead of 500 rows per daily cron tick.
  const first = await t.mutation(internal.maintenance.pruneAiRunProgress, {});
  expect(first).toEqual({ pruned: BATCH, more: true });
  expect(await countRuns(t)).toBe(7);

  // Assert the follow-up was actually enqueued. (Not driven via
  // finishAllScheduledFunctions: that needs vitest fake timers to advance a
  // runAfter(0), and freezing the clock is more machinery than this earns.)
  const queued = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(queued).toHaveLength(1);
  expect(queued[0].name).toContain("pruneAiRunProgress");

  // …and that the queued pass is what finishes the job.
  const second = await t.mutation(internal.maintenance.pruneAiRunProgress, {});
  expect(second).toEqual({ pruned: 7, more: false });
  expect(await countRuns(t)).toBe(0);
});
