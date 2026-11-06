import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { getProfile } from "@forshtat/hegota-support/profiles";
import { encodeTx, frame, newTx, sigHash, sigScheme, txHash, type FrameTx } from "@forshtat/hegota-support/tx";

export const profile = getProfile("ethrex-eip8141-tracer");

const FRAME_TX_INTRINSIC_GAS = 12_000n;
const PER_FRAME_GAS = 475n;
const CALLDATA_GAS_PER_BYTE = 16n;

export interface FrameGas {
  execution: bigint;
  state: bigint;
}

/** Amsterdam state gas: a SENDER frame that writes fresh storage needs both budgets. */
export const defaultGas = {
  falconVerify: 950_000n,
  paymasterVerify: 100_000n,
  repay: { execution: 150_000n, state: 250_000n } as FrameGas,
  call: { execution: 300_000n, state: 250_000n } as FrameGas,
  transfer: { execution: 150_000n, state: 250_000n } as FrameGas,
};

/** One SENDER frame: the account calls `to` with `data` and `value`. */
export interface Call {
  to: Address;
  data?: Hex;
  value?: bigint;
  label: string;
  gas?: FrameGas;
}

export interface FrameLabel {
  mode: "VERIFY" | "SENDER";
  label: string;
}

export interface WalletTxParams {
  chainId: bigint;
  account: Address;
  paymaster: Address;
  usdc: Address;
  calls: Call[];
  nonceSeq: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas?: bigint;
  /** USDC base units per 1 ETH, mirroring the paymaster's immutable price. */
  usdcPerEth: bigint;
  /** Pays this many USDC base units instead of the quote; used to show the paymaster refusing an underpayment. */
  feeOverride?: bigint;
  /**
   * Run the calls as one EIP-8141 atomic batch: if any of them reverts, all of them do (e.g. an approval is undone
   * when the swap after it fails). The gas repayment frame stays outside the batch, so the paymaster is still repaid.
   */
  atomic?: boolean;
}

export interface UnsignedWalletTx {
  tx: FrameTx;
  fee: bigint;
  frames: FrameLabel[];
  maxCostUpperBound: bigint;
}

export const erc20Transfer = (to: Address, amount: bigint): Hex =>
  encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });

const VALUE_TRANSFER_GAS = 9_000n;
/** The chain's max-cost accounting has terms we don't model exactly; paying 2% over the quote is a few cents of a cent. */
const MARGIN_PERCENT = 102n;

/**
 * Upper bound on `max_cost` for the given frames; the paymaster's own quote must not exceed what we pay. Measured on
 * the devnet: a frame carrying ETH and no calldata costs about 2.9k gas more than this formula without the value term.
 */
function maxCostUpperBound(tx: FrameTx, sigBytes: number): bigint {
  const frameGas = tx.frames.reduce((sum, f) => sum + f.limits.execution + f.limits.state, 0n);
  const dataBytes = tx.frames.reduce((sum, f) => sum + BigInt((f.data.length - 2) / 2), 0n) + BigInt(sigBytes);
  const valueFrames = BigInt(tx.frames.filter((f) => f.value > 0n).length);
  const gas =
    FRAME_TX_INTRINSIC_GAS +
    PER_FRAME_GAS * BigInt(tx.frames.length) +
    CALLDATA_GAS_PER_BYTE * dataBytes +
    VALUE_TRANSFER_GAS * valueFrames +
    frameGas;
  return (gas * tx.fees.maxFeePerGas * MARGIN_PERCENT) / 100n;
}

export const quoteUsdc = (maxCostWei: bigint, usdcPerEth: bigint) =>
  (maxCostWei * usdcPerEth + 10n ** 18n - 1n) / 10n ** 18n;

export const FALCON_SIG_BYTES = 1064;

/**
 * The account's Falcon check, the paymaster's approval, the USDC repayment, then one SENDER frame per call.
 * The paymaster only inspects the frame right after it, so the calls can be anything the account may do.
 * The Falcon signature goes in an ARBITRARY entry with an empty `msg`, so it is elided from the signature hash.
 */
export function buildWalletTx(p: WalletTxParams): UnsignedWalletTx {
  if (p.calls.length === 0) throw new Error("a wallet transaction needs at least one call");
  const build = (fee: bigint) =>
    newTx({
      chainId: p.chainId,
      sender: p.account,
      nonceSeq: p.nonceSeq,
      fees: { maxFeePerGas: p.maxFeePerGas, maxPriorityFeePerGas: p.maxPriorityFeePerGas ?? p.maxFeePerGas },
      frames: [
        frame(profile, "VERIFY", { target: null, execution: defaultGas.falconVerify, scope: "EXECUTION" }),
        frame(profile, "VERIFY", { target: p.paymaster, execution: defaultGas.paymasterVerify, scope: "PAYMENT" }),
        frame(profile, "SENDER", { target: p.usdc, ...defaultGas.repay, data: erc20Transfer(p.paymaster, fee) }),
        ...p.calls.map((c, i) =>
          frame(profile, "SENDER", {
            target: c.to,
            ...(c.gas ?? defaultGas.call),
            value: c.value ?? 0n,
            data: c.data ?? "0x",
            // The flag joins a frame to the next one, so it goes on every call but the last.
            flags: p.atomic && i < p.calls.length - 1 ? profile.flagBits.ATOMIC_BATCH : 0,
          }),
        ),
      ],
      signatures: [{ scheme: sigScheme(profile, "ARBITRARY"), signer: "0x", msg: "0x", signature: "0x" }],
    });
  const draft = build(0n);
  const bound = maxCostUpperBound(draft, FALCON_SIG_BYTES);
  const fee = p.feeOverride ?? quoteUsdc(bound, p.usdcPerEth);
  const frames: FrameLabel[] = [
    { mode: "VERIFY", label: "Falcon signature check" },
    { mode: "VERIFY", label: "USDC paymaster" },
    { mode: "SENDER", label: "Repay gas in USDC" },
    ...p.calls.map((c) => ({ mode: "SENDER" as const, label: c.label })),
  ];
  return { tx: build(fee), fee, frames, maxCostUpperBound: bound };
}

export interface QPayParams extends Omit<WalletTxParams, "calls"> {
  recipient: Address;
  amount: bigint;
}

/** The original payment: one USDC transfer. */
export const buildQPayTx = ({ recipient, amount, ...p }: QPayParams): UnsignedWalletTx =>
  buildWalletTx({
    ...p,
    calls: [{ to: p.usdc, data: erc20Transfer(recipient, amount), label: "Payment", gas: defaultGas.transfer }],
  });

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
