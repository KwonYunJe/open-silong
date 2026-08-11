// @vitest-environment edge-runtime
//
// Authorization coverage for the DESTRUCTIVE / STATE-FLIPPING page endpoints in
// convex/pages.ts — the ones where a broken check destroys or publishes another
// user's data:
//
//   update · trash · restore · permanentlyDelete · setPublic · setShareIndexable
//   listMeta · getById
//
// Every endpoint is asserted from three vantage points:
//   (a) a principal that SHOULD be allowed (owner, or a workspace editor),
//   (b) a DIFFERENT authenticated user (stranger / viewer-role member),
//   (c) an UNAUTHENTICATED caller.
// Denials also assert the stored state is unchanged, so a handler that throws
// AFTER writing would still fail the test.
//
// Gate literals (convex/_shared/auth.ts + _shared/pageGrants.ts):
//   "Tidak ditemukan"  = NOT_FOUND — not a member / hidden, never leak existence
//   "Tidak berwenang"  = FORBIDDEN — can read, role too low to write
//   "Belum login"      = requireAuth, no identity
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { testCtx, seedUser } from "../testHarness.test";

type Ctx = ReturnType<typeof testCtx>;
type User = Awaited<ReturnType<typeof seedUser>>;

/** Owner mints an invite and `member` accepts it — the real membership path
 *  (convex/invites.ts).
 *
 *  The trailing `setActive` is deliberate. `invites.accept` tries to promote
 *  the joined workspace to active, but its promote step is a no-op for a user
 *  with no `userProfiles` row yet (see the skipped regression in
 *  authz-workspaces.test.ts), so the workspace-scoped READ feeds would still
 *  resolve the member's personal workspace. Calling setActive makes the
 *  fixture state unambiguous instead of depending on that bug. */
async function joinWorkspace(
  owner: User,
  workspaceId: Id<"workspaces">,
  member: User,
  role: "editor" | "viewer",
) {
  const { code } = await owner.asUser.mutation(api.invites.create, { workspaceId, role });
  await member.asUser.mutation(api.invites.accept, { code });
  await member.asUser.mutation(api.workspaces.setActive, { workspaceId });
}

/** Owner + a page inside a NON-personal (shareable) workspace.
 *
 *  The explicit `setActive` is load-bearing: `workspaces.create` only promotes
 *  the new workspace to active when a `userProfiles` row already exists, and a
 *  freshly-seeded user has none — without this the page would land in the
 *  owner's PERSONAL workspace and every membership assertion below would be
 *  testing the wrong workspace. */
async function seedSharedPage(t: Ctx, title = "Confidential") {
  const owner = await seedUser(t, { email: "owner@example.com" });
  const workspaceId = await owner.asUser.mutation(api.workspaces.create, { name: "Team" });
  await owner.asUser.mutation(api.workspaces.setActive, { workspaceId });
  const pageId = await owner.asUser.mutation(api.pages.create, { parentId: null, title });
  const page = await t.run(async (ctx) => ctx.db.get(pageId));
  expect(page?.workspaceId).toBe(workspaceId);
  return { owner, workspaceId, pageId };
}

// ---------------------------------------------------------------------------
// pages.update — content patch
// ---------------------------------------------------------------------------

test("update: owner patches; a stranger is hidden; unauthenticated rejects", async () => {
  const t = testCtx();
  const { owner, pageId } = await seedSharedPage(t, "Original");
  const stranger = await seedUser(t, { email: "stranger@example.com" });

  // (a) owner can.
  await owner.asUser.mutation(api.pages.update, { pageId, patch: { title: "Edited" } });
  expect((await owner.asUser.query(api.pages.getById, { id: pageId }))?.title).toBe("Edited");

  // (b) a different authenticated user cannot — NOT_FOUND, never leaks existence.
  await expect(
    stranger.asUser.mutation(api.pages.update, { pageId, patch: { title: "hijacked" } }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (c) anonymous cannot.
  await expect(
    t.mutation(api.pages.update, { pageId, patch: { title: "anon" } }),
  ).rejects.toThrow();

  // Neither denial wrote anything.
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.title).toBe("Edited");
});

// ---------------------------------------------------------------------------
// pages.trash — soft delete + descendant cascade
// ---------------------------------------------------------------------------

test("trash: owner can; stranger cannot; unauthenticated cannot; page stays live", async () => {
  const t = testCtx();
  const { owner, pageId } = await seedSharedPage(t);
  const stranger = await seedUser(t, { email: "stranger@example.com" });

  // (b) + (c) first, so the assertion "still not trashed" is meaningful.
  await expect(
    stranger.asUser.mutation(api.pages.trash, { pageId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(t.mutation(api.pages.trash, { pageId })).rejects.toThrow();
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(false);

  // (a) owner can.
  await owner.asUser.mutation(api.pages.trash, { pageId });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(true);
});

test("trash: a viewer-role workspace member is FORBIDDEN even though it can read", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t);
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  // Read access is real — this is not a "can't see it" case.
  expect(await viewer.asUser.query(api.pages.getById, { id: pageId })).not.toBeNull();

  await expect(
    viewer.asUser.mutation(api.pages.trash, { pageId }),
  ).rejects.toThrow(/Tidak berwenang/);
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(false);
});

test("trash: an editor-role workspace member IS allowed (positive control)", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  await editor.asUser.mutation(api.pages.trash, { pageId });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(true);
});

// ---------------------------------------------------------------------------
// pages.restore
// ---------------------------------------------------------------------------

test("restore: only a writable member of the page's workspace can un-trash it", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t);
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  await owner.asUser.mutation(api.pages.trash, { pageId });

  // (b) stranger + viewer-role member cannot resurrect it.
  await expect(
    stranger.asUser.mutation(api.pages.restore, { pageId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    viewer.asUser.mutation(api.pages.restore, { pageId }),
  ).rejects.toThrow(/Tidak berwenang/);
  // (c) anonymous cannot.
  await expect(t.mutation(api.pages.restore, { pageId })).rejects.toThrow();
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(true);

  // (a) owner can.
  await owner.asUser.mutation(api.pages.restore, { pageId });
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.trashed).toBe(false);
});

// ---------------------------------------------------------------------------
// pages.permanentlyDelete — irreversible
// ---------------------------------------------------------------------------

test("permanentlyDelete: stranger / viewer / anonymous cannot destroy the page", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t, "Irreplaceable");
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  await expect(
    stranger.asUser.mutation(api.pages.permanentlyDelete, { pageId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    viewer.asUser.mutation(api.pages.permanentlyDelete, { pageId }),
  ).rejects.toThrow(/Tidak berwenang/);
  await expect(t.mutation(api.pages.permanentlyDelete, { pageId })).rejects.toThrow();

  // Row + its blocks survive all three attempts.
  expect(await t.run(async (ctx) => ctx.db.get(pageId))).not.toBeNull();
  expect((await owner.asUser.query(api.pages.getById, { id: pageId }))?.title).toBe("Irreplaceable");

  // (a) owner can.
  await owner.asUser.mutation(api.pages.permanentlyDelete, { pageId });
  expect(await t.run(async (ctx) => ctx.db.get(pageId))).toBeNull();
});

// ---------------------------------------------------------------------------
// pages.setPublic — publishing someone else's private page is a data leak
// ---------------------------------------------------------------------------

test("setPublic: a stranger cannot publish another user's page", async () => {
  const t = testCtx();
  const { owner, pageId } = await seedSharedPage(t, "Private Notes");
  const stranger = await seedUser(t, { email: "stranger@example.com" });

  await expect(
    stranger.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.pages.setPublic, { pageId, isPublic: true }),
  ).rejects.toThrow();

  // Still private → the anonymous share endpoint must not resolve it.
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.isPublic).toBe(false);
  expect(await t.query(api.pages.getPublicShare, { id: pageId })).toBeNull();

  // (a) owner can, and then it does resolve anonymously.
  await owner.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });
  expect((await t.query(api.pages.getPublicShare, { id: pageId }))?._id).toBe(pageId);
});

test("setPublic: a viewer-role member cannot flip the public bit", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t);
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  await expect(
    viewer.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true }),
  ).rejects.toThrow(/Tidak berwenang/);
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.isPublic).toBe(false);
});

// ---------------------------------------------------------------------------
// pages.setShareIndexable — flipping this on a public page pushes it into the
// anonymous sitemap (listPublicForSitemap), i.e. search engines.
// ---------------------------------------------------------------------------

test("setShareIndexable: stranger / viewer / anonymous cannot expose the page to the sitemap", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t);
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  await owner.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });

  await expect(
    stranger.asUser.mutation(api.pages.setShareIndexable, { pageId, indexable: true }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    viewer.asUser.mutation(api.pages.setShareIndexable, { pageId, indexable: true }),
  ).rejects.toThrow(/Tidak berwenang/);
  await expect(
    t.mutation(api.pages.setShareIndexable, { pageId, indexable: true }),
  ).rejects.toThrow();

  // Not in the anonymous sitemap feed.
  expect((await t.query(api.pages.listPublicForSitemap, {})).map((r) => r.id)).not.toContain(pageId);

  // (a) owner can — and only then does it appear.
  await owner.asUser.mutation(api.pages.setShareIndexable, { pageId, indexable: true });
  expect((await t.query(api.pages.listPublicForSitemap, {})).map((r) => r.id)).toContain(pageId);
});

// ---------------------------------------------------------------------------
// pages.setShareSlug — anonymous cannot mint a share URL for a private page.
// (Cross-user denial for this endpoint lives in sharing.test.ts; this covers
// the unauthenticated vantage point, which that suite does not.)
// ---------------------------------------------------------------------------

test("setShareSlug: an unauthenticated caller cannot mint a share slug", async () => {
  const t = testCtx();
  const { pageId } = await seedSharedPage(t);

  await expect(
    t.mutation(api.pages.setShareSlug, { pageId, slug: "leaked-doc" }),
  ).rejects.toThrow();
  expect(await t.query(api.pages.getPublicShare, { id: "leaked-doc" })).toBeNull();
  expect((await t.run(async (ctx) => ctx.db.get(pageId)))?.shareSlug).toBeUndefined();
});

// ---------------------------------------------------------------------------
// pages.listMeta / getById — read-side scoping
// ---------------------------------------------------------------------------

test("listMeta: never surfaces a page from a workspace the viewer is not in", async () => {
  const t = testCtx();
  const { owner, workspaceId, pageId } = await seedSharedPage(t, "Team Secret");
  const stranger = await seedUser(t, { email: "stranger@example.com" });

  // (a) owner sees it.
  expect(
    (await owner.asUser.query(api.pages.listMeta, {})).some((m) => m._id === pageId),
  ).toBe(true);

  // (b) a different authed user's feed is scoped to THEIR active workspace.
  const strangerFeed = await stranger.asUser.query(api.pages.listMeta, {});
  expect(strangerFeed.some((m) => m._id === pageId)).toBe(false);
  // ...and getById is the same story.
  expect(await stranger.asUser.query(api.pages.getById, { id: pageId })).toBeNull();

  // (c) anonymous gets an empty feed, not a throw.
  expect(await t.query(api.pages.listMeta, {})).toEqual([]);

  // A viewer-role member DOES see it (positive control — the deny above is
  // about membership, not about the feed being broken).
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  await joinWorkspace(owner, workspaceId, viewer, "viewer");
  expect(
    (await viewer.asUser.query(api.pages.listMeta, {})).some((m) => m._id === pageId),
  ).toBe(true);
});

test("getById: a public page is still hidden from a non-member authed reader", async () => {
  const t = testCtx();
  const { owner, pageId } = await seedSharedPage(t, "Published");
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await owner.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });

  // Publishing exposes the redacted DTO via getPublicShare only. The full
  // editor DTO (userId / workspaceId / rowProps / wiki) must stay members-only.
  expect((await t.query(api.pages.getPublicShare, { id: pageId }))?._id).toBe(pageId);
  expect(await stranger.asUser.query(api.pages.getById, { id: pageId })).toBeNull();
  expect(await t.query(api.pages.getById, { id: pageId })).toBeNull();
});

// ---------------------------------------------------------------------------
// REGRESSION GUARD — this was a real hole, found by this suite and fixed in the
// same session. `pages.update` whitelists `parentId` but used to write it
// straight through: `requirePageWritable` authorizes the page being PATCHED,
// not the DESTINATION, so any authed user could reparent one of their own
// pages under a page in a workspace they are not a member of.
// convex/pages.ts now validates the target (exists, same workspace, writable
// by the caller) and guards against cycles.
// ---------------------------------------------------------------------------

test("update: reparenting under a foreign page is rejected", async () => {
  const t = testCtx();
  const { pageId: victimPageId } = await seedSharedPage(t, "Victim Root");
  const attacker = await seedUser(t, { email: "attacker@example.com" });
  const attackerPageId = await attacker.asUser.mutation(api.pages.create, {
    parentId: null,
    title: "Attacker Page",
  });

  await expect(
    attacker.asUser.mutation(api.pages.update, {
      pageId: attackerPageId,
      patch: { parentId: victimPageId },
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  expect((await t.run(async (ctx) => ctx.db.get(attackerPageId)))?.parentId).toBeNull();
});
