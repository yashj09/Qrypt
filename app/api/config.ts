/**
 * GET -> the endpoints a wallet should use right now. The extension reads this at startup, so restarting the tunnel
 * in front of our sidecar (which changes its URL) doesn't mean rebuilding or reinstalling the extension.
 */
export function GET(): Response {
  return new Response(
    JSON.stringify({
      altMempool: process.env.VITE_ALT_RPC ?? null,
      node: process.env.QPAY_NODE_RPC ?? "https://altmempool.forshtat.com",
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  )
}
