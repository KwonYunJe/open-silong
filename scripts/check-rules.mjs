#!/usr/bin/env node
/**
 * check-rules.mjs — machine-enforce the hard rules in CLAUDE.md.
 *
 * Zero dependencies. Runs under `node scripts/check-rules.mjs` and under
 * `bun scripts/check-rules.mjs`.
 *
 *   exit 0 → clean (one-line summary)
 *   exit 1 → violations found (grouped, actionable report)
 *
 * Flags:
 *   --json              machine-readable report on stdout
 *   --rule <id>         only run one rule (repeatable)
 *   --root <path>       scan a different repo root (used by the tests)
 *
 * Waivers: put `rules-allow: <rule-id> — <reason>` in a comment on the line
 * BEFORE the offending line (or trailing on the same line). Markdown/YAML/sh
 * comment syntaxes work too. Waivers are counted and printed so they stay
 * visible instead of rotting into invisible debt.
 *
 * Why a hand-rolled masker instead of grep: 5 of the 14 `.collect()` mentions
 * in convex/ are inside comments quoting the rule itself. A linter that cries
 * wolf gets disabled within a week, so comments / strings / template literals /
 * regex literals are blanked out before any matching happens.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// masking: blank out comments + string contents, preserving byte offsets
// ---------------------------------------------------------------------------

const KEYWORDS_BEFORE_VALUE = new Set([
  "return", "case", "typeof", "instanceof", "in", "of", "new", "do", "else",
  "await", "yield", "throw", "from", "import", "export", "default", "as",
  "delete", "void",
]);

/** Chars that, when they precede a `/`, mean a regex literal starts there. */
const REGEX_PRECEDERS = new Set([
  "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*",
  "%", "^", "~", "\n",
]);

const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);

/**
 * Replace every comment body and every string/template/regex body with spaces.
 * Newlines are preserved so line/column numbers stay exact.
 *
 * @returns {{ masked: string, stringSpans: Array<[number, number]> }}
 */
export function maskSource(src) {
  const out = Array.from(src);
  const stringSpans = [];
  const n = src.length;
  let i = 0;
  // stack of template-literal states we are nested inside via `${`
  const tplStack = [];

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };

  const prevSignificant = (idx) => {
    for (let k = idx - 1; k >= 0; k--) {
      const c = src[k];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") continue;
      return { char: c, index: k };
    }
    return null;
  };

  const prevWord = (idx) => {
    let k = idx - 1;
    while (k >= 0 && /\s/.test(src[k])) k--;
    const end = k + 1;
    while (k >= 0 && isWordChar(src[k])) k--;
    return src.slice(k + 1, end);
  };

  /**
   * A quote only opens a string when the previous significant char could not
   * have ended an expression — otherwise it is almost certainly an apostrophe
   * inside JSX text (`<p>Don't</p>`), which must NOT swallow the rest of the file.
   */
  const quoteOpensString = (idx) => {
    const prev = prevSignificant(idx);
    if (!prev) return true;
    const c = prev.char;
    if (!isWordChar(c) && c !== ")" && c !== "]" && c !== ">") return true;
    if (c === ">") return false; // JSX text right after a tag
    if (isWordChar(c)) return KEYWORDS_BEFORE_VALUE.has(prevWord(idx));
    return false;
  };

  const regexStartsHere = (idx) => {
    const prev = prevSignificant(idx);
    if (!prev) return true;
    const c = prev.char;
    if (REGEX_PRECEDERS.has(c)) return true;
    if (isWordChar(c)) return KEYWORDS_BEFORE_VALUE.has(prevWord(idx));
    return false;
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    // line comment
    if (c === "/" && next === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    // block comment
    if (c === "/" && next === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      blank(i, j);
      i = j;
      continue;
    }
    // string literal
    if (c === '"' || c === "'") {
      if (!quoteOpensString(i)) { i++; continue; }
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) break;
        if (src[j] === "\n") break; // unterminated — bail, do not eat the file
        j++;
      }
      blank(i + 1, j);
      stringSpans.push([i, Math.min(j, n - 1)]);
      i = j + 1;
      continue;
    }
    // template literal
    if (c === "`") {
      let j = i + 1;
      const start = j;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          blank(start, j);
          tplStack.push(true);
          j += 2;
          // hand control back to the main loop for the interpolation body
          break;
        }
        if (src[j] === "`") break;
        j++;
      }
      if (j < n && src[j] === "`") {
        blank(start, j);
        stringSpans.push([i, j]);
        i = j + 1;
      } else if (tplStack.length) {
        i = j;
      } else {
        blank(start, n);
        i = n;
      }
      continue;
    }
    // closing `}` of a `${ … }` inside a template literal → resume the literal
    if (c === "}" && tplStack.length) {
      tplStack.pop();
      let j = i + 1;
      const start = j;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          blank(start, j);
          tplStack.push(true);
          j += 2;
          break;
        }
        if (src[j] === "`") break;
        j++;
      }
      if (j < n && src[j] === "`") {
        blank(start, j);
        i = j + 1;
      } else {
        blank(start, Math.min(j, n));
        i = j;
      }
      continue;
    }
    // regex literal
    if (c === "/" && regexStartsHere(i)) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        blank(i + 1, j);
        i = j + 1;
        continue;
      }
    }
    i++;
  }

  return { masked: out.join(""), stringSpans };
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "coverage", "build", ".turbo",
  ".vercel", "_generated", ".convex", "out",
]);

function walk(root, dir = root, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(root, abs, acc);
    } else if (e.isFile()) {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  return acc;
}

const lineIndex = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
};
const lineOf = (starts, offset) => {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1; // 1-indexed
};
const textOfLine = (src, starts, line) => {
  const from = starts[line - 1];
  const to = line < starts.length ? starts[line] - 1 : src.length;
  return src.slice(from, to).replace(/\s+$/, "");
};

const WAIVER_RE = /rules-allow:\s*([a-z0-9-]+|\*)/i;
/** Waiver trailing on the offending line, or in the comment block above the
 *  STATEMENT that contains it.
 *
 *  "Previous line only" is wrong for the case that matters most: the violation
 *  usually sits at the end of a multi-line builder chain
 *  (`ctx.db.query(...)\n.withIndex(...)\n.collect()`), so the line directly
 *  above it is another chain link, not where a human would ever write the
 *  justification. Walk back over chain continuations (lines starting with `.`
 *  or `,`) and over the contiguous comment block, and stop at the first line
 *  that looks like the start of a different statement. */
const WAIVER_LOOKBACK = 12;
function waivedAt(src, starts, line, ruleId) {
  const matches = (l) => {
    if (l < 1 || l > starts.length) return false;
    const m = WAIVER_RE.exec(textOfLine(src, starts, l));
    return !!m && (m[1] === "*" || m[1].toLowerCase() === ruleId);
  };
  if (matches(line)) return true;
  const isComment = (t) => t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.endsWith("*/");

  let l = line - 1;
  let hops = 0;
  // Phase 1 — climb the rest of the statement (`.withIndex(...)`, `.query(...)`)
  // up to and including the line the statement starts on.
  while (l >= 1 && hops < WAIVER_LOOKBACK) {
    const t = textOfLine(src, starts, l).trim();
    if (t === "") return false;
    if (matches(l)) return true;
    if (isComment(t)) break; // already at the comment block
    l--; hops++;
    if (!/^[.,?:]/.test(t)) break; // that line started the statement — look above it
  }
  // Phase 2 — climb the contiguous comment block above the statement.
  while (l >= 1 && hops < WAIVER_LOOKBACK) {
    const t = textOfLine(src, starts, l).trim();
    if (t === "" || !isComment(t)) return false;
    if (matches(l)) return true;
    l--; hops++;
  }
  return false;
}

const under = (file, ...prefixes) => prefixes.some((p) => file === p || file.startsWith(p));
const isTest = (file) => /(^|\/)[^/]*\.(test|spec)\.[^/]+$/.test(file) || file.includes("/__tests__/");
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

/**
 * Every rule: { id, title, fix, run(ctx) → void } where ctx exposes
 * `files`, `read(file)` (cached, returns { src, masked, starts }) and
 * `report(file, line, extra?)`.
 */
const RULES = [
  {
    id: "no-collect",
    title: "Bare `.collect()` in convex/",
    fix: "Use `.withIndex(...).take(N)` or `.paginate(...)`. If the walk is provably bounded, waive it: `// rules-allow: no-collect — <why it is bounded>`",
    run(ctx) {
      for (const file of ctx.files) {
        if (!under(file, "convex/")) continue;
        if (!CODE_EXT.test(file) || isTest(file)) continue;
        const { masked } = ctx.read(file);
        for (const m of masked.matchAll(/\.collect\s*\(/g)) ctx.report(file, m.index);
      }
    },
  },
  {
    id: "convex-args",
    title: "Client-reachable convex function without `args:` validators",
    fix: "Add `args: { … v.* }` to the function definition. Missing validators on a public query/mutation/action is a P0 in CLAUDE.md.",
    run(ctx) {
      for (const file of ctx.files) {
        if (!under(file, "convex/")) continue;
        if (!CODE_EXT.test(file) || isTest(file)) continue;
        const { masked } = ctx.read(file);
        // definition sites only: `= query({`, `= mutation({`, `= action({`.
        // internalQuery / internalMutation / httpAction are not client-reachable.
        for (const m of masked.matchAll(/=\s*(query|mutation|action)\s*\(\s*\{/g)) {
          const objStart = masked.indexOf("{", m.index);
          const keys = topLevelKeys(masked, objStart);
          if (keys.has("handler") && !keys.has("args")) {
            ctx.report(file, m.index, { detail: `\`${m[1]}\` goes straight to handler` });
          }
        }
      }
    },
  },
  {
    id: "raw-ui-primitive",
    title: "Raw HTML control instead of a shadcn primitive",
    fix: "Use the shadcn primitive: <Button>, <ResponsiveDialog>, <DateField>, <FileUpload> from frontend/shared/.",
    run(ctx) {
      forEachTag(ctx, (file, tag, raw, offset) => {
        if (tag === "button" || tag === "dialog") {
          ctx.report(file, offset, { detail: `<${tag}>` });
        } else if (tag === "input") {
          const t = /\btype\s*=\s*["'{]?\s*["']?(date|file)\b/.exec(raw);
          if (t) ctx.report(file, offset, { detail: `<input type="${t[1]}">` });
        }
      });
    },
  },
  {
    id: "raw-internal-link",
    title: 'Raw `<a href="/…">` for an internal route',
    fix: "Use `next/link` (or `Link` from @/shared/lib/router inside the dashboard) with a named route from @/shared/lib/routes.",
    run(ctx) {
      forEachTag(ctx, (file, tag, raw, offset) => {
        if (tag !== "a") return;
        if (/\bhref\s*=\s*["'`]\//.test(raw)) ctx.report(file, offset);
      });
    },
  },
  {
    id: "raw-img",
    title: "Raw `<img>` instead of next/image",
    fix: "Use `next/image`. If the source is genuinely un-optimisable, waive it: `// rules-allow: raw-img — <reason>`",
    run(ctx) {
      forEachTag(ctx, (file, tag, _raw, offset) => {
        if (tag === "img") ctx.report(file, offset);
      });
    },
  },
  {
    id: "hex-in-classname",
    title: "Hex colour inside a className",
    fix: "Use theme tokens (bg-background / text-foreground / border-border). Define the colour in globals.css if it is genuinely new.",
    run(ctx) {
      for (const file of ctx.files) {
        if (!isUiFile(file)) continue;
        if (THEME_FILES.some((p) => file.includes(p))) continue;
        const { src } = ctx.read(file);
        for (const span of classNameSpans(src)) {
          const hex = /#[0-9a-fA-F]{3,8}\b/.exec(span.value);
          if (hex) ctx.report(file, span.start, { detail: hex[0] });
        }
      }
    },
  },
  {
    id: "no-pnpm",
    title: "`pnpm` / `npx` command — the repo is on bun",
    fix: "Use `bun` / `bunx` (tests: `bunx vitest run`, never `bun test`).",
    run(ctx) {
      for (const file of ctx.files) {
        if (!pnpmScope(file)) continue;
        const { src } = ctx.read(file);
        if (/\.(md|mdx)$/.test(file)) {
          for (const hit of markdownCommands(src)) {
            if (/^(pnpm|pnpx|npx)\s+\S/.test(hit.text)) ctx.report(file, hit.index, { detail: hit.text.slice(0, 60) });
          }
          continue;
        }
        const body = CODE_EXT.test(file) ? ctx.read(file).masked : stripHashComments(src);
        for (const m of body.matchAll(/\b(pnpm|pnpx|npx)\s+\S/g)) ctx.report(file, m.index);
      }
    },
  },
  {
    id: "dead-index",
    title: "Index declared in convex/ schema but never used by a `.withIndex`",
    fix: "Wire it up with `.withIndex(\"<name>\", …)` on that table, or drop the `.index(...)` line. Forward-declared for a planned feature? Waive it: `// rules-allow: dead-index — <the roadmap entry it belongs to>`",
    run(ctx) {
      // Table-aware on purpose. A plain `.withIndex("by_user"` grep is
      // blind to a dead index whose name is live on a DIFFERENT table —
      // that masking is why the 2026-08-10 audit undercounted 17 as 12.
      const used = new Set(); // "table\u0000index" — always table-scoped
      for (const file of ctx.files) {
        if (!under(file, "convex/") || !CODE_EXT.test(file)) continue;
        const { src } = ctx.read(file); // NOT masked — masking blanks string contents
        // .query("table")…withIndex("name") — the ctx.db chain, table known.
        for (const m of src.matchAll(
          /\.query\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)([\s\S]{0,400}?)\.withIndex\(\s*["'`]([A-Za-z0-9_]+)["'`]/g,
        )) {
          if (!m[2].includes(".query(")) used.add(`${m[1]}\u0000${m[3]}`);
        }
      }

      for (const file of ctx.files) {
        if (!under(file, "convex/") || !CODE_EXT.test(file)) continue;
        if (!/schema\.ts$|tables\.ts$/.test(file)) continue;
        const { src } = ctx.read(file);
        // `name: defineTable({ … }).index("a", […]).index("b", […])`
        for (const t of src.matchAll(/([A-Za-z0-9_]+)\s*:\s*defineTable\(/g)) {
          const table = t[1];
          const i = src.indexOf("defineTable(", t.index);
          // walk to the end of this table's chain: the next `defineTable(` or EOF
          const next = src.indexOf("defineTable(", i + 1);
          const end = next === -1 ? src.length : next;
          const chain = src.slice(i, end);
          for (const ix of chain.matchAll(/\.index\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) {
            const name = ix[1];
            if (!used.has(`${table}\u0000${name}`)) ctx.report(file, i + ix.index, { detail: `${table}.${name}` });
          }
        }
      }
    },
  },
  {
    id: "convex-api-ref",
    title: "Reference to a convex function that does not exist in the generated api",
    fix: "Fix the path, or regenerate `convex/_generated/api.d.ts`. Both reference forms count: `api.a.b.c` and `api[\"a/b\"].c`.",
    run(ctx) {
      // Both forms are runtime-equivalent and BOTH must be swept: nested
      // modules appear as api["features/inbox/queries"].list in app/ +
      // frontend/, but as api.features.inbox.queries.list in convex/_test/.
      // A dotted-only sweep reports live functions as dead.
      let decl;
      try {
        decl = ctx.read("convex/_generated/api.d.ts").src;
      } catch {
        return; // not generated yet — nothing to check against
      }
      const modules = new Set();
      for (const m of decl.matchAll(/["'`]([A-Za-z0-9_/]+)["'`]\s*:\s*typeof/g)) modules.add(m[1]);
      for (const m of decl.matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:\s*typeof/gm)) modules.add(m[1]);
      if (modules.size === 0) return;
      const known = new Set([...modules].map((m) => m.replace(/\//g, ".")));

      for (const file of ctx.files) {
        if (!CODE_EXT.test(file) || under(file, "convex/_generated/")) continue;
        // Bracket form needs the raw source (the module path IS a string
        // literal); the dotted form needs the masked source, or every
        // `https://api.openai.com/...` URL in a string matches.
        const { src, masked } = ctx.read(file);
        // bracket form: api["features/inbox/queries"].list
        for (const m of src.matchAll(/\b(?:api|internal)\[\s*["'`]([A-Za-z0-9_/]+)["'`]\s*\]/g)) {
          if (!modules.has(m[1])) ctx.report(file, m.index, { detail: m[1] });
        }
        // dotted form: api.features.inbox.queries.list
        for (const m of masked.matchAll(/\b(?:api|internal)\.((?:[A-Za-z0-9_]+\.)+[A-Za-z0-9_]+)\b/g)) {
          // `api.a.b.c` is ambiguous: module "a.b" + fn "c", or module
          // "a.b.c" whose fn is reached later (a cast breaks the chain).
          // Any prefix resolving to a real module clears it.
          const parts = m[1].split(".");
          let ok = false;
          for (let n = parts.length; n >= 1; n--) if (known.has(parts.slice(0, n).join("."))) { ok = true; break; }
          if (!ok) ctx.report(file, m.index, { detail: parts.slice(0, -1).join(".") });
        }
      }
    },
  },
];

const THEME_FILES = [
  "next.config.mjs",
  "frontend/slices/theme-presets/",
  "/theme",
  "/colors.",
  "/constants.",
];

const isUiFile = (file) =>
  (under(file, "app/", "frontend/")) &&
  /\.(tsx|jsx|ts|js)$/.test(file) &&
  !isTest(file) &&
  !under(file, "frontend/shared/ui/");

/** Top-level object keys of the object literal starting at `open` (a `{`). */
function topLevelKeys(masked, open) {
  const keys = new Set();
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{" || c === "[" || c === "(") { depth++; continue; }
    if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && /[A-Za-z_$]/.test(c)) {
      const m = /^([A-Za-z0-9_$]+)\s*[:,}]/.exec(masked.slice(i));
      if (m) keys.add(m[1]);
      while (i < masked.length && isWordChar(masked[i])) i++;
      i--;
    }
  }
  return keys;
}

/**
 * Find lowercase HTML tags in code position (masking keeps them out of strings
 * and comments) and hand the RAW tag source to the callback so attribute checks
 * see the real `type="date"` / `href="/…"` text.
 */
function forEachTag(ctx, fn) {
  for (const file of ctx.files) {
    if (!isUiFile(file) || !/\.(tsx|jsx)$/.test(file)) continue;
    const { src, masked } = ctx.read(file);
    for (const m of masked.matchAll(/<(button|dialog|input|a|img)(?=[\s/>])/g)) {
      fn(file, m[1], rawTag(src, m.index), m.index);
    }
  }
}

/** Raw text of the tag starting at `start`, up to its closing `>`. */
function rawTag(src, start) {
  let i = start;
  let quote = null;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) break;
  }
  return src.slice(start, Math.min(i + 1, src.length));
}

/** `className={…}` / `className="…"` values, with their source offsets. */
function classNameSpans(src) {
  const spans = [];
  for (const m of src.matchAll(/\bclassName\s*=\s*/g)) {
    const i = m.index + m[0].length;
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) continue;
      spans.push({ start: m.index, value: src.slice(i + 1, end) });
    } else if (c === "{") {
      let depth = 0, j = i, quote = null;
      for (; j < src.length; j++) {
        const d = src[j];
        if (quote) { if (d === quote) quote = null; continue; }
        if (d === '"' || d === "'" || d === "`") { quote = d; continue; }
        if (d === "{") depth++;
        else if (d === "}") { depth--; if (depth === 0) break; }
      }
      spans.push({ start: m.index, value: src.slice(i + 1, j) });
    }
  }
  return spans;
}

/** Commands inside fenced code blocks and inline `code` spans of a markdown doc. */
function markdownCommands(src) {
  const hits = [];
  const fence = /^```[^\n]*\n([\s\S]*?)^```/gm;
  for (const m of src.matchAll(fence)) {
    const bodyStart = m.index + m[0].indexOf("\n") + 1;
    const lines = m[1].split("\n");
    let off = bodyStart;
    for (const raw of lines) {
      const line = raw.replace(/^\s*[$>]\s*/, "").trim();
      if (line) hits.push({ index: off, text: line });
      off += raw.length + 1;
    }
  }
  const masked = src.replace(fence, (s) => " ".repeat(s.length));
  for (const m of masked.matchAll(/`([^`\n]+)`/g)) {
    hits.push({ index: m.index, text: m[1].trim() });
  }
  return hits;
}

function stripHashComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const i = line.indexOf("#");
      if (i === -1) return line;
      if (line.slice(0, i).includes('"') || line.slice(0, i).includes("'")) return line;
      return line.slice(0, i) + " ".repeat(line.length - i);
    })
    .join("\n");
}

/** Where rule `no-pnpm` applies. Historical records are exempt: docs/archive/**
 *  is point-in-time provenance, not guidance — rewriting old records to say
 *  "bun" would falsify what actually happened at the time. */
function pnpmScope(file) {
  if (under(file, "docs/archive/", "docs/audit/", "docs/rr-sync/")) return false;
  if (under(file, "scripts/")) return !/\.test\./.test(file);
  if (under(file, ".github/")) return true;
  if (under(file, "docs/")) return /\.mdx?$/.test(file);
  if (!file.includes("/")) return /\.(md|sh|mjs|js)$/.test(file); // root docs + scripts
  return false;
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

export function check(root, only = []) {
  const files = walk(root);
  const cache = new Map();
  const read = (file) => {
    let hit = cache.get(file);
    if (!hit) {
      const src = fs.readFileSync(path.join(root, file), "utf8");
      const needsMask = CODE_EXT.test(file);
      hit = {
        src,
        masked: needsMask ? maskSource(src).masked : src,
        starts: lineIndex(src),
      };
      cache.set(file, hit);
    }
    return hit;
  };

  const results = [];
  let waivers = 0;

  for (const rule of RULES) {
    if (only.length && !only.includes(rule.id)) continue;
    const violations = [];
    const ctx = {
      files,
      read,
      report(file, offset, extra = {}) {
        const { src, starts } = read(file);
        const line = lineOf(starts, offset);
        if (waivedAt(src, starts, line, rule.id)) { waivers++; return; }
        violations.push({
          rule: rule.id,
          file,
          line,
          text: textOfLine(src, starts, line).trim().slice(0, 160),
          ...extra,
        });
      },
    };
    rule.run(ctx);
    violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    results.push({ id: rule.id, title: rule.title, fix: rule.fix, violations });
  }

  const total = results.reduce((n, r) => n + r.violations.length, 0);
  return { root, results, total, waivers, filesScanned: files.length };
}

// ---------------------------------------------------------------------------
// baseline (ratchet)
//
// Introducing a linter to a codebase that predates it means starting red, and a
// permanently-red gate gets switched off within a week. So: violations already
// present when the rule landed are recorded as known debt and do not fail the
// build; anything NEW does. Fix debt at leisure, then `--update-baseline` to
// shrink the file — it can only ever get smaller, which is the point.
//
// Fingerprint deliberately excludes the line NUMBER — editing a file above a
// violation must not resurrect it as "new".
// ---------------------------------------------------------------------------
const DEFAULT_BASELINE = path.join(HERE, "check-rules.baseline.json");
const fingerprint = (v) => `${v.rule}|${v.file}|${v.text}`;

function loadBaseline(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return new Set(parsed.violations ?? []);
  } catch {
    return null;
  }
}

function main(argv) {
  const json = argv.includes("--json");
  const update = argv.includes("--update-baseline");
  const useBaseline = !argv.includes("--no-baseline");
  const only = [];
  let root = path.resolve(HERE, "..");
  let baselineFile = DEFAULT_BASELINE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--rule") only.push(argv[++i]);
    if (argv[i] === "--root") root = path.resolve(argv[++i]);
    if (argv[i] === "--baseline") baselineFile = path.resolve(argv[++i]);
  }

  const report = check(root, only);
  const everything = report.results.flatMap((r) => r.violations);

  if (update) {
    const violations = [...new Set(everything.map(fingerprint))].sort();
    fs.writeFileSync(
      baselineFile,
      JSON.stringify(
        {
          note:
            "Pre-existing violations, accepted as debt so the gate is green on NEW code. " +
            "Fix entries and re-run `bun run check:rules -- --update-baseline` to shrink this. " +
            "Never add to it by hand.",
          violations,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`check-rules: baseline written — ${violations.length} known violation(s) → ${path.relative(root, baselineFile)}`);
    return 0;
  }

  const baseline = useBaseline ? loadBaseline(baselineFile) : null;
  let known = 0;
  let stale = 0;
  if (baseline) {
    const seen = new Set();
    for (const r of report.results) {
      r.violations = r.violations.filter((v) => {
        const fp = fingerprint(v);
        seen.add(fp);
        if (baseline.has(fp)) { known++; return false; }
        return true;
      });
    }
    stale = [...baseline].filter((fp) => !seen.has(fp)).length;
    report.total = report.results.reduce((n, r) => n + r.violations.length, 0);
  }
  report.known = known;
  report.staleBaselineEntries = stale;

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report.total === 0 ? 0 : 1;
  }

  const debtNote =
    (report.known ? `, ${report.known} known debt` : "") +
    (report.staleBaselineEntries
      ? `, ${report.staleBaselineEntries} baseline entr${report.staleBaselineEntries === 1 ? "y" : "ies"} now fixed — run with --update-baseline to shrink it`
      : "");

  if (report.total === 0) {
    console.log(
      `check-rules: OK — ${report.filesScanned} files, ${RULES.length} rules, 0 new violations` +
        (report.waivers ? `, ${report.waivers} waiver(s)` : "") +
        debtNote,
    );
    return 0;
  }

  console.log(`check-rules: NEW CLAUDE.md rule violations${report.known ? ` (${report.known} pre-existing entr${report.known === 1 ? "y" : "ies"} in the baseline are not shown)` : ""}\n`);
  for (const r of report.results) {
    if (!r.violations.length) continue;
    console.log(`── ${r.id} — ${r.title}  (${r.violations.length})`);
    for (const v of r.violations) {
      console.log(`   ${v.file}:${v.line}${v.detail ? `  [${v.detail}]` : ""}`);
      console.log(`      ${v.text}`);
    }
    console.log(`   fix: ${r.fix}`);
    console.log("");
  }
  const tally = report.results
    .filter((r) => r.violations.length)
    .map((r) => `${r.id}=${r.violations.length}`)
    .join("  ");
  console.log(`total: ${report.total} violation(s) across ${report.results.filter((r) => r.violations.length).length} rule(s)`);
  console.log(`       ${tally}`);
  console.log(`waivers honoured: ${report.waivers}  (each is a rule deliberately not enforced — review them)`);
  console.log(`\nwaive one with a comment on the preceding line: // rules-allow: <rule-id> — <reason>`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
