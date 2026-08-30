// @vitest-environment edge-runtime
//
// structure_upsert exists for ONE guarantee: an external system (konglo-os,
// CareerPack, …) can publish the same tree repeatedly without duplicating it.
// If that breaks, the tool is worse than useless — every sync doubles the
// workspace. So the idempotency path is what these tests pin down.
import { expect, test } from "vitest";
import { internal } from "../_generated/api";
import { testCtx, seedUser } from "../testHarness.test";

const TREE = [
  {
    key: "playbook",
    title: "Family Office Playbook",
    icon: "🏛",
    markdown: "# Overview\n\nGovernance first.",
    children: [
      { key: "playbook/governance", title: "Governance", markdown: "Board cadence." },
      { key: "playbook/succession", title: "Succession" },
    ],
  },
];

// Only the externally-owned pages. A fresh workspace bootstraps with seeded
// welcome content, so a raw page count would measure that instead of the tool.
const importedPages = (t: ReturnType<typeof testCtx>) =>
  t.run(async (ctx) =>
    (await ctx.db.query("pages").collect()).filter((p) => p.externalKey !== undefined),
  );
const allPages = (t: ReturnType<typeof testCtx>) =>
  t.run(async (ctx) => ctx.db.query("pages").collect());

test("first send creates the tree; a second identical send updates in place", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);

  const first = await t.mutation(internal.mcp.internal.structureUpsert, {
    userId,
    source: "konglo-os",
    nodes: TREE,
  });
  expect(first).toMatchObject({ created: 3, updated: 0, total: 3 });

  const afterFirst = await importedPages(t);
  expect(afterFirst).toHaveLength(3);
  expect(afterFirst.map((p) => p.externalKey).sort()).toEqual([
    "konglo-os:playbook",
    "konglo-os:playbook/governance",
    "konglo-os:playbook/succession",
  ]);

  // Re-send: same keys => update, and crucially NO new rows.
  const second = await t.mutation(internal.mcp.internal.structureUpsert, {
    userId,
    source: "konglo-os",
    nodes: TREE,
  });
  expect(second).toMatchObject({ created: 0, updated: 3, total: 3 });
  expect(await importedPages(t)).toHaveLength(3);
});

test("a re-send with changed content replaces the body and title", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);

  await t.mutation(internal.mcp.internal.structureUpsert, {
    userId,
    source: "konglo-os",
    nodes: [{ key: "a", title: "Old Title", markdown: "old body" }],
  });
  await t.mutation(internal.mcp.internal.structureUpsert, {
    userId,
    source: "konglo-os",
    nodes: [{ key: "a", title: "New Title", markdown: "new body" }],
  });

  const pages = await importedPages(t);
  expect(pages).toHaveLength(1);
  expect(pages[0].title).toBe("New Title");
  expect(pages[0].searchText).toContain("new body");
  expect(pages[0].searchText).not.toContain("old body");
});

test("the same key under a DIFFERENT source is a different page", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);

  await t.mutation(internal.mcp.internal.structureUpsert, {
    userId, source: "konglo-os", nodes: [{ key: "shared", title: "From Konglo" }],
  });
  await t.mutation(internal.mcp.internal.structureUpsert, {
    userId, source: "careerpack", nodes: [{ key: "shared", title: "From CareerPack" }],
  });

  const pages = await importedPages(t);
  expect(pages).toHaveLength(2);
  expect(pages.map((p) => p.externalKey).sort()).toEqual([
    "careerpack:shared",
    "konglo-os:shared",
  ]);
});

test("human-authored pages are never adopted by an upsert", async () => {
  const t = testCtx();
  const { userId, asUser } = await seedUser(t);

  // A page a person made, with the same title the external tree will use.
  const manual = await asUser.mutation(
    (await import("../_generated/api")).api.pages.create,
    { parentId: null, title: "Governance" },
  );

  await t.mutation(internal.mcp.internal.structureUpsert, {
    userId, source: "konglo-os", nodes: [{ key: "governance", title: "Governance" }],
  });

  // The upsert created exactly one page and left the human's page alone.
  expect(await importedPages(t)).toHaveLength(1);
  const human = (await allPages(t)).find((p) => p._id === manual);
  expect(human).toBeDefined();
  expect(human?.externalKey).toBeUndefined();
  expect(human?.title).toBe("Governance");
});

test("rejects a malformed source and an over-deep tree", async () => {
  const t = testCtx();
  const { userId } = await seedUser(t);

  await expect(
    t.mutation(internal.mcp.internal.structureUpsert, {
      userId, source: "has spaces", nodes: [{ key: "a", title: "A" }],
    }),
  ).rejects.toThrow(/source must be/);

  // 7 levels — one past MAX_DEPTH.
  type Node = { key: string; title: string; children?: Node[] };
  let deep: Node = { key: "n7", title: "n7" };
  for (let i = 6; i >= 1; i--) deep = { key: `n${i}`, title: `n${i}`, children: [deep] };
  await expect(
    t.mutation(internal.mcp.internal.structureUpsert, {
      userId, source: "konglo-os", nodes: [deep],
    }),
  ).rejects.toThrow(/deeper than/);
});
