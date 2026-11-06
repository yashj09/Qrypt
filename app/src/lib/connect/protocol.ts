/**
 * The wallet's side of EIP-1193, shared by every way a dapp can reach it. Reads never need approval and go straight
 * to the node; these methods open the approval page.
 */
export const APPROVAL_METHODS = ["eth_requestAccounts", "eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"] as const
export type ApprovalMethod = (typeof APPROVAL_METHODS)[number]

export const isApprovalMethod = (m: string): m is ApprovalMethod => (APPROVAL_METHODS as readonly string[]).includes(m)

export interface EyrieRequest {
  id: string
  /** Set by the browser (postMessage) or the extension (sender tab), never taken from the dapp's payload. */
  origin: string
  method: ApprovalMethod
  params: unknown[]
}

export interface RpcError {
  code: number
  message: string
}

export type EyrieResponse = { id: string; result: unknown } | { id: string; error: RpcError }

/** Messages between a dapp page and the approval popup it opened. */
export type PopupMessage =
  | { type: "eyrie:ready" }
  | { type: "eyrie:request"; request: Omit<EyrieRequest, "origin"> }
  | { type: "eyrie:response"; response: EyrieResponse }

export const USER_REJECTED: RpcError = { code: 4001, message: "User rejected the request." }
export const UNSUPPORTED_CHAIN: RpcError = { code: 4902, message: "Eyrie only runs on the EIP-8141 devnet (chain 1337)." }

export const CHAIN_ID = 1337
export const CHAIN_ID_HEX = "0x539"
