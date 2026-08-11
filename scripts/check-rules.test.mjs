/**
 * Tests for scripts/check-rules.mjs.
 *
 * Run: bunx vitest run scripts/check-rules.test.mjs
 *
 * The point of these is the false-positive guarantee: the masker must ignore
 * rule mentions that live inside comments, strings and template literals.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, maskSource } from "./check-rules.mjs";

let root;

const write = (rel, body) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
};

const countOf = (report, id) => report.results.find((r) => r.id === id).violations;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "check-rules-"));

  write(
    "convex/good.ts",
    `import { query } from "./_generated/server";
/** CLAUDE.md says: no bare \`.collect()\` — this comment must not be flagged. */
export const list = query({
  args: { id: v.id("pages") },
  handler: async (ctx, { id }) => {
    const msg = "call .collect() on an unbounded scan";
    return ctx.db.query("pages").withIndex("by_id", (q) => q.eq("id", id)).take(50);
  },
});
`,
  );

  write(
    "convex/bad.ts",
    `export const all = query({
  handler: async (ctx) => ctx.db.query("pages").collect(),
});
export const waived = query({
  args: {},
  handler: async (ctx) => {
    // rules-allow: no-collect — bounded, at most 3 rows by construction
    return ctx.db.query("roles").collect();
  },
});
export const internalOne = internalQuery({
  handler: async (ctx) => 1,
});
`,
  );

  write(
    "convex/_generated/api.js",
    `export const x = query({ handler: () => [] }); // generated, must be skipped
`,
  );

  write(
    "frontend/slices/x/Comp.tsx",
    `export function Comp() {
  const html = \`<img src="x"> <button>no</button>\`;
  /* docs: never use <button> directly */
  return (
    <div className="bg-background">
      <p>Don't let this apostrophe eat the file</p>
      <button onClick={go}>hit</button>
      <input type="date" />
      <a href="/dashboard">go</a>
      <img src={u} alt="" />
      <span className={cn("bg-[#0d1117]", other)} />
    </div>
  );
}
`,
  );

  write(
    "frontend/shared/ui/button.tsx",
    `export const Button = (p) => <button {...p} />;\n`,
  );

  write(
    "frontend/slices/x/Comp.test.tsx",
    `it("x", () => { render(<button />); });\n`,
  );

  write("scripts/deploy.sh", `#!/bin/sh\n# historical: pnpm install\npnpm exec convex deploy\n`);
  write("docs/audit/2026-01-01-old.md", "```sh\npnpm install\n```\n");
  write("docs/api/guide.md", "Run `npx convex dev` first.\n\nProse mentioning pnpm-lock.yaml is fine.\n");
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("masker", () => {
  it("blanks comments, strings and template literals but keeps offsets", () => {
    const src = `const a = "x.collect()"; // .collect()\n/* .collect() */ b.collect();`;
    const { masked } = maskSource(src);
    expect(masked.length).toBe(src.length);
    expect(masked.split("\n").length).toBe(src.split("\n").length);
    expect([...masked.matchAll(/\.collect\(/g)]).toHaveLength(1);
  });

  it("does not treat a JSX apostrophe as a string opener", () => {
    const { masked } = maskSource(`<p>Don't</p>\n<button />`);
    expect(masked).toContain("<button");
  });

  it("does not treat a JSX closing tag as a regex literal", () => {
    const { masked } = maskSource(`<div>{x}</div>\n<img src={y} />`);
    expect(masked).toContain("<img");
  });
});

describe("no-collect", () => {
  it("flags real call sites only, honours waivers, skips _generated + comments", () => {
    const report = check(root, ["no-collect"]);
    const v = countOf(report, "no-collect");
    expect(v.map((x) => `${x.file}:${x.line}`)).toEqual(["convex/bad.ts:2"]);
    expect(report.waivers).toBe(1);
  });
});

describe("convex-args", () => {
  it("flags public fns that go straight to handler, ignores internal*", () => {
    const v = countOf(check(root, ["convex-args"]), "convex-args");
    expect(v).toHaveLength(1);
    expect(v[0].file).toBe("convex/bad.ts");
    expect(v[0].line).toBe(1);
  });
});

describe("ui rules", () => {
  it("flags raw primitives outside shared/ui and outside tests", () => {
    const v = countOf(check(root, ["raw-ui-primitive"]), "raw-ui-primitive");
    expect(v.map((x) => x.detail)).toEqual(["<button>", '<input type="date">']);
    expect(v.every((x) => x.file === "frontend/slices/x/Comp.tsx")).toBe(true);
  });

  it("flags internal <a href> and raw <img>, not the ones inside a template literal", () => {
    expect(countOf(check(root, ["raw-internal-link"]), "raw-internal-link")).toHaveLength(1);
    const img = countOf(check(root, ["raw-img"]), "raw-img");
    expect(img).toHaveLength(1);
    expect(img[0].line).toBe(10);
  });

  it("flags hex inside className", () => {
    const v = countOf(check(root, ["hex-in-classname"]), "hex-in-classname");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toBe("#0d1117");
  });
});

describe("no-pnpm", () => {
  it("flags commands in scripts + docs, exempts docs/audit and prose", () => {
    const v = countOf(check(root, ["no-pnpm"]), "no-pnpm");
    const files = v.map((x) => x.file);
    expect(files).toContain("scripts/deploy.sh");
    expect(files).toContain("docs/api/guide.md");
    expect(files).not.toContain("docs/audit/2026-01-01-old.md");
    // the `# historical: pnpm install` shell comment is not a command
    expect(v.filter((x) => x.file === "scripts/deploy.sh")).toHaveLength(1);
  });
});
