import type { Address, Hex } from "viem"
import type { Verdict } from "@qpay/frametx"
import type { Call, FrameLabel, Inclusion, Scenario } from "@/lib/qpay"
import type { Asset } from "@/lib/assets"

export type MempoolKey = "canonical" | "stock" | "alt"

export const MEMPOOLS: { key: MempoolKey; name: string; rule: string }[] = [
  { key: "canonical", name: "Canonical mempool", rule: "EIP-8141 defaults · 100k VERIFY cap" },
  { key: "stock", name: "Hosted alt mempool", rule: "Organisers' ERC-8421 node · limits lifted" },
  { key: "alt", name: "Qrypt alt mempool", rule: "ERC-8421 BUDGET-010 · 1M gas for staked entities" },
]

export interface SwapIntent {
  from: Asset
  to: Asset
  amountIn: bigint
  minOut: bigint
  route: string
}

/** What the user asked for: a title for humans, the calls for the chain, and the transfer or swap to watch, if any. */
export interface Intent {
  title: string
  calls: Call[]
  transfer?: { asset: Asset; recipient: Address; amount: bigint }
  swap?: SwapIntent
  /** Run the calls as one atomic batch (all or nothing). */
  atomic?: boolean
}

export interface Run {
  scenario: Scenario
  hash: Hex
  title: string
  transfer?: Intent["transfer"]
  swap?: SwapIntent
  atomic?: boolean
  frames: FrameLabel[]
  fee: bigint
  signMs: number
  at: number
  verdicts: Partial<Record<MempoolKey, Verdict>>
  via?: "alt" | "stock"
  status?: string
  /** Balance changes after inclusion. `gasEth` is the sender's ETH change not explained by an ETH transfer. */
  delta?: { recipient?: bigint; paymaster: bigint; gasEth: bigint; swapReceived?: bigint }
  included?: Inclusion
}

export type RunPhase = "submitting" | "pending" | "included" | "rejected" | "reverted" | "dropped"

export function runPhase(r: Run): RunPhase {
  if (r.status === "OnChain") return "included"
  if (r.status === "Reverted") return "reverted"
  if (r.status === "Cancelled") return "dropped"
  const answered = MEMPOOLS.every((m) => r.verdicts[m.key])
  const admitted = MEMPOOLS.some((m) => r.verdicts[m.key]?.accepted)
  if (answered && !admitted) return "rejected"
  return admitted ? "pending" : "submitting"
}

export const PHASE_BADGE: Record<RunPhase, { label: string; variant: "success" | "destructive" | "outline" }> = {
  submitting: { label: "Submitting", variant: "outline" },
  pending: { label: "Pending", variant: "outline" },
  included: { label: "Complete", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  reverted: { label: "Reverted", variant: "destructive" },
  dropped: { label: "Dropped", variant: "destructive" },
}

export const SCENARIO_LABEL: Record<Scenario, string> = {
  send: "Payment",
  tamper: "Tampered signature",
  underpay: "Underpaid fee",
}

/** What the activity list keeps between visits. */
export interface ActivityEntry {
  hash: Hex
  scenario: Scenario
  title: string
  phase: RunPhase
  via?: "alt" | "stock"
  block?: string
  at: number
}

export const toActivity = (r: Run): ActivityEntry => ({
  hash: r.hash,
  scenario: r.scenario,
  title: r.title,
  phase: runPhase(r),
  via: r.via,
  block: r.included?.block.toString(),
  at: r.at,
})

const activityKey = (account: Address) => `qpay.activity.${account.toLowerCase()}`

export function loadActivity(account: Address): ActivityEntry[] {
  try {
    return JSON.parse(localStorage.getItem(activityKey(account)) ?? "[]") as ActivityEntry[]
  } catch {
    return []
  }
}

export function saveActivity(account: Address, entries: ActivityEntry[]) {
  localStorage.setItem(activityKey(account), JSON.stringify(entries.slice(0, 20)))
}
