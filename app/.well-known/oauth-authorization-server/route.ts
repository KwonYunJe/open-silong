import { NextResponse } from "next/server";
import { requestOrigin } from "@/shared/lib/siteUrl.server";

/** RFC 8414 OAuth 2.0 Authorization Server Metadata.
 *  ChatGPT's connector form discovers these settings here so the admin
 *  can leave most fields blank and just paste the auth + token URLs.
 *  CIMD is not advertised (user-defined-client mode). DCR is not
 *  implemented — `registration_endpoint` is omitted. */

// Per-host, NOT prerendered. `issuer` must equal the origin the client
// actually reached or the connector rejects it, and open-silong is cloned to
// arbitrary domains — a baked-in issuer is wrong by construction.
// No `export const dynamic`: that segment config is rejected under
// `cacheComponents`. Reading headers() in requestOrigin() is what opts this
// route out of prerendering, which is the Cache Components way to say it.

export async function GET() {
  const site = await requestOrigin();
  const metadata = {
    issuer: site,
    authorization_endpoint: `${site}/oauth/authorize`,
    token_endpoint: `${site}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp.read", "mcp.write"],
    /** RFC 8707 — token can be scoped to the MCP endpoint. ChatGPT
     *  relies on this hint. */
    resource_indicators_supported: true,
  };
  return NextResponse.json(metadata, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
