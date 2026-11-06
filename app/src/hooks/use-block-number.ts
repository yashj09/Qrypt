import { useEffect, useState } from "react"
import { NODE_RPC } from "@/lib/site"

/** Latest devnet block via plain JSON-RPC, so the landing page doesn't pull in viem. */
export function useBlockNumber(intervalMs = 6000) {
  const [block, setBlock] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const tick = () =>
      fetch(NODE_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      })
        .then((r) => r.json())
        .then((r: { result?: string }) => alive && r.result && setBlock(Number(r.result)))
        .catch(() => {})
    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [intervalMs])
  return block
}
