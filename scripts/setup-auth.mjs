// Build-time auth bootstrap — so a cloner NEVER touches Convex env for login.
// Runs only when CONVEX_DEPLOY_KEY is present (i.e. a real clone build); the
// deploy key lets us set the deployment's env. Idempotent: generates the
// @convex-dev/auth JWT keys once and skips if they already exist (so sessions
// aren't invalidated on every deploy).
//
// SAFETY: env-set failures are caught + reported WITHOUT echoing the command
// (the command contains the private key — an uncaught execFileSync error would
// dump it into the build log). Permission failures (403
// WriteEnvironmentVariables — deploy key isn't a production key, or its
// creator isn't a Convex admin/Project Admin) do NOT fail the build: the site
// goes live and /setup walks the owner through fixing the key.
import { execFileSync } from "node:child_process";

if (!process.env.CONVEX_DEPLOY_KEY) {
  console.log("[setup-auth] no CONVEX_DEPLOY_KEY — skipping (demo/local).");
  process.exit(0);
}

const bunx = (args, capture = false) =>
  execFileSync("bunx", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "ignore"] : "inherit",
  });

function envGet(name) {
  try {
    return bunx(["convex", "env", "get", name], true).trim();
  } catch {
    return "";
  }
}

// Set one env var. Never rethrows, never prints the value — only convex's own
// error lines (which contain no secret).
function envSet(pair, label) {
  try {
    execFileSync("bunx", ["convex", "env", "set", pair], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (e) {
    const out = `${e.stdout || ""}${e.stderr || ""}`;
    const denied = /403|Unauthorized|WriteEnvironmentVariables/i.test(out);
    console.error(
      `[setup-auth] ✖ gagal set ${label}${denied ? " — deploy key tidak punya izin tulis env (WriteEnvironmentVariables)" : ""}`,
    );
    const firstLines = out.trim().split("\n").slice(0, 2).join("\n");
    if (firstLines) console.error(firstLines);
    return false;
  }
}

// The app's public origin, propagated to the Convex deployment so the
// backend can emit correct OAuth discovery documents. Convex knows its own
// origin (CONVEX_SITE_URL, injected automatically) but has no way to learn
// the FRONTEND's domain — this build step is the only place both are visible.
//
// Deliberately runs BEFORE the JWT idempotency check below: keys are minted
// once, but the site URL has to be refreshed on EVERY deploy. Adding a custom
// domain after first deploy used to leave SITE_URL pinned to the original
// *.vercel.app forever, silently breaking the ChatGPT connector's issuer check.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "");

if (site && envGet("SITE_URL") !== site) {
  if (envSet(`SITE_URL=${site}`, "SITE_URL")) console.log(`[setup-auth] SITE_URL -> ${site}`);
}

if (envGet("JWT_PRIVATE_KEY")) {
  console.log("[setup-auth] JWT keys already set — skip keygen.");
  process.exit(0);
}

console.log("[setup-auth] generating auth keys…");
// Same format as `npx @convex-dev/auth` (jose RS256, newlines → spaces).
const { generateKeyPair, exportPKCS8, exportJWK } = await import("jose");
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const jwk = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...jwk }] });

// NAME=value form: the value starts with "-----BEGIN", which the CLI would else
// parse as a flag. JWT_PRIVATE_KEY + JWKS must land as a PAIR (same keygen);
// if the first set succeeds but the second fails, roll the first back so the
// idempotency check above doesn't lock in a broken half-pair.
let ok = envSet(`JWT_PRIVATE_KEY=${privateKey}`, "JWT_PRIVATE_KEY");
if (ok) {
  ok = envSet(`JWKS=${jwks}`, "JWKS");
  if (!ok) {
    try { bunx(["convex", "env", "remove", "JWT_PRIVATE_KEY"], true); } catch { /* best effort */ }
  }
}

if (!ok) {
  console.error(`
[setup-auth] ──────────────────────────────────────────────────────────
  Kunci login TIDAK terpasang. Penyebab paling umum:
   1. Deploy key kamu tidak mencentang capability env — di UI deploy key
      Convex terbaru, pastikan key punya: deployment:deploy +
      deployment:env:view + deployment:env:write (atau pilih full access).
      Generate: dashboard.convex.dev → project → Production → Settings →
      Deploy Keys.
   2. Akun pembuat key bukan admin / Project Admin di team Convex itu.
  Build TETAP dilanjutkan — situs akan live, tapi daftar/login owner
  gagal sampai key diganti di Vercel lalu Redeploy.
  Buka /setup di situsmu — halaman itu memandu langkah perbaikannya.
──────────────────────────────────────────────────────────────────────`);
  process.exit(0);
}
console.log("[setup-auth] auth keys provisioned ✔");
