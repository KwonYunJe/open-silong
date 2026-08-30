// @vitest-environment edge-runtime
//
// The MCP surface could trash a page but not restore it, permanently delete
// it, or list what was trashed. A half delete-lifecycle is worse than none:
// it invites the destructive call and withholds the repair. These tests pin
// the completed lifecycle, and the reparent cycle guard that `movePage` was
// missing while the REST surface had been dispatching it all along.
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";

test("trash -> restore round-trips", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Draft" });

  await t.mutation(internal.mcp.internal.trashPage, { userId, pageId });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(true);

  const res = await t.mutation(internal.mcp.internal.restorePage, { userId, pageId });
  expect(res).toMatchObject({ ok: true, title: "Draft" });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(false);
});

test("trash_list surfaces trashed pages, and only those", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const gone = await asUser.mutation(api.pages.create, { parentId: null, title: "Gone" });
  await asUser.mutation(api.pages.create, { parentId: null, title: "Kept" });

  await t.mutation(internal.mcp.internal.trashPage, { userId, pageId: gone });
  const items = await t.query(internal.mcp.internal.listTrash, { userId });

  expect(items.map((i) => i.title)).toContain("Gone");
  expect(items.map((i) => i.title)).not.toContain("Kept");
});

test("permanent delete REQUIRES the page to be trashed first", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Live" });

  await expect(
    t.mutation(internal.mcp.internal.permanentlyDeletePage, { userId, pageId }),
  ).rejects.toThrow(/must be trashed/);

  // Still there.
  expect(await t.run(async (ctx) => ctx.db.get(pageId))).not.toBeNull();
});

test("permanent delete cascades over the subtree", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const root = await asUser.mutation(api.pages.create, { parentId: null, title: "Root" });
  const child = await asUser.mutation(api.pages.create, { parentId: root, title: "Child" });
  const grand = await asUser.mutation(api.pages.create, { parentId: child, title: "Grandchild" });

  await t.mutation(internal.mcp.internal.trashPage, { userId, pageId: root });
  const res = await t.mutation(internal.mcp.internal.permanentlyDeletePage, { userId, pageId: root });

  expect(res.deletedCount).toBe(3);
  for (const id of [root, child, grand]) {
    expect(await t.run(async (ctx) => ctx.db.get(id))).toBeNull();
  }
});

test("a page cannot be moved under its own descendant", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const root = await asUser.mutation(api.pages.create, { parentId: null, title: "Root" });
  const child = await asUser.mutation(api.pages.create, { parentId: root, title: "Child" });

  await expect(
    t.mutation(internal.mcp.internal.movePage, { userId, pageId: root, parentId: child }),
  ).rejects.toThrow(/own descendant/);

  await expect(
    t.mutation(internal.mcp.internal.movePage, { userId, pageId: root, parentId: root }),
  ).rejects.toThrow(/own parent/);

  // The tree is untouched by the rejected moves.
  expect((await t.run(async (ctx) => ctx.db.get(root)))?.parentId).toBeNull();
});

test("a legitimate move and a move to top level both work", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const a = await asUser.mutation(api.pages.create, { parentId: null, title: "A" });
  const b = await asUser.mutation(api.pages.create, { parentId: null, title: "B" });

  await t.mutation(internal.mcp.internal.movePage, { userId, pageId: b, parentId: a });
  expect((await t.run(async (ctx) => ctx.db.get(b)))?.parentId).toBe(a);

  await t.mutation(internal.mcp.internal.movePage, { userId, pageId: b, parentId: null });
  expect((await t.run(async (ctx) => ctx.db.get(b)))?.parentId).toBeNull();
});

test("favorite toggles both ways", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Star me" });

  await t.mutation(internal.mcp.internal.setFavorite, { userId, pageId, favorite: true });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.favorite).toBe(true);

  await t.mutation(internal.mcp.internal.setFavorite, { userId, pageId, favorite: false });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.favorite).toBe(false);
});

test("every lifecycle mutation refuses another user's page", async () => {
  const t = testCtx();
  const { asUser } = await seedUser(t, { email: "owner@example.com" });
  const { userId: strangerId } = await seedUser(t, { email: "stranger@example.com" });
  const pageId = await asUser.mutation(api.pages.create, { parentId: null, title: "Private" });

  for (const call of [
    () => t.mutation(internal.mcp.internal.restorePage, { userId: strangerId, pageId }),
    () => t.mutation(internal.mcp.internal.permanentlyDeletePage, { userId: strangerId, pageId }),
    () => t.mutation(internal.mcp.internal.setFavorite, { userId: strangerId, pageId, favorite: true }),
    () => t.mutation(internal.mcp.internal.movePage, { userId: strangerId, pageId, parentId: null }),
  ]) {
    await expect(call()).rejects.toThrow(/Tidak ditemukan/);
  }
});
