import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { getProfile } from "@forshtat/hegota-support/profiles";
import { encodeTx, frame, newTx, sigHash, sigScheme, txHash, type FrameTx } from "@forshtat/hegota-support/tx";

export const profile = getProfile("ethrex-eip8141-tracer");

const FRAME_TX_INTRINSIC_GAS = 12_000n;
const PER_FRAME_GAS = 475n;
const CALLDATA_GAS_PER_BYTE = 16n;

export interface GasLimits {
  falconVerify: bigint;
  paymasterVerify: bigint;
  repay: bigint;
  repayState: bigint;
  payment: bigint;
  paymentState: bigint;
}

export const defaultGas: GasLimits = {
  falconVerify: 950_000n,
  paymasterVerify: 100_000n,
  repay: 60_000n,
  repayState: 50_000n,
  payment: 60_000n,
  paymentState: 50_000n,
};

export interface QPayParams {
  chainId: bigint;
  account: Address;
  paymaster: Address;
  usdc: Address;
  recipient: Address;
  amount: bigint;
  nonceSeq: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas?: bigint;
  /** USDC base units per 1 ETH, mirroring the paymaster's immutable price. */
  usdcPerEth: bigint;
  gas?: Partial<GasLimits>;
  /** Pays this many USDC base units instead of the quote; used to show the paymaster refusing an underpayment. */
  feeOverride?: bigint;
}

export interface UnsignedQPay {
  tx: FrameTx;
  fee: bigint;
  maxCostUpperBound: bigint;
}

const transfer = (to: Address, amount: bigint): Hex =>
  encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });

/** Upper bound on `max_cost` for the given frames; the paymaster's own quote must not exceed what we pay. */
function maxCostUpperBound(tx: FrameTx, sigBytes: number): bigint {
  const frameGas = tx.frames.reduce((sum, f) => sum + f.limits.execution + f.limits.state, 0n);
  const dataBytes = tx.frames.reduce((sum, f) => sum + BigInt((f.data.length - 2) / 2), 0n) + BigInt(sigBytes);
  const gas = FRAME_TX_INTRINSIC_GAS + PER_FRAME_GAS * BigInt(tx.frames.length) + CALLDATA_GAS_PER_BYTE * dataBytes + frameGas;
  return gas * tx.fees.maxFeePerGas;
}

export const quoteUsdc = (maxCostWei: bigint, usdcPerEth: bigint) =>
  (maxCostWei * usdcPerEth + 10n ** 18n - 1n) / 10n ** 18n;

export const FALCON_SIG_BYTES = 1064;

/**
 * Four frames: the account's Falcon check, the paymaster's approval, the USDC repayment, and the payment.
 * The Falcon signature goes in an ARBITRARY entry with an empty `msg`, so it is elided from the signature hash.
 */
export function buildQPayTx(p: QPayParams): UnsignedQPay {
  const gas = { ...defaultGas, ...p.gas };
  const build = (fee: bigint) =>
    newTx({
      chainId: p.chainId,
      sender: p.account,
      nonceSeq: p.nonceSeq,
      fees: { maxFeePerGas: p.maxFeePerGas, maxPriorityFeePerGas: p.maxPriorityFeePerGas ?? p.maxFeePerGas },
      frames: [
        frame(profile, "VERIFY", { target: null, execution: gas.falconVerify, scope: "EXECUTION" }),
        frame(profile, "VERIFY", { target: p.paymaster, execution: gas.paymasterVerify, scope: "PAYMENT" }),
        frame(profile, "SENDER", {
          target: p.usdc,
          execution: gas.repay,
          state: gas.repayState,
          data: transfer(p.paymaster, fee),
        }),
        frame(profile, "SENDER", {
          target: p.usdc,
          execution: gas.payment,
          state: gas.paymentState,
          data: transfer(p.recipient, p.amount),
        }),
      ],
      signatures: [{ scheme: sigScheme(profile, "ARBITRARY"), signer: "0x", msg: "0x", signature: "0x" }],
    });
  const draft = build(0n);
  const bound = maxCostUpperBound(draft, FALCON_SIG_BYTES);
  const fee = p.feeOverride ?? quoteUsdc(bound, p.usdcPerEth);
  return { tx: build(fee), fee, maxCostUpperBound: bound };
}

export type FalconSign = (digest: Uint8Array) => Promise<Uint8Array> | Uint8Array;

export async function signQPay(tx: FrameTx, sign: FalconSign): Promise<FrameTx> {
  const digest = sigHash(profile, tx);
  const sig = await sign(hexToBytes(digest));
  if (sig.length !== FALCON_SIG_BYTES) throw new Error(`Falcon signature is ${sig.length} bytes, want ${FALCON_SIG_BYTES}`);
  return { ...tx, signatures: [{ ...tx.signatures[0], signature: bytesToHex(sig) }] };
}

export const rawTx = (tx: FrameTx) => encodeTx(profile, tx);
export const frameTxHash = (tx: FrameTx) => txHash(profile, tx);
export const frameSigHash = (tx: FrameTx) => sigHash(profile, tx);

export function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.slice(2);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = (bytes: Uint8Array): Hex =>
  `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
