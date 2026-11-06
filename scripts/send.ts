import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type Address } from "viem";
import { falconFromSeed } from "@qpay/falcon";
import {
  buildQPayTx,
  bytesToHex,
  hexToBytes,
  frameTxHash,
  signQPay,
  submitAlt,
  submitCanonical,
  waitForInclusion,
  type Verdict,
} from "@qpay/frametx";
import { endpoints, loadDeployment } from "./lib/config.ts";
import { loadSeed } from "./lib/seed.ts";

const RECIPIENT = (process.argv[2] ?? "0x000000000000000000000000000000000000dEaD") as Address;
const AMOUNT = BigInt(Math.round(Number(process.argv[3] ?? "5") * 1e6));
const TAMPER = process.argv.includes("--tamper");

const show = (v: Verdict) =>
  v.accepted ? `accepted ${v.hash}` : `rejected [${v.rule}] ${v.reason.slice(0, 220)}`;

async function main() {
  const client = createPublicClient({ transport: http(endpoints.node) });
  const chainId = await client.getChainId();
  const d = loadDeployment(chainId);
  const usdcBalance = (a: Address) =>
    client.readContract({ address: d.usdc, abi: erc20Abi, functionName: "balanceOf", args: [a] });

  const nonceSeq = BigInt(await client.getTransactionCount({ address: d.account }));
  const { tx, fee } = buildQPayTx({
    chainId: BigInt(chainId),
    account: d.account,
    paymaster: d.paymaster,
    usdc: d.usdc,
    recipient: RECIPIENT,
    amount: AMOUNT,
    nonceSeq,
    maxFeePerGas: 3_000_000n,
    maxPriorityFeePerGas: 2_000_000n,
    usdcPerEth: BigInt(d.usdcPerEth),
  });
  const signer = falconFromSeed(loadSeed());
  let signed = await signQPay(tx, (digest) => signer.sign(digest));
  if (TAMPER) {
    const sig = hexToBytes(signed.signatures[0].signature);
    sig[100] ^= 0x01;
    signed = { ...signed, signatures: [{ ...signed.signatures[0], signature: bytesToHex(sig) }] };
  }

  const before = {
    eth: await client.getBalance({ address: d.account }),
    sender: await usdcBalance(d.account),
    recipient: await usdcBalance(RECIPIENT),
    paymaster: await usdcBalance(d.paymaster),
  };
  console.log(`account ${d.account}: ${formatEther(before.eth)} ETH, ${formatUnits(before.sender, 6)} USDC`);
  console.log(`sending ${formatUnits(AMOUNT, 6)} USDC to ${RECIPIENT}, gas fee ${formatUnits(fee, 6)} USDC${TAMPER ? " (tampered signature)" : ""}`);
  console.log(`frame tx ${frameTxHash(signed)}`);

  console.log(`canonical mempool  ${show(await submitCanonical(endpoints, signed))}`);
  const alt = await submitAlt(endpoints, signed);
  console.log(`alt mempool        ${show(alt)}`);
  if (!alt.accepted) process.exit(TAMPER ? 0 : 1);

  const status = await waitForInclusion(endpoints, alt.hash);
  console.log(`status             ${status}`);
  const after = {
    eth: await client.getBalance({ address: d.account }),
    sender: await usdcBalance(d.account),
    recipient: await usdcBalance(RECIPIENT),
    paymaster: await usdcBalance(d.paymaster),
  };
  console.log(`recipient USDC     +${formatUnits(after.recipient - before.recipient, 6)}`);
  console.log(`paymaster USDC     +${formatUnits(after.paymaster - before.paymaster, 6)}`);
  console.log(`account ETH        ${formatEther(before.eth)} -> ${formatEther(after.eth)}`);
  if (status !== "OnChain" || after.recipient - before.recipient !== AMOUNT || after.eth !== before.eth) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
