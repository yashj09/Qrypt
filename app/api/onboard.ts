import { createPublicClient, createWalletClient, defineChain, http, isHex, keccak256, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const factoryAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [{ name: "nttPubkey", type: "bytes" }],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/**
 * POST { pubkey: 0x<1024-byte NTT-domain Falcon key>, factory: 0x… } -> { account }.
 * Deploys, stakes and funds a Q-Pay account for the key through QPayFactory, paid by a devnet-only operator key
 * (ONBOARD_KEY). Idempotent: the factory returns the existing account for a key it has seen.
 */
export async function POST(request: Request): Promise<Response> {
  const operatorKey = process.env.ONBOARD_KEY as Hex | undefined
  const rpc = process.env.QPAY_NODE_RPC ?? "https://altmempool.forshtat.com"
  if (!operatorKey) return json({ error: "onboarding is not configured (ONBOARD_KEY)" }, 500)

  let body: { pubkey?: string; factory?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: "expected a JSON body" }, 400)
  }
  const { pubkey, factory } = body
  if (!pubkey || !isHex(pubkey) || pubkey.length !== 2 + 2 * 1024) return json({ error: "pubkey must be 1024 bytes of hex" }, 400)
  if (!factory || !isHex(factory) || factory.length !== 42) return json({ error: "factory must be an address" }, 400)
  const allowed = process.env.QPAY_FACTORY?.toLowerCase()
  if (allowed && factory.toLowerCase() !== allowed) return json({ error: "unknown factory" }, 400)

  const probe = createPublicClient({ transport: http(rpc) })
  const chain = defineChain({
    id: await probe.getChainId(),
    name: "qpay-devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  })
  const client = createPublicClient({ chain, transport: http(rpc) })
  const key = keccak256(pubkey as Hex)
  const existing = await client.readContract({ address: factory as Address, abi: factoryAbi, functionName: "accountOf", args: [key] })
  if (existing !== "0x0000000000000000000000000000000000000000") return json({ account: existing, created: false })

  const wallet = createWalletClient({ chain, account: privateKeyToAccount(operatorKey), transport: http(rpc) })
  try {
    const hash = await wallet.writeContract({ address: factory as Address, abi: factoryAbi, functionName: "create", args: [pubkey as Hex] })
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== "success") return json({ error: `account creation reverted (${hash})` }, 502)
  } catch (err) {
    return json({ error: `account creation failed: ${(err as Error).message.split("\n")[0]}` }, 502)
  }
  const account = await client.readContract({ address: factory as Address, abi: factoryAbi, functionName: "accountOf", args: [key] })
  return json({ account, created: true })
}
