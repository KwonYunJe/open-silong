// @vitest-environment edge-runtime
//
// Authorization coverage for the workspace-membership surface —
// convex/workspaces.ts (members · setActive · setIcon · setTheme · remove ·
// leave · list) and convex/invites.ts (create · accept · revoke ·
// listForWorkspace), which together ARE the member add/remove/role-change
// story for this app (there is no standalone removeMember mutation).
//
// A break here is worse than a page-level break: workspace membership is what
// every page/database read gate resolves against, so one bad check hands over
// an entire workspace. Each endpoint is asserted from three vantage points:
//   (a) the principal that SHOULD be allowed (owner, or a role-appropriate
//       member),
//   (b) a DIFFERENT authenticated user — a stranger AND, where the handler
//       distinguishes them, a lower-role member,
//   (c) an UNAUTHENTICATED caller.
// Denials assert stored state is unchanged, so a handler that throws after
// writing still fails.
//
// Note the two deny SHAPES here: mutations throw ("Tidak ditemukan" = not a
// member; "Only owner can …" = member, role too low), while the roster/invite
// QUERIES return [] instead of throwing. The assertions track what each
// handler actually does — an empty array from `members` is the deny.
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { testCtx, seedUser } from "../testHarness.test";

type Ctx = ReturnType<typeof testCtx>;
type User = Awaited<ReturnType<typeof seedUser>>;

/** Owner of a fresh NON-personal workspace, with it made active.
 *  `setActive` is required because `workspaces.create` only promotes the new
 *  workspace when a `userProfiles` row already exists (see the skipped
 *  regression at the bottom of this file). */
async function seedOwnedWorkspace(t: Ctx, name = "Team") {
  const owner = await seedUser(t, { email: "owner@example.com" });
  const workspaceId = await owner.asUser.mutation(api.workspaces.create, { name });
  await owner.asUser.mutation(api.workspaces.setActive, { workspaceId });
  return { owner, workspaceId };
}

/** Real join path: owner mints an invite, member accepts it. */
async function joinWorkspace(
  owner: User,
  workspaceId: Id<"workspaces">,
  member: User,
  role: "editor" | "viewer",
) {
  const { code } = await owner.asUser.mutation(api.invites.create, { workspaceId, role });
  await member.asUser.mutation(api.invites.accept, { code });
}

const memberRow = (t: Ctx, workspaceId: Id<"workspaces">, userId: Id<"users">) =>
  t.run(async (ctx) =>
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", userId).eq("workspaceId", workspaceId),
      )
      .unique(),
  );

// ---------------------------------------------------------------------------
// workspaces.members — the roster, and the email column inside it
// ---------------------------------------------------------------------------

test("members: owner sees emails, a non-owner member does not, outsiders see nothing", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com", name: "Ed" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  // (a) owner sees the full roster WITH emails.
  const asOwner = await owner.asUser.query(api.workspaces.members, { workspaceId });
  expect(asOwner).toHaveLength(2);
  expect(asOwner.map((m) => m.email).sort()).toEqual([
    "editor@example.com",
    "owner@example.com",
  ]);

  // (b1) a non-owner MEMBER sees names but every email is redacted to null.
  const asEditor = await editor.asUser.query(api.workspaces.members, { workspaceId });
  expect(asEditor).toHaveLength(2);
  expect(asEditor.every((m) => m.email === null)).toBe(true);
  expect(asEditor.some((m) => m.name === "Ed")).toBe(true);

  // (b2) a different authenticated user who is not a member gets nothing —
  // not even the member count.
  expect(await stranger.asUser.query(api.workspaces.members, { workspaceId })).toEqual([]);

  // (c) unauthenticated gets nothing.
  expect(await t.query(api.workspaces.members, { workspaceId })).toEqual([]);
});

// ---------------------------------------------------------------------------
// workspaces.setActive — switching into a workspace you don't belong to would
// hand the caller that workspace's whole page/database feed.
// ---------------------------------------------------------------------------

test("setActive: a member can switch in; a stranger cannot; unauthenticated cannot", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  // (a) a real member can switch, and getActive reflects it with their role.
  await editor.asUser.mutation(api.workspaces.setActive, { workspaceId });
  const active = await editor.asUser.query(api.workspaces.getActive, {});
  expect(active?._id).toBe(workspaceId);
  expect(active?.role).toBe("editor");

  // (b) a non-member is refused outright.
  await expect(
    stranger.asUser.mutation(api.workspaces.setActive, { workspaceId }),
  ).rejects.toThrow(/Not a member/);

  // (c) unauthenticated is refused.
  await expect(t.mutation(api.workspaces.setActive, { workspaceId })).rejects.toThrow();

  // The stranger's own active workspace was NOT repointed by the failed call.
  const strangerActive = await stranger.asUser.query(api.workspaces.getActive, {});
  expect(strangerActive?._id).not.toBe(workspaceId);
});

// ---------------------------------------------------------------------------
// workspaces.setIcon / setTheme — role gradation inside the membership
// ---------------------------------------------------------------------------

test("setIcon: owner-only — an editor member and a stranger are both refused", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  await expect(
    editor.asUser.mutation(api.workspaces.setIcon, { workspaceId, emoji: "💀" }),
  ).rejects.toThrow(/Only owner can set icon/);
  await expect(
    stranger.asUser.mutation(api.workspaces.setIcon, { workspaceId, emoji: "💀" }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.workspaces.setIcon, { workspaceId, emoji: "💀" }),
  ).rejects.toThrow();

  expect((await t.run(async (ctx) => ctx.db.get(workspaceId)))?.emoji).not.toBe("💀");

  // (a) owner can.
  await owner.asUser.mutation(api.workspaces.setIcon, { workspaceId, emoji: "🚀" });
  expect((await t.run(async (ctx) => ctx.db.get(workspaceId)))?.emoji).toBe("🚀");
});

test("setTheme: editor allowed, viewer refused, stranger hidden", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const viewer = await seedUser(t, { email: "viewer@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");
  await joinWorkspace(owner, workspaceId, viewer, "viewer");

  // (a) editor is explicitly allowed by this handler.
  await editor.asUser.mutation(api.workspaces.setTheme, {
    workspaceId,
    themePresetId: "midnight",
  });
  expect((await t.run(async (ctx) => ctx.db.get(workspaceId)))?.themePresetId).toBe("midnight");

  // (b) viewer role is not, and a non-member is not even acknowledged.
  await expect(
    viewer.asUser.mutation(api.workspaces.setTheme, { workspaceId, themePresetId: "hijack" }),
  ).rejects.toThrow(/owner or editor/);
  await expect(
    stranger.asUser.mutation(api.workspaces.setTheme, { workspaceId, themePresetId: "hijack" }),
  ).rejects.toThrow(/Tidak ditemukan/);
  // (c) unauthenticated.
  await expect(
    t.mutation(api.workspaces.setTheme, { workspaceId, themePresetId: "hijack" }),
  ).rejects.toThrow();

  expect((await t.run(async (ctx) => ctx.db.get(workspaceId)))?.themePresetId).toBe("midnight");
});

// ---------------------------------------------------------------------------
// workspaces.remove — deleting a workspace strands every page inside it
// ---------------------------------------------------------------------------

test("remove: owner-only, and the personal workspace can never be deleted", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t, "Deletable");
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  // (b) member-but-not-owner, and total outsider.
  await expect(
    editor.asUser.mutation(api.workspaces.remove, { workspaceId }),
  ).rejects.toThrow(/Only owner can delete/);
  await expect(
    stranger.asUser.mutation(api.workspaces.remove, { workspaceId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  // (c) unauthenticated.
  await expect(t.mutation(api.workspaces.remove, { workspaceId })).rejects.toThrow();
  expect(await t.run(async (ctx) => ctx.db.get(workspaceId))).not.toBeNull();

  // The owner's PERSONAL workspace is protected even from the owner.
  const personalId = (await owner.asUser.query(api.workspaces.list, {})).find(
    (w) => w.isPersonal,
  )!._id;
  await expect(
    owner.asUser.mutation(api.workspaces.remove, { workspaceId: personalId }),
  ).rejects.toThrow(/Personal workspace cannot be deleted/);
  expect(await t.run(async (ctx) => ctx.db.get(personalId))).not.toBeNull();

  // (a) owner deletes the non-personal one; membership rows cascade away.
  await owner.asUser.mutation(api.workspaces.remove, { workspaceId });
  expect(await t.run(async (ctx) => ctx.db.get(workspaceId))).toBeNull();
  expect(await memberRow(t, workspaceId, editor.userId)).toBeNull();
  expect(await memberRow(t, workspaceId, owner.userId)).toBeNull();
});

// ---------------------------------------------------------------------------
// workspaces.leave — self-removal; must not be usable against someone else
// ---------------------------------------------------------------------------

test("leave: a member drops only their own membership; owner and outsiders cannot", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  // (b) a non-member calling leave gets the not-found gate, and no other
  // member's row is touched.
  await expect(
    stranger.asUser.mutation(api.workspaces.leave, { workspaceId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  // (c) unauthenticated.
  await expect(t.mutation(api.workspaces.leave, { workspaceId })).rejects.toThrow();
  expect(await memberRow(t, workspaceId, editor.userId)).not.toBeNull();

  // The owner cannot leave — that would orphan the workspace.
  await expect(
    owner.asUser.mutation(api.workspaces.leave, { workspaceId }),
  ).rejects.toThrow(/Owner cannot leave/);
  expect(await memberRow(t, workspaceId, owner.userId)).not.toBeNull();

  // (a) the editor can leave, and loses access immediately.
  await editor.asUser.mutation(api.workspaces.leave, { workspaceId });
  expect(await memberRow(t, workspaceId, editor.userId)).toBeNull();
  expect(await editor.asUser.query(api.workspaces.members, { workspaceId })).toEqual([]);
  await expect(
    editor.asUser.mutation(api.workspaces.setActive, { workspaceId }),
  ).rejects.toThrow(/Not a member/);
});

// ---------------------------------------------------------------------------
// workspaces.list — the switcher feed must be membership-scoped
// ---------------------------------------------------------------------------

test("list: only workspaces the viewer is a member of; anonymous gets nothing", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t, "Owner Only");
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  // Force the stranger to have a workspace of their own so the feed isn't
  // trivially empty.
  await stranger.asUser.mutation(api.workspaces.ensureBootstrapped, {});

  expect((await owner.asUser.query(api.workspaces.list, {})).map((w) => w._id)).toContain(
    workspaceId,
  );
  const strangerFeed = await stranger.asUser.query(api.workspaces.list, {});
  expect(strangerFeed.length).toBeGreaterThan(0);
  expect(strangerFeed.map((w) => w._id)).not.toContain(workspaceId);

  expect(await t.query(api.workspaces.list, {})).toEqual([]);
});

// ---------------------------------------------------------------------------
// invites.create — minting an invite IS the member-add primitive
// ---------------------------------------------------------------------------

test("invites.create: owner-only — editor member, stranger and anonymous refused", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");

  // (b) a member without owner role cannot escalate by inviting accomplices.
  await expect(
    editor.asUser.mutation(api.invites.create, { workspaceId, role: "editor" }),
  ).rejects.toThrow(/Only owner can invite/);
  await expect(
    stranger.asUser.mutation(api.invites.create, { workspaceId, role: "editor" }),
  ).rejects.toThrow(/Tidak ditemukan/);
  // (c) unauthenticated.
  await expect(
    t.mutation(api.invites.create, { workspaceId, role: "editor" }),
  ).rejects.toThrow();

  // Only the owner's own invite exists.
  const invites = await owner.asUser.query(api.invites.listForWorkspace, { workspaceId });
  expect(invites.filter((i) => !i.acceptedAt)).toHaveLength(0);
  expect(invites).toHaveLength(1); // the accepted one that made `editor` a member
});

// ---------------------------------------------------------------------------
// invites.listForWorkspace — the raw invite CODE lives in this payload, so a
// leak here is a self-serve membership grant for anyone who reads it.
// ---------------------------------------------------------------------------

test("invites.listForWorkspace: only the owner sees invite codes", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");
  await owner.asUser.mutation(api.invites.create, { workspaceId, role: "viewer" });

  // (a) owner sees the pending invite and its code.
  const asOwner = await owner.asUser.query(api.invites.listForWorkspace, { workspaceId });
  expect(asOwner.some((i) => !i.acceptedAt && typeof i.code === "string")).toBe(true);

  // (b) a non-owner member sees nothing, (c) neither does anonymous.
  expect(await editor.asUser.query(api.invites.listForWorkspace, { workspaceId })).toEqual([]);
  expect(await stranger.asUser.query(api.invites.listForWorkspace, { workspaceId })).toEqual([]);
  expect(await t.query(api.invites.listForWorkspace, { workspaceId })).toEqual([]);
});

// ---------------------------------------------------------------------------
// invites.revoke
// ---------------------------------------------------------------------------

test("invites.revoke: owner-only; a member cannot revoke and the invite survives", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const editor = await seedUser(t, { email: "editor@example.com" });
  const stranger = await seedUser(t, { email: "stranger@example.com" });
  await joinWorkspace(owner, workspaceId, editor, "editor");
  const { id: inviteId } = await owner.asUser.mutation(api.invites.create, {
    workspaceId,
    role: "viewer",
  });

  await expect(
    editor.asUser.mutation(api.invites.revoke, { inviteId }),
  ).rejects.toThrow(/Only owner can revoke/);
  await expect(
    stranger.asUser.mutation(api.invites.revoke, { inviteId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(t.mutation(api.invites.revoke, { inviteId })).rejects.toThrow();
  expect(await t.run(async (ctx) => ctx.db.get(inviteId))).not.toBeNull();

  // (a) owner can, and the code stops working afterwards.
  await owner.asUser.mutation(api.invites.revoke, { inviteId });
  expect(await t.run(async (ctx) => ctx.db.get(inviteId))).toBeNull();
});

// ---------------------------------------------------------------------------
// invites.accept — the only self-service path INTO a workspace
// ---------------------------------------------------------------------------

test("invites.accept: single-use, auth-required, and a revoked code grants nothing", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const first = await seedUser(t, { email: "first@example.com" });
  const second = await seedUser(t, { email: "second@example.com" });

  const { code } = await owner.asUser.mutation(api.invites.create, {
    workspaceId,
    role: "viewer",
  });

  // (c) an unauthenticated caller cannot redeem a leaked code.
  await expect(t.mutation(api.invites.accept, { code })).rejects.toThrow();

  // (a) the intended recipient joins with exactly the invited role.
  await first.asUser.mutation(api.invites.accept, { code });
  expect((await memberRow(t, workspaceId, first.userId))?.role).toBe("viewer");

  // (b) the code is single-use — a second user cannot ride the same link in.
  await expect(
    second.asUser.mutation(api.invites.accept, { code }),
  ).rejects.toThrow(/already used/);
  expect(await memberRow(t, workspaceId, second.userId)).toBeNull();

  // A revoked (deleted) invite is not redeemable either.
  const { id: freshId, code: freshCode } = await owner.asUser.mutation(api.invites.create, {
    workspaceId,
    role: "editor",
  });
  await owner.asUser.mutation(api.invites.revoke, { inviteId: freshId });
  await expect(
    second.asUser.mutation(api.invites.accept, { code: freshCode }),
  ).rejects.toThrow(/not found/i);
  expect(await memberRow(t, workspaceId, second.userId)).toBeNull();
});

// ---------------------------------------------------------------------------
// KNOWN GAP — correctness, not authz. See this agent's `findings`.
//
// `invites.accept` and `workspaces.create` both end with
//   `if (profile) await ctx.db.patch(profile._id, { activeWorkspaceId })`
// but `ensurePersonalWorkspace` (the "bootstrap profile" step accept relies
// on) never inserts a `userProfiles` row. So for any user who has not yet hit
// a code path that creates a profile, the promote-to-active step silently
// no-ops and they stay in their personal workspace after joining. Un-skip once
// the profile row is created before the patch.
// ---------------------------------------------------------------------------

test.skip("invites.accept switches a first-time user's active workspace", async () => {
  const t = testCtx();
  const { owner, workspaceId } = await seedOwnedWorkspace(t);
  const joiner = await seedUser(t, { email: "joiner@example.com" });

  const { code } = await owner.asUser.mutation(api.invites.create, {
    workspaceId,
    role: "editor",
  });
  await joiner.asUser.mutation(api.invites.accept, { code });

  expect((await joiner.asUser.query(api.workspaces.getActive, {}))?._id).toBe(workspaceId);
});
