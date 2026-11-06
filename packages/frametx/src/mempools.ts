import type { Hex } from "viem";
import { rpc, toWire, explainRejection } from "@forshtat/hegota-support/rpc";
import type { FrameTx } from "@forshtat/hegota-support/tx";
import { rawTx } from "./qpay.ts";

export interface Endpoints {
  /** ethrex JSON-RPC: canonical mempool (`eth_sendRawTransaction`), state reads, simulation. */
  node: string;
  /** ERC-8421 sidecar JSON-RPC: the alternative mempool (`eth_sendFrameTransaction`). */
  altMempool: string;
}

export type Verdict =
  | { mempool: "canonical" | "alt"; accepted: true; hash: Hex }
  | { mempool: "canonical" | "alt"; accepted: false; reason: string; rule: string };

async function verdict(mempool: Verdict["mempool"], call: () => Promise<Hex>): Promise<Verdict> {
  try {
    return { mempool, accepted: true, hash: await call() };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { mempool, accepted: false, reason, rule: explainRejection(reason).rule };
  }
}

export const submitCanonical = (ep: Endpoints, tx: FrameTx) =>
  verdict("canonical", () => rpc(ep.node, "eth_sendRawTransaction", [rawTx(tx)]));

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
