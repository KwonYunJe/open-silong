/** OAuth discovery metadata served at the MCP origin.
 *
 *  Per MCP authorization spec (2025-11-25 §protected-resource), the
 *  resource server MUST publish RFC 9728 protected-resource metadata at
 *  its OWN origin. The frontend (Next.js) also serves a copy at
 *  `${SITE}/.well-known/*` for clients that follow
 *  the WWW-Authenticate resource_metadata hint, but ChatGPT's first
 *  probe is at the MCP URL host — so this Convex-side copy is what
 *  prevents the "MCP server does not implement OAuth" error.
 *
 *  AS metadata is also re-served here as a safety net — some MCP
 *  clients fetch both well-knowns from the resource origin before
 *  checking the AS hint. */

import { httpAction } from "../_generated/server";

// open-silong is one-click cloned to arbitrary domains, so NEITHER origin
// may be hard-coded — a baked-in issuer fails the MCP client's issuer check
// on every deployment that is not the upstream one.
//
// MCP origin: Convex injects CONVEX_SITE_URL automatically, and httpActions
// (including this MCP router) are served from it. Zero configuration.
const MCP = process.env.MCP_URL ?? `${process.env.CONVEX_SITE_URL ?? ""}/mcp`;

// Frontend origin: the one value Convex cannot infer — it is a different
// host entirely. `scripts/setup-auth.mjs` writes it during the clone build
// from Vercel's VERCEL_PROJECT_PRODUCTION_URL, refreshed every deploy.
// Empty (rather than a wrong guess) when genuinely unset: an MCP client
// that sees a blank issuer fails loudly, whereas one pointed at somebody
// else's domain fails confusingly, and would send users there to log in.
const SITE = process.env.SITE_URL ?? "";

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });

/** RFC 9728. Declares which authorization server protects this MCP
 *  endpoint. ChatGPT custom-app fetches this to discover the AS. */
export const protectedResourceMetadata = httpAction(async () =>
  json({
    resource: MCP,
    authorization_servers: [SITE],
    scopes_supported: ["mcp.read", "mcp.write"],
    bearer_methods_supported: ["header"],
  }),
);

/** RFC 8414 AS metadata mirror. The canonical copy lives at SITE
 *  (Next.js route); this mirror exists because some MCP clients
 *  shortcut the AS lookup and fetch both well-knowns at the resource
 *  origin. Values must match the canonical copy. */
export const authorizationServerMetadata = httpAction(async () =>
  json({
    issuer: SITE,
    authorization_endpoint: `${SITE}/oauth/authorize`,
    token_endpoint: `${SITE}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp.read", "mcp.write"],
    resource_indicators_supported: true,
  }),
);
