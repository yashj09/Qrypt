import { decodeErrorResult, parseAbi, type Hex } from "viem";
import { rpc, toWire, explainRejection } from "@forshtat/hegota-support/rpc";
import type { FrameTx } from "@forshtat/hegota-support/tx";
import { rawTx } from "./qpay.ts";

export interface Endpoints {
  /** ethrex JSON-RPC: canonical mempool (`eth_sendRawTransaction`), state reads, simulation. */
  node: string;
  /** ERC-8421 sidecar JSON-RPC: the alternative mempool (`eth_sendFrameTransaction`). */
  altMempool: string;
  /** An unpatched ERC-8421 sidecar (flat 100k validation cap), to show what BUDGET-010 changes. */
  stockAltMempool?: string;
}

export type Verdict =
  | { mempool: Mempool; accepted: true; hash: Hex }
  | { mempool: Mempool; accepted: false; reason: string; rule: string };

export type Mempool = "canonical" | "stock" | "alt";

const QPAY_ERRORS = parseAbi([
  "error BadFalconSignature()",
  "error BadSignatureLength(uint256 length)",
  "error NotRepayFrame()",
  "error FeeTooLow(uint256 fee, uint256 quote)",
  "error InsufficientUsdc(uint256 balance, uint256 fee)",
]);

/** Appends the Q-Pay contract error behind a `reverted with data 0x…` rejection, e.g. `FeeTooLow(fee=1694, quote=16948)`. */
export function explainRevert(reason: string): string {
  const data = reason.match(/reverted with data (0x[0-9a-fA-F]{8,})/)?.[1] as Hex | undefined;
  if (!data) return reason;
  try {
    const { errorName, args } = decodeErrorResult({ abi: QPAY_ERRORS, data });
    const item = QPAY_ERRORS.find((e) => e.name === errorName)!;
    const named = (args ?? []).map((a, i) => `${item.inputs[i]?.name ?? i}=${a}`).join(", ");
    return `${reason.slice(0, reason.indexOf(data)).replace(/ with data $/, ": ")}${errorName}(${named})`;
  } catch {
    return reason;
  }
}

async function verdict(mempool: Verdict["mempool"], call: () => Promise<Hex>): Promise<Verdict> {
  try {
    return { mempool, accepted: true, hash: await call() };
  } catch (err) {
    const reason = explainRevert(err instanceof Error ? err.message : String(err));
    return { mempool, accepted: false, reason, rule: explainRejection(reason).rule };
  }
}

export const submitCanonical = (ep: Endpoints, tx: FrameTx) =>
  verdict("canonical", () => rpc(ep.node, "eth_sendRawTransaction", [rawTx(tx)]));

export const submitStock = (ep: Endpoints, tx: FrameTx) =>
  verdict("stock", () => {
    if (!ep.stockAltMempool) throw new Error("no stock alt mempool configured");
    return rpc(ep.stockAltMempool, "eth_sendFrameTransaction", [toWire(tx)]);
  });

export const submitAlt = (ep: Endpoints, tx: FrameTx) =>
  verdict("alt", () => rpc(ep.altMempool, "eth_sendFrameTransaction", [toWire(tx)]));

export const simulate = (ep: Endpoints, tx: FrameTx) =>
  rpc(ep.node, "ethrex_simulateFrameTransaction", [rawTx(tx), "latest", { trace: true }]);

export type AltStatus = "New" | "Pending" | "Submitted" | "OnChain" | "Reverted" | string;

export async function altStatus(ep: Endpoints, hash: Hex): Promise<AltStatus> {
  const res = await rpc(ep.altMempool, "skandha_frameTransactionStatus", [hash]);
  return typeof res === "string" ? res : (res?.status ?? JSON.stringify(res));
}

export async function waitForInclusion(ep: Endpoints, hash: Hex, timeoutMs = 90_000): Promise<AltStatus> {
  const deadline = Date.now() + timeoutMs;
  let status: AltStatus = "New";
  while (Date.now() < deadline) {
    status = await altStatus(ep, hash).catch(() => status);
    if (status === "OnChain" || status === "Reverted") return status;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return status;
}

export const frameReceipt = (ep: Endpoints, hash: Hex) =>
  rpc(ep.altMempool, "eth_getFrameTransactionReceipt", [hash]);
