/** Is this the public showcase deployment?
 *
 *  Set `NEXT_PUBLIC_DEMO=1` only on the demo. A cloned or self-hosted site
 *  leaves it unset and gets the full product.
 *
 *  The demo is signed-up-to by strangers and shares ONE backend, so surfaces
 *  that hand out integration credentials or point at that shared backend are
 *  hidden there — not because the values are secret in themselves (the MCP
 *  endpoint is discoverable via `.well-known`), but because inviting an
 *  anonymous visitor to wire a real ChatGPT connector, mint bearer tokens, or
 *  register outbound webhooks against a throwaway shared deployment is a
 *  footgun for them and a spam vector for it.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
