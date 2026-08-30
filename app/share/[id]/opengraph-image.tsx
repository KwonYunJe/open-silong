import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { siteUrlFromEnv } from "@/shared/lib/siteUrl";

export const alt = "Shared via Silong";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: Promise<{ id: string }>;
}

/** Host shown in the OG card footer — this deployment's own domain, never
 *  a baked-in one. Falls back to the product name when env is unset. */
const brandHost = (() => {
  const u = siteUrlFromEnv();
  if (!u) return "Silong";
  try { return new URL(u).host; } catch { return "Silong"; }
})();

export default async function OG({ params }: Props) {
  const { id } = await params;
  let title = "Shared on Silong";
  let icon = "📄";
  let cover: string | null = null;
  try {
    const p = await fetchQuery(api.pages.getPublicShare, { id });
    if (p) {
      title = p.title || "Untitled";
      icon = p.icon || "📄";
      cover = p.cover ?? null;
    }
  } catch {
    /* fall through to defaults — never fail the og endpoint */
  }

  // Strip lucide:Name?c=hex form down to the leading bare emoji or fall back
  // to 📄. ImageResponse can't render lucide SVG components.
  const displayIcon = icon.startsWith("lucide:") ? "📄" : icon.split("?")[0];

  const bg = cover && cover.startsWith("linear-gradient")
    ? cover
    : "linear-gradient(135deg, #0f172a, #1e293b)";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif",
          background: bg,
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 28, opacity: 0.7, letterSpacing: 4, textTransform: "uppercase" }}>
            Silong
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 120, lineHeight: 1 }}>{displayIcon}</div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              maxWidth: "90%",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.6 }}>
          {brandHost}
        </div>
      </div>
    ),
    size,
  );
}
