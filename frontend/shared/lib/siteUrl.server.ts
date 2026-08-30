import "server-only";
import { headers } from "next/headers";
import { siteUrlFromEnv } from "./siteUrl";

/** The origin THIS request is being served on.
 *
 *  Distinct from `siteUrl()` in one way that matters: it reads the request
 *  host. OAuth discovery documents (RFC 8414 / RFC 9728) must report the
 *  origin the client actually reached, not a canonical one — a preview
 *  deployment advertising the production issuer fails the connector's
 *  issuer check.
 *
 *  Precedence: explicit override → request host → Vercel env → localhost.
 *  Calling this opts the route out of static prerendering, which is correct
 *  for a per-host document. */
export async function requestOrigin(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* headers() unavailable (static context) — fall through to env */
  }

  return siteUrlFromEnv() ?? "http://localhost:3000";
}
