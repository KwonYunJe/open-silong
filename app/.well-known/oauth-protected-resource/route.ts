import { NextResponse } from "next/server";
import { mcpUrl } from "@/shared/lib/siteUrl";
import { requestOrigin } from "@/shared/lib/siteUrl.server";

/** RFC 9728 OAuth 2.0 Protected Resource Metadata.
 *  Tells ChatGPT which authorization server protects the MCP endpoint. */

// Per-host for the same reason as the authorization-server document: the
// advertised `authorization_servers` entry must match the issuer the client
// will actually see. Opted out of prerendering by requestOrigin()'s
// headers() read — `export const dynamic` is rejected under cacheComponents.

export async function GET() {
  const site = await requestOrigin();
  const resource = mcpUrl();
  const metadata = {
    // `resource` is derived from NEXT_PUBLIC_CONVEX_URL; when the backend
    // origin is unknown the endpoint lives under the app itself.
    resource: resource ?? `${site}/mcp`,
    authorization_servers: [site],
    scopes_supported: ["mcp.read", "mcp.write"],
    bearer_methods_supported: ["header"],
  };
  return NextResponse.json(metadata, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
