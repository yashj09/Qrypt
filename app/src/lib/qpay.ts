import { createPublicClient, erc20Abi, http, keccak256, zeroAddress, type Address, type Hex } from "viem"
import { falconFromSeed } from "@qpay/falcon"
import {
  buildWalletTx,
  defaultGas,
  erc20Transfer,
  bytesToHex,
  frameTxHash,
  hexToBytes,
  signQPay,
  submitAlt,
  submitCanonical,
  submitStock,
  altStatus,
  type Call,
  type Endpoints,
  type FrameLabel,
  type Verdict,
} from "@qpay/frametx"
import type { FrameTx } from "@forshtat/hegota-support/tx"
import type { UniswapDeployment } from "@/lib/uniswap-v4"
import { WorldIdError, worldRequest, type ProveHuman } from "@/lib/world"
import { API_BASE, NODE_RPC } from "@/lib/site"
import { keyStore } from "@/lib/keystore"

/** All three RPCs allow any origin, so the browser calls them directly. Override at build time with VITE_*_RPC. */
export const endpoints: Endpoints = {
  node: NODE_RPC,
  altMempool: import.meta.env.VITE_ALT_RPC ?? "http://127.0.0.1:14337/rpc/",
  stockAltMempool: import.meta.env.VITE_STOCK_RPC ?? "https://altmempoolgateway.forshtat.com/rpc",
}

/** Points the wallet at the alt mempool the server currently advertises; keeps the built-in default on any failure. */
export async function applyRemoteConfig(timeoutMs = 3000) {
  try {
    const res = await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(timeoutMs) })
    const cfg = (await res.json()) as { altMempool?: string | null }
    if (cfg.altMempool) endpoints.altMempool = cfg.altMempool
  } catch {
    // Offline or an old deployment without /api/config: the build-time endpoint stands.
  }
}

export interface Deployment {
  chainId: number
  verifier: Address
  usdc: Address
  paymaster: Address
  factory: Address
  keyConverter: Address
  usdcPerEth: string
  stakingRegistry: Address
  tokens: { address: Address; symbol: string; name: string; decimals: number }[]
  /** Qrypt's Uniswap v4 deployment and pools (scripts/deploy-uniswap.ts). */
  uniswap?: UniswapDeployment
}

const deployments = import.meta.glob<Deployment>("../../../deployments/[0-9]*.json", { eager: true, import: "default" })

export const client = createPublicClient({ transport: http(endpoints.node) })

export async function loadDeployment(): Promise<Deployment> {
  const chainId = await client.getChainId()
  const d = Object.values(deployments).find((x) => x.chainId === chainId)
  if (!d) throw new Error(`No deployment for chain ${chainId}. Run pnpm setup.`)
  return d
}

const accountKey = (d: Deployment) => `qpay.account.${d.chainId}.${d.factory.toLowerCase()}`

export const newSeed = (): Hex => bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
export const signerFromSeed = (seed: Hex) => falconFromSeed(hexToBytes(seed))

/** The seed in the active key store, creating one on first use. The private key never leaves the device. */
export async function ensureSeed(): Promise<Hex> {
  const existing = await keyStore().seed()
  if (existing) return existing
  const seed = newSeed()
  await keyStore().save(seed)
  return seed
}

export class WalletLockedError extends Error {
  constructor() {
    super("The wallet is locked. Unlock it to sign.")
  }
}

/** A Falcon signer for the active key store's seed; throws if the store is locked or empty. */
export async function signer() {
  const seed = await keyStore().seed()
  if (!seed) throw new WalletLockedError()
  return signerFromSeed(seed)
}

export const storedAccount = (d: Deployment) => localStorage.getItem(accountKey(d)) as Address | null
export const storeAccount = (d: Deployment, account: Address) => localStorage.setItem(accountKey(d), account)

/** The verifier's NTT-domain form of a Falcon key, computed by the converter contract in a free read call. */
export const nttKeyOf = (d: Deployment, seed: Hex): Promise<Hex> =>
  client.readContract({
    address: d.keyConverter,
    abi: converterAbi,
    functionName: "toNttKey",
    args: [bytesToHex(signerFromSeed(seed).publicKeyCoeffs)],
  })

export async function forgetAccount(d: Deployment) {
  localStorage.removeItem(accountKey(d))
  await keyStore().clear()
}

const converterAbi = [
  {
    type: "function",
    name: "toNttKey",
    stateMutability: "pure",
    inputs: [{ name: "coeffKey", type: "bytes" }],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const

const factoryAbi = [
  { type: "function", name: "accountOf", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "address" }] },
] as const

export type OnboardStage = "key" | "register" | "human" | "deploy"

/**
 * Converts this browser's Falcon key to the verifier's NTT form (free eth_call) and asks the onboarding service for
 * an account. A new sponsored account needs a World ID Proof of Human bound to the key (`proveHuman`); a key the
 * factory already knows (a restore) skips it.
 */
export async function createAccount(
  d: Deployment,
  onStage: (stage: OnboardStage) => void = () => {},
  proveHuman?: ProveHuman,
): Promise<Address> {
  onStage("key")
  const seed = await ensureSeed()
  onStage("register")
  const pubkey = await client.readContract({
    address: d.keyConverter,
    abi: converterAbi,
    functionName: "toNttKey",
    args: [bytesToHex(signerFromSeed(seed).publicKeyCoeffs)],
  })
  const keyHash = keccak256(pubkey)
  const existing = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "accountOf", args: [keyHash] })
  let world: unknown
  if (existing === zeroAddress) {
    const request = await worldRequest()
    if (request) {
      if (!proveHuman) throw new Error("Creating a sponsored account needs World ID, which this screen can't open.")
      onStage("human")
      world = await proveHuman(request, keyHash)
    }
  }
  onStage("deploy")
  const res = await fetch(`${API_BASE}/api/onboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pubkey, factory: d.factory, world }),
  })
  const body = (await res.json().catch(() => ({}))) as { account?: Address; error?: string; code?: string }
  if (!res.ok || !body.account) throw body.code ? new WorldIdError(body.code) : new Error(body.error ?? `onboarding failed (${res.status})`)
  localStorage.setItem(accountKey(d), body.account)
  return body.account
}

export interface Balances {
  eth: bigint
  usdc: bigint
  stake: bigint
  nonce: number
}

const registryAbi = [
  {
    type: "function",
    name: "getDepositInfo",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "stake", type: "uint256" },
      { name: "unstakeDelaySec", type: "uint32" },
      { name: "withdrawTime", type: "uint64" },
    ],
  },
] as const

export async function readBalances(d: Deployment, who: Address): Promise<Balances> {
  const [eth, usdc, deposit, nonce] = await Promise.all([
    client.getBalance({ address: who }),
    client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
    client.readContract({ address: d.stakingRegistry, abi: registryAbi, functionName: "getDepositInfo", args: [who] }),
    client.getTransactionCount({ address: who }),
  ])
  return { eth, usdc, stake: deposit[0], nonce }
}

export const usdcBalance = (d: Deployment, who: Address) =>
  client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] })

export type { Call, FrameLabel }

export type Scenario = "send" | "tamper" | "underpay"

export interface Prepared {
  tx: FrameTx
  hash: Hex
  fee: bigint
  signMs: number
  frames: FrameLabel[]
}

const FEE_CAPS = { maxFeePerGas: 3_000_000n, maxPriorityFeePerGas: 2_000_000n }

export interface CallOptions {
  /** One EIP-8141 atomic batch: if any call reverts, they all do. */
  atomic?: boolean
}

/** The paymaster's quote depends only on the frames' gas limits and the fee caps, so nothing is signed. */
export const estimateFee = (d: Deployment, account: Address, calls: Call[], opts: CallOptions = {}): bigint =>
  buildWalletTx({ ...txBase(d, account, 0n), calls, atomic: opts.atomic }).fee

const txBase = (d: Deployment, account: Address, nonceSeq: bigint) => ({
  chainId: BigInt(d.chainId),
  account,
  paymaster: d.paymaster,
  usdc: d.usdc,
  nonceSeq,
  ...FEE_CAPS,
  usdcPerEth: BigInt(d.usdcPerEth),
})

export const usdcPayment = (d: Deployment, recipient: Address, amount: bigint): Call => ({
  to: d.usdc,
  data: erc20Transfer(recipient, amount),
  label: "Payment",
  gas: defaultGas.transfer,
})

/** Builds and Falcon-signs a transaction for `calls`. The stress-test scenarios break it in one specific way. */
export async function prepareCalls(
  d: Deployment,
  account: Address,
  calls: Call[],
  scenario: Scenario = "send",
  opts: CallOptions = {},
): Promise<Prepared> {
  const base = { ...txBase(d, account, BigInt(await client.getTransactionCount({ address: account }))), atomic: opts.atomic }
  const quoted = buildWalletTx({ ...base, calls })
  const { tx, fee, frames } = scenario === "underpay" ? buildWalletTx({ ...base, calls, feeOverride: quoted.fee / 10n }) : quoted
  const falcon = await signer()
  const started = performance.now()
  let signed = await signQPay(tx, (digest) => falcon.sign(digest))
  const signMs = performance.now() - started
  if (scenario === "tamper") {
    const sig = hexToBytes(signed.signatures[0].signature)
    sig[100] ^= 0x01
    signed = { ...signed, signatures: [{ ...signed.signatures[0], signature: bytesToHex(sig) }] }
  }
  return { tx: signed, hash: frameTxHash(signed), fee, signMs, frames }
}

export const toCanonical = (p: Prepared): Promise<Verdict> => submitCanonical(endpoints, p.tx)
export const toStock = (p: Prepared): Promise<Verdict> => submitStock(endpoints, p.tx)
export const toAlt = (p: Prepared): Promise<Verdict> => submitAlt(endpoints, p.tx)
export const statusOf = (hash: Hex, via: "alt" | "stock" = "alt") =>
  altStatus(endpoints, hash, via === "stock" ? endpoints.stockAltMempool : endpoints.altMempool)

export interface Inclusion {
  block: bigint
  frameGas: bigint[]
}

/** Per-frame execution gas from the onchain receipt (ethrex adds `frameReceipts` to frame transaction receipts). */
export async function inclusion(hash: Hex): Promise<Inclusion> {
  const r = (await client.request({ method: "eth_getTransactionReceipt" as never, params: [hash] as never })) as {
    blockNumber: Hex
    frameReceipts: { gasUsed: Hex }[]
  }
  return { block: BigInt(r.blockNumber), frameGas: r.frameReceipts.map((f) => BigInt(f.gasUsed)) }
}
