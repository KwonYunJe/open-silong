/** Where is this deployment actually served from?
 *
 *  open-silong is meant to be one-click cloned to Vercel, so the domain is
 *  NOT known at author time and MUST NOT be hard-coded. Every absolute URL
 *  the app emits — OAuth discovery documents, the MCP endpoint shown in
 *  Settings, sitemap entries, share links, OG images — resolves through here.
 *
 *  A wrong value is not cosmetic: the RFC 8414 / RFC 9728 discovery documents
 *  must report the origin the request is actually served on, or ChatGPT's
 *  connector flow rejects the issuer and the whole MCP integration fails.
 *
 *  Nothing here requires the cloner to set anything. `NEXT_PUBLIC_SITE_URL`
 *  exists only as an override for people fronting the app with their own
 *  proxy or a custom domain that Vercel does not know about.
 */

const strip = (u: string) => u.replace(/\/+$/, "");
const withProto = (h: string) => (/^https?:\/\//.test(h) ? h : `https://${h}`);
const clean = (u: string) => strip(withProto(u.trim()));

/** Origin from build/runtime env, in precedence order, or `null` if none is
 *  set. Safe on server and client — `NEXT_PUBLIC_*` are inlined at build.
 *
 *  Vercel injects `VERCEL_PROJECT_PRODUCTION_URL` (the stable production
 *  domain) and `VERCEL_URL` (unique per deployment) automatically, so a
 *  clone resolves correctly with zero configuration. */
export function siteUrlFromEnv(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return clean(explicit);

  const prod =
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return clean(prod);

  const deployment = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (deployment) return clean(deployment);

  return null;
}

/** The app's own origin, client-safe.
 *
 *  In the browser `window.location.origin` is ground truth — it is the domain
 *  the user is actually on, whatever the deploy is called — so it wins over
 *  env unless an explicit `NEXT_PUBLIC_SITE_URL` override is set. */
export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return clean(process.env.NEXT_PUBLIC_SITE_URL);
  if (typeof window !== "undefined") return strip(window.location.origin);
  return siteUrlFromEnv() ?? "http://localhost:3000";
}

/** The Convex HTTP-actions origin — where `httpAction` routes (MCP, auth
 *  callbacks, webhooks) are served.
 *
 *  Derived from `NEXT_PUBLIC_CONVEX_URL`, which `build:auto` injects during
 *  the Convex deploy, so this too needs no configuration:
 *    - Convex Cloud serves queries on `<name>.convex.cloud` and httpActions
 *      on `<name>.convex.site`.
 *    - Self-hosted deploys conventionally front the same split as `api-*`
 *      and `site-*` subdomains (see DEPLOY.md).
 *  Returns `null` when `NEXT_PUBLIC_CONVEX_URL` is unset, so callers can
 *  render a "not configured yet" state instead of a plausible wrong URL. */
export function convexSiteOrigin(): string | null {
  const convex = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convex) return null;
  const base = clean(convex);
  if (base.endsWith(".convex.cloud")) return base.replace(/\.convex\.cloud$/, ".convex.site");
  // self-hosted: https://api-foo.example.com -> https://site-foo.example.com
  const selfHosted = base.replace(/^(https?:\/\/)api-/, "$1site-");
  if (selfHosted !== base) return selfHosted;
  // Single-origin self-host (httpActions on the same host as queries).
  return base;
}

/** Absolute URL of the MCP endpoint, or `null` when the backend origin is
 *  not known yet. `NEXT_PUBLIC_MCP_URL` overrides for unusual routings. */
export function mcpUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_MCP_URL;
  if (explicit) return strip(explicit.trim());
  const origin = convexSiteOrigin();
  return origin ? `${origin}/mcp` : null;
}
