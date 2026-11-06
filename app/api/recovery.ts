import { get, put } from "@vercel/blob"
import { createPublicClient, hashMessage, http, isAddress, isHex, parseAbi, type Address, type Hex } from "viem"
import { recoveryMessage, type RecoveryRecord } from "../src/lib/recovery-format"

/**
 * Face ID recovery blobs. Each record is the Falcon seed AES-GCM-encrypted under a key only the user's passkey can
 * derive (WebAuthn PRF), so this store only ever holds ciphertext.
 *
 * GET ?id=<sha-256 of the credential id>  -> the record, or 404
 * PUT { id, record, ts, signature }       -> stores it, if `signature` is the account's current Falcon key signing
 *                                            recoveryMessage(...), checked by the account itself through ERC-1271.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

const ERC1271_MAGIC = "0x1626ba7e"
const MAX_SKEW_MS = 5 * 60 * 1000
const erc1271 = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"])
const path = (id: string) => `recovery/${id}.json`
const validId = (id: unknown): id is Hex => typeof id === "string" && /^0x[0-9a-f]{64}$/.test(id)

async function readRecord(id: Hex): Promise<RecoveryRecord | null> {
  const blob = await get(path(id), { access: "private", useCache: false })
  if (!blob || blob.statusCode !== 200) return null
  return JSON.parse(await new Response(blob.stream).text()) as RecoveryRecord
}

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id")
  if (!validId(id)) return json({ error: "id must be a 32-byte hex hash" }, 400)
  const record = await readRecord(id)
  return record ? json({ record }) : json({ error: "no recovery record for this passkey" }, 404)
}

export async function PUT(request: Request): Promise<Response> {
  let body: { id?: unknown; record?: RecoveryRecord; ts?: unknown; signature?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: "expected a JSON body" }, 400)
  }
  const { id, record, ts, signature } = body
  if (!validId(id)) return json({ error: "id must be a 32-byte hex hash" }, 400)
  if (!record || record.v !== 1 || !isAddress(record.account) || !isHex(record.iv) || !isHex(record.ct)) {
    return json({ error: "malformed record" }, 400)
  }
  if (typeof ts !== "number" || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return json({ error: "stale or missing timestamp" }, 400)
  if (!isHex(signature)) return json({ error: "signature must be hex" }, 400)

  const existing = await readRecord(id)
  if (existing && existing.account.toLowerCase() !== record.account.toLowerCase()) {
    return json({ error: "this passkey already recovers a different account" }, 409)
  }

  const client = createPublicClient({ transport: http(process.env.QPAY_NODE_RPC ?? "https://altmempool.forshtat.com") })
  const magic = await client
    .readContract({
      address: record.account as Address,
      abi: erc1271,
      functionName: "isValidSignature",
      args: [hashMessage(recoveryMessage(id, record, ts)), signature],
    })
    .catch(() => null)
  if (magic !== ERC1271_MAGIC) return json({ error: "the account's Falcon key didn't sign this" }, 401)

  await put(path(id), JSON.stringify(record), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" })
  return json({ ok: true })
}
