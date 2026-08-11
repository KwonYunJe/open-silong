// @vitest-environment edge-runtime
//
// Authz matrix for the CONTENT surface: comments, files (blob storage),
// snapshots (page version history), and search.
//
// Every endpoint is asserted three ways:
//   (a) the owner CAN do it,
//   (b) a different AUTHENTICATED user CANNOT,
//   (c) an ANONYMOUS caller CANNOT.
// (b) and (c) are the point. Where a handler fails *silently* (comments
// .remove returns undefined for an unauthorized actor rather than
// throwing) the test asserts the victim's data survived instead of
// asserting a rejection — the observable guarantee is what matters.
//
// Gate error literals: "Tidak ditemukan" / "Belum login" (from
// convex/_shared/auth.ts), "Not found" / "Not authenticated" /
// "Not authorized" (the older per-feature gates in features/*).
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";

async function twoTenants(t: ReturnType<typeof testCtx>) {
  const alice = await seedUser(t, { email: "alice@example.com", name: "Alice" });
  const mallory = await seedUser(t, { email: "mallory@example.com", name: "Mallory" });
  return { alice, mallory };
}

const COMMENT = { authorName: "Alice", authorIcon: "🙂" };

// ===========================================================================
// COMMENTS
// ===========================================================================

// ---------------------------------------------------------------------------
// (1) comments.create — writing a comment onto a page requires owning it.
//     A broken gate lets anyone graffiti (and, via listForPage on a public
//     page, publish) content under another tenant's page.
// ---------------------------------------------------------------------------
test("comments.create: owner can; stranger and anon cannot", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "Doc" });

  // (a)
  const id = await alice.asUser.mutation(api.features.comments.mutations.create, {
    pageId, text: "mine", ...COMMENT,
  });
  expect(id).toBeTruthy();

  // (b)
  await expect(
    mallory.asUser.mutation(api.features.comments.mutations.create, {
      pageId, text: "injected", ...COMMENT,
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (c)
  await expect(
    t.mutation(api.features.comments.mutations.create, {
      pageId, text: "injected", ...COMMENT,
    }),
  ).rejects.toThrow(/Belum login/);

  const rows = await alice.asUser.query(api.features.comments.queries.listForPage, { pageId });
  expect(rows.length).toBe(1);
  expect(rows.map((r) => r.text)).toEqual(["mine"]);
});

// ---------------------------------------------------------------------------
// (2) comments.listForPage / listForBlock — the READ leak. A private page's
//     discussion must be invisible to a non-owner and to anonymous callers.
// ---------------------------------------------------------------------------
test("comments.listForPage: private page's comments are invisible to stranger and anon", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "Doc" });
  const blockId = "blk_secret";
  await alice.asUser.mutation(api.features.comments.mutations.create, {
    pageId, blockId, text: "confidential thread", ...COMMENT,
  });

  // (a) Owner sees it, on both the page- and block-scoped readers.
  expect((await alice.asUser.query(api.features.comments.queries.listForPage, { pageId })).length).toBe(1);
  expect(
    (await alice.asUser.query(api.features.comments.queries.listForBlock, { pageId, blockId })).length,
  ).toBe(1);

  // (b) A different authed user sees nothing — fail-closed empty, no error
  //     (existence of the page is not leaked either way).
  expect(await mallory.asUser.query(api.features.comments.queries.listForPage, { pageId })).toEqual([]);
  expect(await mallory.asUser.query(api.features.comments.queries.listForBlock, { pageId, blockId })).toEqual([]);

  // (c) Anonymous sees nothing.
  expect(await t.query(api.features.comments.queries.listForPage, { pageId })).toEqual([]);
  expect(await t.query(api.features.comments.queries.listForBlock, { pageId, blockId })).toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) comments on a PUBLIC page are readable, but only as a sanitized DTO —
//     `userId` must never reach a non-owner. This is the intended behaviour
//     of `publicDto` in features/comments/queries.ts; the assertion pins it
//     so a future refactor cannot quietly start returning raw rows.
// ---------------------------------------------------------------------------
test("comments on a public page leak no userId to strangers or anon", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "Public Doc" });
  await alice.asUser.mutation(api.features.comments.mutations.create, {
    pageId, text: "hello world", ...COMMENT,
  });
  await alice.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });

  const asStranger = await mallory.asUser.query(api.features.comments.queries.listForPage, { pageId });
  expect(asStranger.length).toBe(1);
  expect(asStranger[0].text).toBe("hello world");
  expect((asStranger[0] as Record<string, unknown>).userId).toBeUndefined();

  // (c) Anonymous gets NOTHING even on a public page — `loadPageScope`
  // bails on `!getAuthUserId` before it ever looks at `isPublic`. Stricter
  // than the DTO path above, and the safe direction; pinned so a future
  // "let logged-out share viewers see comments" change is a deliberate,
  // test-visible decision rather than an accident.
  expect(await t.query(api.features.comments.queries.listForPage, { pageId })).toEqual([]);

  // The owner still gets the full row (moderation UI needs actorId).
  const asOwner = await alice.asUser.query(api.features.comments.queries.listForPage, { pageId });
  expect((asOwner[0] as Record<string, unknown>).userId).toBeTruthy();
});

// ---------------------------------------------------------------------------
// (4) comments.update — editing someone else's comment. Even on a PUBLIC
//     page (where the stranger can READ the comment and therefore knows its
//     id) the edit must be refused.
// ---------------------------------------------------------------------------
test("comments.update: author can; stranger and anon cannot, even on a public page", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "Doc" });
  const cid = await alice.asUser.mutation(api.features.comments.mutations.create, {
    pageId, text: "original", ...COMMENT,
  });
  await alice.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });

  // (b) — the stranger CAN see the id via the public listing, and still cannot edit.
  const visible = await mallory.asUser.query(api.features.comments.queries.listForPage, { pageId });
  expect(visible[0]._id).toBe(cid);
  await expect(
    mallory.asUser.mutation(api.features.comments.mutations.update, { id: cid, text: "defaced" }),
  ).rejects.toThrow(/Not found/);

  // (c)
  await expect(
    t.mutation(api.features.comments.mutations.update, { id: cid, text: "defaced" }),
  ).rejects.toThrow(/Belum login/);

  expect((await alice.asUser.query(api.features.comments.queries.listForPage, { pageId }))[0].text)
    .toBe("original");

  // (a) The author can.
  await alice.asUser.mutation(api.features.comments.mutations.update, { id: cid, text: "edited" });
  expect((await alice.asUser.query(api.features.comments.queries.listForPage, { pageId }))[0].text)
    .toBe("edited");
});

// ---------------------------------------------------------------------------
// (5) comments.remove / resolve — destructive + moderation. `remove` is a
//     SILENT no-op for an unauthorized actor (it returns rather than
//     throwing), so the guarantee under test is "the comment survives".
// ---------------------------------------------------------------------------
test("comments.remove/resolve: stranger and anon cannot destroy or moderate", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "Doc" });
  const cid = await alice.asUser.mutation(api.features.comments.mutations.create, {
    pageId, text: "keep me", ...COMMENT,
  });
  await alice.asUser.mutation(api.pages.setPublic, { pageId, isPublic: true });

  // (b) resolve throws; remove is a silent no-op — assert survival either way.
  await expect(
    mallory.asUser.mutation(api.features.comments.mutations.resolve, { id: cid, resolved: true }),
  ).rejects.toThrow(/Not found/);
  await mallory.asUser.mutation(api.features.comments.mutations.remove, { id: cid });

  // (c)
  await expect(
    t.mutation(api.features.comments.mutations.resolve, { id: cid, resolved: true }),
  ).rejects.toThrow(/Belum login/);
  await expect(
    t.mutation(api.features.comments.mutations.remove, { id: cid }),
  ).rejects.toThrow(/Belum login/);

  const survived = await alice.asUser.query(api.features.comments.queries.listForPage, { pageId });
  expect(survived.length).toBe(1);
  expect(survived[0].resolved).toBe(false);

  // (a) The author can resolve, then delete.
  await alice.asUser.mutation(api.features.comments.mutations.resolve, { id: cid, resolved: true });
  expect((await alice.asUser.query(api.features.comments.queries.listForPage, { pageId }))[0].resolved).toBe(true);
  await alice.asUser.mutation(api.features.comments.mutations.remove, { id: cid });
  expect(await alice.asUser.query(api.features.comments.queries.listForPage, { pageId })).toEqual([]);
});

// ===========================================================================
// FILES / BLOB STORAGE
// ===========================================================================

// ---------------------------------------------------------------------------
// (6) files.generateUploadUrl — minting an upload URL is authed-only. An
//     open URL minter is an unauthenticated storage-cost DoS.
// ---------------------------------------------------------------------------
test("files.generateUploadUrl: authed user can mint; anon cannot", async () => {
  const t = testCtx();
  const { alice } = await twoTenants(t);

  const url = await alice.asUser.mutation(api.features.files.mutations.generateUploadUrl, {});
  expect(typeof url).toBe("string");

  await expect(
    t.mutation(api.features.files.mutations.generateUploadUrl, {}),
  ).rejects.toThrow(/Not authenticated/);
});

// ---------------------------------------------------------------------------
// (7) files.confirmUpload — the ownership record. Whoever holds this row
//     controls deletion of the blob. A second user must NOT be able to
//     re-claim a storageId already owned by someone else.
// ---------------------------------------------------------------------------
test("files.confirmUpload: a stranger cannot re-claim another user's blob; anon cannot claim at all", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["secret bytes"])));

  // (a) Alice claims it. Re-claiming by the same user is idempotent.
  const fileId = await alice.asUser.mutation(api.features.files.mutations.confirmUpload, { storageId });
  expect(await alice.asUser.mutation(api.features.files.mutations.confirmUpload, { storageId })).toBe(fileId);

  // (b) Mallory cannot take ownership of a blob Alice already owns.
  await expect(
    mallory.asUser.mutation(api.features.files.mutations.confirmUpload, { storageId }),
  ).rejects.toThrow(/Not authorized/);

  // (c) Anonymous.
  await expect(
    t.mutation(api.features.files.mutations.confirmUpload, { storageId }),
  ).rejects.toThrow(/Not authenticated/);

  // Exactly one ownership row exists, and it is Alice's.
  const owners = await t.run(async (ctx) =>
    await ctx.db.query("files").withIndex("by_storage", (q) => q.eq("storageId", storageId)).collect(),
  );
  expect(owners.length).toBe(1);
  expect(owners[0].userId).toBe(alice.userId);
});

// ---------------------------------------------------------------------------
// (8) files.remove — destroys the blob AND the ownership row. A broken gate
//     lets any authed user delete arbitrary blobs by id.
// ---------------------------------------------------------------------------
test("files.remove: owner can delete; stranger and anon cannot", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["secret bytes"])));
  await alice.asUser.mutation(api.features.files.mutations.confirmUpload, { storageId });

  // (b)
  await expect(
    mallory.asUser.mutation(api.features.files.mutations.remove, { storageId }),
  ).rejects.toThrow(/Not authorized/);

  // (c)
  await expect(
    t.mutation(api.features.files.mutations.remove, { storageId }),
  ).rejects.toThrow(/Not authenticated/);

  // Blob + ownership row both survived the rejected calls.
  expect(await alice.asUser.query(api.features.files.queries.getUrl, { storageId })).not.toBeNull();

  // (a) The owner can — after which the blob is gone.
  await alice.asUser.mutation(api.features.files.mutations.remove, { storageId });
  expect(await alice.asUser.query(api.features.files.queries.getUrl, { storageId })).toBeNull();
  const rows = await t.run(async (ctx) =>
    await ctx.db.query("files").withIndex("by_storage", (q) => q.eq("storageId", storageId)).collect(),
  );
  expect(rows.length).toBe(0);
});

// ---------------------------------------------------------------------------
// (9) files.queries.getUrl — was ungated; fixed.
//
//     ⚠️ FINDING (found by this suite): `convex/features/files/queries.ts`
//     called `ctx.storage.getUrl(storageId)` with no `getAuthUserId` check and
//     no ownership lookup against the `files` table. Any caller — including a
//     fully ANONYMOUS one — who had, guessed or replayed a storageId got a
//     signed, downloadable URL to another tenant's private upload. It was the
//     only endpoint on the file surface with no gate.
//
//     FIXED in this session: getUrl now requires auth and checks
//     `files.by_storage` ownership, falling back to workspace membership.
//     It returns null on every denial so it cannot be used to probe which
//     storage ids exist. The test below is the regression guard.
// ---------------------------------------------------------------------------
test("files.getUrl must not serve another tenant's blob to strangers/anon", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["private bytes"])));
  await alice.asUser.mutation(api.features.files.mutations.confirmUpload, { storageId });

  // (a) The owner gets a URL.
  expect(await alice.asUser.query(api.features.files.queries.getUrl, { storageId })).not.toBeNull();

  // (b) A different authed user must NOT.
  expect(await mallory.asUser.query(api.features.files.queries.getUrl, { storageId })).toBeNull();

  // (c) Anonymous must NOT.
  expect(await t.query(api.features.files.queries.getUrl, { storageId })).toBeNull();
});

// ===========================================================================
// SNAPSHOTS (page version history)
// ===========================================================================

const SNAP = {
  authorName: "Alice",
  takenAt: 1_700_000_000_000,
  icon: "lucide:FileText",
  cover: null,
};

// ---------------------------------------------------------------------------
// (10) snapshots.create + listForPage/listAll. A snapshot embeds the full
//      block content of a page, so both write (forging history onto someone
//      else's page) and read (pulling their content back out) matter.
// ---------------------------------------------------------------------------
test("snapshots.create/list: owner can; stranger and anon cannot write or read", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "v1" });

  // (a)
  const snapId = await alice.asUser.mutation(api.snapshots.create, {
    pageId, title: "v1", blocks: [{ id: "b1", type: "paragraph", text: "CLASSIFIED" }], ...SNAP,
  });
  expect(snapId).toBeTruthy();

  // (b) write denied…
  await expect(
    mallory.asUser.mutation(api.snapshots.create, {
      pageId, title: "forged", blocks: [{ id: "b2", type: "paragraph", text: "forged" }], ...SNAP,
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // …and read denied (fail-closed empty, no existence leak).
  expect(await mallory.asUser.query(api.snapshots.listForPage, { pageId })).toEqual([]);
  expect(await mallory.asUser.query(api.snapshots.listAll, {})).toEqual([]);

  // (c) Anonymous: mutation rejects, queries fail closed.
  await expect(
    t.mutation(api.snapshots.create, {
      pageId, title: "forged", blocks: [], ...SNAP,
    }),
  ).rejects.toThrow(/Belum login/);
  expect(await t.query(api.snapshots.listForPage, { pageId })).toEqual([]);
  expect(await t.query(api.snapshots.listAll, {})).toEqual([]);

  // Owner's history is intact and holds exactly her own snapshot.
  const mine = await alice.asUser.query(api.snapshots.listForPage, { pageId });
  expect(mine.length).toBe(1);
  expect(mine[0]._id).toBe(snapId);
  expect(JSON.stringify(mine[0].blocks)).toContain("CLASSIFIED");
});

// ---------------------------------------------------------------------------
// (11) snapshots.restore — overwrites live page content from a snapshot.
//      A broken gate lets a stranger roll another tenant's page back (data
//      destruction) or, worse, write a snapshot they control onto it.
// ---------------------------------------------------------------------------
test("snapshots.restore: owner can roll back; stranger and anon cannot", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);
  const pageId = await alice.asUser.mutation(api.pages.create, { parentId: null, title: "v1" });
  const snapId = await alice.asUser.mutation(api.snapshots.create, {
    pageId, title: "v1", blocks: [{ id: "b1", type: "paragraph", text: "old text" }], ...SNAP,
  });

  // Page moves forward past the snapshot.
  await alice.asUser.mutation(api.pages.update, { pageId, patch: { title: "v2 current" } });

  // (b) + (c) cannot roll it back.
  await expect(
    mallory.asUser.mutation(api.snapshots.restore, { snapshotId: snapId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.snapshots.restore, { snapshotId: snapId }),
  ).rejects.toThrow(/Belum login/);

  expect((await alice.asUser.query(api.pages.getById, { id: pageId }))?.title).toBe("v2 current");

  // (a) The owner can — title + blocks come back from the snapshot.
  await alice.asUser.mutation(api.snapshots.restore, { snapshotId: snapId });
  const restored = await alice.asUser.query(api.pages.getById, { id: pageId });
  expect(restored?.title).toBe("v1");
  expect(JSON.stringify(restored?.blocks)).toContain("old text");
});

// ===========================================================================
// SEARCH — the cross-workspace leak
// ===========================================================================

// ---------------------------------------------------------------------------
// (12) search.search must be scoped to the caller's ACTIVE WORKSPACE. This
//      is the highest-value leak on the read surface: search returns page
//      TITLES (and matches on denormalized body `searchText`), so an
//      unscoped search index exfiltrates every tenant's content in one call.
//
//      Distinctive nonsense tokens are used so the first-run welcome-seed
//      pages cannot accidentally satisfy the assertions.
// ---------------------------------------------------------------------------
test("search: user B cannot surface user A's page titles or body text", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  // Alice's page: secret token in the TITLE.
  const alicePage = await alice.asUser.mutation(api.pages.create, {
    parentId: null, title: "Zquorvex Acquisition Memo",
  });
  // …and a second secret token in the BODY (searchText is denormalized
  // from blocks on write, so body matches are a separate leak path).
  await alice.asUser.mutation(api.pages.update, {
    pageId: alicePage,
    patch: { blocks: [{ id: "b1", type: "paragraph", text: "payout is Krendaloop million" }] },
  });
  const aliceDb = await alice.asUser.mutation(api.databases.create, { name: "Fribbleton Ledger" });

  // Mallory has her own content so her workspace is provisioned + non-empty.
  await mallory.asUser.mutation(api.pages.create, { parentId: null, title: "Mallory Notes" });

  // (a) Alice finds her own, by title, by body, and the database by name.
  const aliceTitleHits = await alice.asUser.query(api.features.search.queries.search, { q: "Zquorvex" });
  expect(aliceTitleHits.pages.map((p) => p.id)).toContain(alicePage);
  const aliceBodyHits = await alice.asUser.query(api.features.search.queries.search, { q: "Krendaloop" });
  expect(aliceBodyHits.pages.map((p) => p.id)).toContain(alicePage);
  const aliceDbHits = await alice.asUser.query(api.features.search.queries.search, { q: "Fribbleton" });
  expect(aliceDbHits.databases.map((d) => d.id)).toContain(aliceDb);

  // (b) Mallory finds NOTHING of Alice's — not the title, not the body,
  //     not the database name.
  for (const q of ["Zquorvex", "Krendaloop", "Fribbleton", "Acquisition Memo"]) {
    const leaked = await mallory.asUser.query(api.features.search.queries.search, { q });
    expect(leaked.pages.map((p) => p.id)).not.toContain(alicePage);
    expect(leaked.pages.map((p) => p.title)).not.toContain("Zquorvex Acquisition Memo");
    expect(leaked.databases.map((d) => d.id)).not.toContain(aliceDb);
    expect(leaked.databases.map((d) => d.name)).not.toContain("Fribbleton Ledger");
  }

  // (c) Anonymous search returns the empty shape, never content.
  for (const q of ["Zquorvex", "Krendaloop", "Fribbleton"]) {
    expect(await t.query(api.features.search.queries.search, { q })).toEqual({ pages: [], databases: [] });
  }
});

// ---------------------------------------------------------------------------
// (13) search must not resurrect trashed pages, and must not leak a page
//      after it moves out of reach. Trashed rows are excluded by the
//      search index predicate — pin it, because a dropped `.eq("trashed",
//      false)` silently republishes deleted content.
// ---------------------------------------------------------------------------
test("search: trashed pages drop out of the owner's own results", async () => {
  const t = testCtx();
  const { alice } = await twoTenants(t);

  const pageId = await alice.asUser.mutation(api.pages.create, {
    parentId: null, title: "Blenquist Deprecated Plan",
  });
  expect(
    (await alice.asUser.query(api.features.search.queries.search, { q: "Blenquist" })).pages
      .map((p) => p.id),
  ).toContain(pageId);

  await alice.asUser.mutation(api.pages.trash, { pageId });

  expect(
    (await alice.asUser.query(api.features.search.queries.search, { q: "Blenquist" })).pages
      .map((p) => p.id),
  ).not.toContain(pageId);
});
