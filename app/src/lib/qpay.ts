import { createPublicClient, erc20Abi, http, type Address, type Hex } from "viem"
import { falconFromSeed } from "@qpay/falcon"
import {
  buildQPayTx,
  bytesToHex,
  frameTxHash,
  hexToBytes,
  signQPay,
  submitAlt,
  submitCanonical,
  altStatus,
  type Endpoints,
  type Verdict,
} from "@qpay/frametx"
import type { FrameTx } from "@forshtat/hegota-support/tx"

/** Both RPCs go through the Vite dev server proxy (see vite.config.ts), so the browser never needs CORS. */
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin
export const endpoints: Endpoints = { node: `${origin}/node`, altMempool: `${origin}/alt` }

export interface Deployment {
  chainId: number
  verifier: Address
  usdc: Address
  paymaster: Address
  account: Address
  usdcPerEth: string
  stakingRegistry: Address
}

const deployments = import.meta.glob<Deployment>("../../../deployments/[0-9]*.json", { eager: true, import: "default" })
const seeds = import.meta.glob<string>("../../../.qpay/falcon-seed.hex", { eager: true, query: "?raw", import: "default" })

export const client = createPublicClient({ transport: http(endpoints.node) })

export async function loadDeployment(): Promise<Deployment> {
  const chainId = await client.getChainId()
  const d = Object.values(deployments).find((x) => x.chainId === chainId)
  if (!d) throw new Error(`No deployment for chain ${chainId}. Run pnpm setup.`)
  return d
}

/** The demo account's Falcon key. Signing happens in this browser tab; the seed never goes over the network. */
export function demoSigner() {
  const seed = Object.values(seeds)[0]
  if (!seed) throw new Error("No Falcon seed in .qpay/. Run pnpm setup.")
  return falconFromSeed(hexToBytes(seed.trim() as Hex))
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

export async function readBalances(d: Deployment, who: Address = d.account): Promise<Balances> {
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

export type Scenario = "send" | "tamper" | "underpay"

export interface Prepared {
  tx: FrameTx
  hash: Hex
  fee: bigint
  signMs: number
}

export async function prepare(d: Deployment, recipient: Address, amount: bigint, scenario: Scenario): Promise<Prepared> {
  const nonceSeq = BigInt(await client.getTransactionCount({ address: d.account }))
  const quoted = buildQPayTx({
    chainId: BigInt(d.chainId),
    account: d.account,
    paymaster: d.paymaster,
    usdc: d.usdc,
    recipient,
    amount,
    nonceSeq,
    maxFeePerGas: 3_000_000n,
    maxPriorityFeePerGas: 2_000_000n,
    usdcPerEth: BigInt(d.usdcPerEth),
  })
  const { tx, fee } =
    scenario === "underpay"
      ? buildQPayTx({
          chainId: BigInt(d.chainId),
          account: d.account,
          paymaster: d.paymaster,
          usdc: d.usdc,
          recipient,
          amount,
          nonceSeq,
          maxFeePerGas: 3_000_000n,
          maxPriorityFeePerGas: 2_000_000n,
          usdcPerEth: BigInt(d.usdcPerEth),
          feeOverride: quoted.fee / 10n,
        })
      : quoted
  const signer = demoSigner()
  const started = performance.now()
  let signed = await signQPay(tx, (digest) => signer.sign(digest))
  const signMs = performance.now() - started
  if (scenario === "tamper") {
    const sig = hexToBytes(signed.signatures[0].signature)
    sig[100] ^= 0x01
    signed = { ...signed, signatures: [{ ...signed.signatures[0], signature: bytesToHex(sig) }] }
  }
  return { tx: signed, hash: frameTxHash(signed), fee, signMs }
}

export const toCanonical = (p: Prepared): Promise<Verdict> => submitCanonical(endpoints, p.tx)
export const toAlt = (p: Prepared): Promise<Verdict> => submitAlt(endpoints, p.tx)
export const statusOf = (hash: Hex) => altStatus(endpoints, hash)
