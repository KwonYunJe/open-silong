// @vitest-environment edge-runtime
//
// Comments, version history and workspace scope: the three surfaces an MCP
// agent could see the effects of but never touch. The one that actually bites
// is history — `pages_replace_blocks` destroys a page body, so these tests pin
// that the overwrite leaves a restore point behind and that restoring is
// itself undoable.
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";
import { readPageBlocks } from "../_shared/pageContent";
import type { Id } from "../_generated/dataModel";

const blocksOf = (t: ReturnType<typeof testCtx>, pageId: Id<"pages">) =>
  t.run(async (ctx) => readPageBlocks(ctx, (await ctx.db.get(pageId))!));

const bodyText = (b: unknown) => (b as { text?: string }).text ?? "";

// ── comments ──────────────────────────────────────────────────────────

test("a comment round-trips: create, list, resolve, reopen, delete", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Spec" });

  const { commentId } = await t.mutation(internal.mcp.internal.createComment, {
    userId, pageId, text: "Needs a risks section.",
  });

  let open = await t.query(internal.mcp.internal.listComments, { userId, pageId });
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({ text: "Needs a risks section.", resolved: false });
  // Authored as the token's owner, not as an anonymous robot.
  expect(open[0].authorName).toBe("Test User");

  await t.mutation(internal.mcp.internal.setCommentResolved, { userId, commentId, resolved: true });
  open = await t.query(internal.mcp.internal.listComments, { userId, pageId });
  expect(open).toHaveLength(0);

  const all = await t.query(internal.mcp.internal.listComments, {
    userId, pageId, includeResolved: true,
  });
  expect(all).toHaveLength(1);
  expect(all[0].resolved).toBe(true);

  // Reopen is the same tool with resolved:false.
  await t.mutation(internal.mcp.internal.setCommentResolved, { userId, commentId, resolved: false });
  expect(await t.query(internal.mcp.internal.listComments, { userId, pageId })).toHaveLength(1);

  await t.mutation(internal.mcp.internal.deleteComment, { userId, commentId });
  expect(await t.query(internal.mcp.internal.listComments, {
    userId, pageId, includeResolved: true,
  })).toHaveLength(0);
});

test("comments refuse an empty body and another user's page", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t, { email: "owner@example.com" });
  const { userId: strangerId } = await seedUser(t, { email: "stranger@example.com" });
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Private" });

  await expect(
    t.mutation(internal.mcp.internal.createComment, { userId, pageId, text: "   " }),
  ).rejects.toThrow(/text is required/);

  await expect(
    t.mutation(internal.mcp.internal.createComment, { userId: strangerId, pageId, text: "hi" }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.query(internal.mcp.internal.listComments, { userId: strangerId, pageId }),
  ).rejects.toThrow(/Tidak ditemukan/);
});

test("the page owner can moderate a comment they did not author", async () => {
  const t = testCtx();
  const { userId: ownerId, asUser } = await seedUser(t, { email: "owner@example.com" });
  const { userId: otherId } = await seedUser(t, { email: "other@example.com" });
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Open" });

  // Author row directly — the comment is someone else's, on the owner's page.
  const commentId = await t.run(async (ctx) =>
    ctx.db.insert("comments", {
      userId: otherId, pageId, text: "drive-by", authorName: "Other",
      authorIcon: "", resolved: false, createdAt: Date.now(), updatedAt: Date.now(),
    }),
  );

  await t.mutation(internal.mcp.internal.setCommentResolved, {
    userId: ownerId, commentId, resolved: true,
  });
  expect(await t.run(async (ctx) => ctx.db.get(commentId as Id<"comments">)))
    .toMatchObject({ resolved: true });
});

// ── version history ───────────────────────────────────────────────────

test("replacing blocks leaves a restore point, and restoring brings the body back", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Draft" });

  await t.mutation(internal.mcp.internal.updatePage, {
    userId, pageId, patch: { blocks: [{ id: "a", type: "text", text: "original" }] },
  });
  // A page that had no blocks yet must NOT burn a snapshot slot.
  expect(await t.query(internal.mcp.internal.listSnapshots, { userId, pageId })).toHaveLength(0);

  await t.mutation(internal.mcp.internal.updatePage, {
    userId, pageId, patch: { blocks: [{ id: "b", type: "text", text: "clobbered" }] },
  });
  expect((await blocksOf(t, pageId)).map(bodyText)).toEqual(["clobbered"]);

  const snaps = await t.query(internal.mcp.internal.listSnapshots, { userId, pageId });
  expect(snaps).toHaveLength(1);
  expect(snaps[0].blockCount).toBe(1);

  await t.mutation(internal.mcp.internal.restoreSnapshot, {
    userId, snapshotId: snaps[0].snapshotId,
  });
  expect((await blocksOf(t, pageId)).map(bodyText)).toEqual(["original"]);
});

test("a restore is itself undoable — the pre-restore state is captured", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "V" });

  await t.mutation(internal.mcp.internal.updatePage, {
    userId, pageId, patch: { blocks: [{ id: "a", type: "text", text: "v1" }] },
  });
  const { snapshotId } = await t.mutation(internal.mcp.internal.createSnapshot, {
    userId, pageId, label: "v1",
  });
  await t.mutation(internal.mcp.internal.updatePage, {
    userId, pageId, patch: { blocks: [{ id: "b", type: "text", text: "v2" }] },
  });

  await t.mutation(internal.mcp.internal.restoreSnapshot, { userId, snapshotId });
  expect((await blocksOf(t, pageId)).map(bodyText)).toEqual(["v1"]);

  // v2 is not lost: the restore checkpointed it on the way past.
  const snaps = await t.query(internal.mcp.internal.listSnapshots, { userId, pageId });
  const undo = snaps.find((s) => s.authorName === "before restore");
  expect(undo).toBeDefined();
  await t.mutation(internal.mcp.internal.restoreSnapshot, { userId, snapshotId: undo!.snapshotId });
  expect((await blocksOf(t, pageId)).map(bodyText)).toEqual(["v2"]);
});

test("snapshots of another user's page are invisible and unrestorable", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t, { email: "owner@example.com" });
  const { userId: strangerId } = await seedUser(t, { email: "stranger@example.com" });
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Mine" });
  const { snapshotId } = await t.mutation(internal.mcp.internal.createSnapshot, { userId, pageId });

  await expect(
    t.query(internal.mcp.internal.listSnapshots, { userId: strangerId, pageId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(internal.mcp.internal.restoreSnapshot, { userId: strangerId, snapshotId }),
  ).rejects.toThrow(/Tidak ditemukan/);
});

// ── workspaces ────────────────────────────────────────────────────────

test("workspaces_list names the workspace new content lands in", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  // Provisions the personal workspace + owner membership.
  await asUser.mutation(api.pages.create, { parentId: null, title: "Anything" });

  const items = await t.query(internal.mcp.internal.listWorkspaces, { userId });
  expect(items.length).toBeGreaterThan(0);
  expect(items.filter((w) => w.isActive)).toHaveLength(1);
  expect(items[0]).toMatchObject({ role: "owner", isPersonal: true });
});
