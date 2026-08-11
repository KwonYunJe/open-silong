// @vitest-environment edge-runtime
//
// Authz matrix for the DATABASE surface (convex/databases.ts).
//
// Every endpoint here is asserted three ways:
//   (a) the owner CAN do it,
//   (b) a different AUTHENTICATED user CANNOT,
//   (c) an ANONYMOUS caller CANNOT.
// (b) and (c) are the point — a happy-path-only test does not catch an
// authz regression. Each denial also asserts the victim's data is
// unchanged, so a handler that throws *after* writing still fails.
//
// The gate is `requireWorkspaceAccess` (convex/_shared/auth.ts). Its
// error literals: "Tidak ditemukan" (NOT_FOUND — missing doc or
// non-member, existence is never leaked) and "Tidak berwenang"
// (FORBIDDEN — member, but role too low). Unauthenticated bottoms out
// in `requireAuth` → "Belum login".
import { expect, test } from "vitest";
import { api } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";

/** Two users, each auto-provisioned into their own personal workspace on
 *  their first workspace-writing mutation. Neither is a member of the
 *  other's workspace, which is exactly the cross-tenant shape we probe. */
async function twoTenants(t: ReturnType<typeof testCtx>) {
  const alice = await seedUser(t, { email: "alice@example.com", name: "Alice" });
  const mallory = await seedUser(t, { email: "mallory@example.com", name: "Mallory" });
  return { alice, mallory };
}

// ---------------------------------------------------------------------------
// (1) databases.update — the firehose patch. A broken gate here rewrites
//     another tenant's property schema / views wholesale.
// ---------------------------------------------------------------------------
test("update: owner patches schema; stranger and anon cannot", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const dbId = await alice.asUser.mutation(api.databases.create, { name: "Roadmap" });

  // (a) Owner can rewrite the property schema.
  const before = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  const nextProps = [...before.properties, { id: "p_added", name: "Owner", type: "text" }];
  await alice.asUser.mutation(api.databases.update, { dbId, patch: { properties: nextProps } });
  const afterOwner = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(afterOwner.properties.map((p) => p.id)).toContain("p_added");

  // (b) A different authed user is not a member of Alice's workspace.
  await expect(
    mallory.asUser.mutation(api.databases.update, {
      dbId,
      patch: { name: "pwned", properties: [] },
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (c) Anonymous.
  await expect(
    t.mutation(api.databases.update, { dbId, patch: { name: "pwned" } }),
  ).rejects.toThrow(/Belum login/);

  // Neither denial mutated anything.
  const final = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(final.name).toBe("Roadmap");
  expect(final.properties.map((p) => p.id)).toContain("p_added");
});

// ---------------------------------------------------------------------------
// (2) databases.update — view mutation path. Views carry `formIsPublic`,
//     which `update` reflects into the `hasPublicForm` index flag. A
//     stranger flipping that would publish another tenant's database as
//     an anonymous-writable public form.
// ---------------------------------------------------------------------------
test("update(views): stranger cannot flip another tenant's view to a public form", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const dbId = await alice.asUser.mutation(api.databases.create, { name: "Private DB" });
  const db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  const hijackedViews = db.views.map((v) => ({ ...v, formIsPublic: true }));

  await expect(
    mallory.asUser.mutation(api.databases.update, { dbId, patch: { views: hijackedViews } }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.databases.update, { dbId, patch: { views: hijackedViews } }),
  ).rejects.toThrow(/Belum login/);

  const after = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(after.hasPublicForm).not.toBe(true);
  expect(after.views.some((v) => (v as { formIsPublic?: boolean }).formIsPublic === true)).toBe(false);

  // (a) The owner CAN — proving the denial above was authz, not a bad patch.
  await alice.asUser.mutation(api.databases.update, { dbId, patch: { views: hijackedViews } });
  const owned = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(owned.hasPublicForm).toBe(true);
});

// ---------------------------------------------------------------------------
// (3) databases.trash / restore — destructive lifecycle.
// ---------------------------------------------------------------------------
test("trash/restore: owner can; stranger and anon cannot", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const dbId = await alice.asUser.mutation(api.databases.create, { name: "Keep" });

  // (b) + (c) denied.
  await expect(mallory.asUser.mutation(api.databases.trash, { dbId })).rejects.toThrow(/Tidak ditemukan/);
  await expect(t.mutation(api.databases.trash, { dbId })).rejects.toThrow(/Belum login/);

  let db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(db.trashed).not.toBe(true);

  // (a) Owner can trash…
  await alice.asUser.mutation(api.databases.trash, { dbId });
  db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(db.trashed).toBe(true);

  // …and a stranger cannot un-trash it back into view either.
  await expect(mallory.asUser.mutation(api.databases.restore, { dbId })).rejects.toThrow(/Tidak ditemukan/);
  await expect(t.mutation(api.databases.restore, { dbId })).rejects.toThrow(/Belum login/);

  await alice.asUser.mutation(api.databases.restore, { dbId });
  db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(db.trashed).toBe(false);
});

// ---------------------------------------------------------------------------
// (4) databases.permanentlyDelete — hard cascade delete of the db doc AND
//     every row page. The single most destructive endpoint on this surface.
// ---------------------------------------------------------------------------
test("permanentlyDelete: stranger and anon cannot nuke another tenant's db + rows", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const dbId = await alice.asUser.mutation(api.databases.create, { name: "Critical" });
  const rowId = await alice.asUser.mutation(api.databases.addRow, { dbId });

  await expect(
    mallory.asUser.mutation(api.databases.permanentlyDelete, { dbId }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.databases.permanentlyDelete, { dbId }),
  ).rejects.toThrow(/Belum login/);

  // Database and its row page both survived the two rejected calls.
  expect((await alice.asUser.query(api.databases.list, {})).some((d) => d._id === dbId)).toBe(true);
  expect(await alice.asUser.query(api.pages.getById, { id: rowId })).not.toBeNull();

  // (a) The owner CAN — cascade removes the db and its row page.
  await alice.asUser.mutation(api.databases.permanentlyDelete, { dbId });
  expect((await alice.asUser.query(api.databases.list, {})).some((d) => d._id === dbId)).toBe(false);
  expect(await alice.asUser.query(api.pages.getById, { id: rowId })).toBeNull();
});

// ---------------------------------------------------------------------------
// (5) databases.deleteRow — soft-deletes a row page and unlinks it. Note the
//     handler gates BOTH the database and the row page; a stranger passing
//     their OWN dbId with Alice's rowPageId must still be rejected by the
//     second gate (confused-deputy probe).
// ---------------------------------------------------------------------------
test("deleteRow: stranger cannot delete another tenant's row, even via their own dbId", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const aliceDb = await alice.asUser.mutation(api.databases.create, { name: "Alice DB" });
  const aliceRow = await alice.asUser.mutation(api.databases.addRow, { dbId: aliceDb });
  const malloryDb = await mallory.asUser.mutation(api.databases.create, { name: "Mallory DB" });

  // (b) Straight cross-tenant call — first gate (the database) rejects.
  await expect(
    mallory.asUser.mutation(api.databases.deleteRow, { dbId: aliceDb, rowPageId: aliceRow }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (b') Confused deputy: Mallory owns the dbId she passes, so the first
  // gate passes. The SECOND gate (the row page) is what must stop her.
  await expect(
    mallory.asUser.mutation(api.databases.deleteRow, { dbId: malloryDb, rowPageId: aliceRow }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (c) Anonymous.
  await expect(
    t.mutation(api.databases.deleteRow, { dbId: aliceDb, rowPageId: aliceRow }),
  ).rejects.toThrow(/Belum login/);

  // Row is alive, untrashed, and still linked to Alice's database.
  const row = await alice.asUser.query(api.pages.getById, { id: aliceRow });
  expect(row).not.toBeNull();
  expect(row?.trashed).toBe(false);
  const db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === aliceDb)!;
  expect(db.rowIds).toContain(aliceRow);

  // (a) Owner can — row goes to trash and is unlinked.
  await alice.asUser.mutation(api.databases.deleteRow, { dbId: aliceDb, rowPageId: aliceRow });
  expect((await alice.asUser.query(api.pages.getById, { id: aliceRow }))?.trashed).toBe(true);
  const dbAfter = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === aliceDb)!;
  expect(dbAfter.rowIds).not.toContain(aliceRow);
});

// ---------------------------------------------------------------------------
// (6) databases.duplicateWithRows — the EXFILTRATION vector. It reads every
//     row page of `srcDbId` and writes clones into `targetDbId`. If the
//     source side were gated only on the target, Mallory could copy Alice's
//     entire database (titles, blocks, row values) into her own workspace.
// ---------------------------------------------------------------------------
test("duplicateWithRows: stranger cannot copy another tenant's rows into their own db", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const aliceDb = await alice.asUser.mutation(api.databases.create, { name: "Salaries" });
  const aliceRow = await alice.asUser.mutation(api.databases.addRow, { dbId: aliceDb });
  const propId = (await alice.asUser.query(api.databases.list, {}))
    .find((d) => d._id === aliceDb)!.properties[0].id as string;
  await alice.asUser.mutation(api.databases.setRowValue, {
    dbId: aliceDb,
    rowPageId: aliceRow,
    propId,
    value: "TOP SECRET",
  });

  const malloryDb = await mallory.asUser.mutation(api.databases.create, { name: "Salaries" });

  // (b) src = Alice's, target = Mallory's → the read-side gate must reject.
  await expect(
    mallory.asUser.mutation(api.databases.duplicateWithRows, {
      srcDbId: aliceDb,
      targetDbId: malloryDb,
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // …and the reverse direction (write into Alice's db) is denied too.
  await expect(
    mallory.asUser.mutation(api.databases.duplicateWithRows, {
      srcDbId: malloryDb,
      targetDbId: aliceDb,
    }),
  ).rejects.toThrow(/Tidak ditemukan/);

  // (c) Anonymous.
  await expect(
    t.mutation(api.databases.duplicateWithRows, { srcDbId: aliceDb, targetDbId: malloryDb }),
  ).rejects.toThrow(/Belum login/);

  // Nothing landed in Mallory's database.
  const mDb = (await mallory.asUser.query(api.databases.list, {})).find((d) => d._id === malloryDb)!;
  expect(mDb.rowIds).toEqual([]);

  // (a) Alice duplicating between two of her OWN databases works, and
  //     carries the secret value across — proving the denial was authz.
  const aliceDb2 = await alice.asUser.mutation(api.databases.create, { name: "Salaries" });
  const res = await alice.asUser.mutation(api.databases.duplicateWithRows, {
    srcDbId: aliceDb,
    targetDbId: aliceDb2,
  });
  expect(res.copied).toBe(1);
  const copyId = (await alice.asUser.query(api.databases.list, {}))
    .find((d) => d._id === aliceDb2)!.rowIds[0];
  const copyProps = (await alice.asUser.query(api.pages.getById, { id: copyId }))?.rowProps ?? {};
  expect(Object.values(copyProps)).toContain("TOP SECRET");
});

// ---------------------------------------------------------------------------
// (7) databases.list + setRowValue read/write isolation. `list` is the
//     tenant boundary for the whole database surface — it must never
//     surface another workspace's databases, and an anonymous caller
//     gets an empty list rather than an error (fail-closed, no leak).
// ---------------------------------------------------------------------------
test("list: scoped to the caller's workspace; anon sees nothing", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const aliceDb = await alice.asUser.mutation(api.databases.create, { name: "Alice Only" });
  const malloryDb = await mallory.asUser.mutation(api.databases.create, { name: "Mallory Only" });

  const aliceSees = await alice.asUser.query(api.databases.list, {});
  expect(aliceSees.map((d) => d._id)).toContain(aliceDb);
  expect(aliceSees.map((d) => d._id)).not.toContain(malloryDb);
  expect(aliceSees.map((d) => d.name)).not.toContain("Mallory Only");

  const mallorySees = await mallory.asUser.query(api.databases.list, {});
  expect(mallorySees.map((d) => d._id)).toContain(malloryDb);
  expect(mallorySees.map((d) => d._id)).not.toContain(aliceDb);
  expect(mallorySees.map((d) => d.name)).not.toContain("Alice Only");

  // (c) Anonymous read is empty, not an error and not a leak.
  expect(await t.query(api.databases.list, {})).toEqual([]);
});

test("setRowValue: stranger and anon cannot write another tenant's row props", async () => {
  const t = testCtx();
  const { alice, mallory } = await twoTenants(t);

  const dbId = await alice.asUser.mutation(api.databases.create, { name: "Tasks" });
  const rowId = await alice.asUser.mutation(api.databases.addRow, { dbId });
  const propId = (await alice.asUser.query(api.databases.list, {}))
    .find((d) => d._id === dbId)!.properties[0].id as string;

  await alice.asUser.mutation(api.databases.setRowValue, { dbId, rowPageId: rowId, propId, value: "mine" });

  await expect(
    mallory.asUser.mutation(api.databases.setRowValue, { dbId, rowPageId: rowId, propId, value: "pwned" }),
  ).rejects.toThrow(/Tidak ditemukan/);
  await expect(
    t.mutation(api.databases.setRowValue, { dbId, rowPageId: rowId, propId, value: "pwned" }),
  ).rejects.toThrow(/Belum login/);

  expect((await alice.asUser.query(api.pages.getById, { id: rowId }))?.rowProps?.[propId]).toBe("mine");
});

// ---------------------------------------------------------------------------
// (8) databases.addRow / create under anonymity. `create` has no doc to gate
//     on, so `requireAuth` is the only thing standing between an anonymous
//     caller and unbounded inserts.
// ---------------------------------------------------------------------------
test("create/addRow reject anonymous callers", async () => {
  const t = testCtx();
  const { alice } = await twoTenants(t);
  const dbId = await alice.asUser.mutation(api.databases.create, { name: "X" });

  await expect(t.mutation(api.databases.create, { name: "anon db" })).rejects.toThrow(/Belum login/);
  await expect(t.mutation(api.databases.addRow, { dbId })).rejects.toThrow(/Belum login/);

  // No row was appended by the rejected anonymous call.
  const db = (await alice.asUser.query(api.databases.list, {})).find((d) => d._id === dbId)!;
  expect(db.rowIds).toEqual([]);
});
