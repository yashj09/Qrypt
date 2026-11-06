export const BRAND = "Eyrie"

export const NODE_RPC: string = import.meta.env.VITE_NODE_RPC ?? "https://altmempool.forshtat.com"

export const links = {
  repo: "https://github.com/yashj09/qpay",
  sidecarPr: "https://github.com/forshtat/mempool-workshop-sidecar/pull/2",
  safetyDoc: "https://github.com/yashj09/qpay/blob/main/docs/mempool-safety.md",
  contracts: "https://github.com/yashj09/qpay/tree/main/contracts/src",
  frametx: "https://github.com/yashj09/qpay/tree/main/packages/frametx",
  sidecarFork: "https://github.com/yashj09/mempool-workshop-sidecar/tree/budget-010",
}

export const explorerTx = (hash: string, node: string) =>
  `https://explorer.altmempool.wtf/tx/${hash}?node=${encodeURIComponent(node)}`

/** The first transaction proven end to end on the public devnet; numbers below are from its receipt. */
export const proof = {
  hash: "0x18bde9fdb212daad6c5f197d13e0e84d67766b92d56e5d4b4e399832b8ad9c3b",
  block: 726,
  explorer: explorerTx(
    "0x18bde9fdb212daad6c5f197d13e0e84d67766b92d56e5d4b4e399832b8ad9c3b",
    "https://altmempoolgateway.forshtat.com/rpc",
  ),
  falconGas: 724_211,
  feeUsdc: "0.017",
}

export const CANONICAL_VERIFY_CAP = 100_000n
export const STAKED_VERIFY_BUDGET = 1_000_000n

export interface FrameInfo {
  mode: "VERIFY" | "SENDER"
  name: string
  runsAs: string
  does: string
  /** From the proof transaction's receipt; replaced by live numbers after a send. */
  expectedGas: bigint
  canonicalIssue?: string
}

export const FRAMES: FrameInfo[] = [
  {
    mode: "VERIFY",
    name: "Falcon signature check",
    runsAs: "Your account",
    does: "Reads the signature hash and the 1,064-byte Falcon signature, checks it with the ZKNOX falcon8 verifier, approves execution.",
    expectedGas: 724_211n,
    canonicalIssue: "About 7x the 100k VERIFY cap",
  },
  {
    mode: "VERIFY",
    name: "USDC paymaster",
    runsAs: "Paymaster",
    does: "Checks the next frame repays at least the quoted fee in USDC and that you hold it, approves payment.",
    expectedGas: 27_922n,
    canonicalIssue: "Reads storage outside tx.sender",
  },
  {
    mode: "SENDER",
    name: "Repay gas in USDC",
    runsAs: "Your account",
    does: "usdc.transfer(paymaster, fee)",
    expectedGas: 25_012n,
  },
  {
    mode: "SENDER",
    name: "Payment",
    runsAs: "Your account",
    does: "usdc.transfer(recipient, amount)",
    expectedGas: 15_012n,
  },
]
