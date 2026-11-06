import { createPublicClient, hashMessage, http, isHex, parseAbi, type Address } from "viem"

/** Shared by the API routes that let an account write to our store: no passwords, the account's own Falcon key signs. */

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

const ERC1271_MAGIC = "0x1626ba7e"
const MAX_SKEW_MS = 5 * 60 * 1000
const erc1271 = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"])

export const freshTimestamp = (ts: unknown): ts is number => typeof ts === "number" && Math.abs(Date.now() - ts) <= MAX_SKEW_MS

/** True if `account`'s current key signed EIP-191(message), checked by the account contract itself (ERC-1271). */
export async function accountSigned(account: Address, message: string, signature: unknown): Promise<boolean> {
  if (!isHex(signature)) return false
  const client = createPublicClient({ transport: http(process.env.QPAY_NODE_RPC ?? "https://altmempool.forshtat.com") })
  const magic = await client
    .readContract({ address: account, abi: erc1271, functionName: "isValidSignature", args: [hashMessage(message), signature] })
    .catch(() => null)
  return magic === ERC1271_MAGIC
}
