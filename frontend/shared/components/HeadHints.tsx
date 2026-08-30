/** Connection hints for PWA / cold-start performance.
 *
 *  Renders `<link rel="dns-prefetch">` + `<link rel="preconnect">`
 *  for the Convex backend. Env-driven — no hardcoded host.
 *  Emitted from a Server Component so Next 16's React tree hoists
 *  them into `<head>` automatically.
 */

// No fallback host: preconnecting to a domain this deployment does not use
// costs a wasted DNS+TLS handshake on every cold load. Unset => emit nothing.
const convexHost = (() => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();

export function HeadHints() {
  if (!convexHost) return null;
  return (
    <>
      <link rel="dns-prefetch" href={convexHost} />
      <link rel="preconnect" href={convexHost} crossOrigin="anonymous" />
    </>
  );
}
