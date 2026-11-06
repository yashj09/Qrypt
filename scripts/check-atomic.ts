// Does the devnet honour EIP-8141's ATOMIC_BATCH flag? Sends [approve(spender, n), a call that reverts] twice from the
// CLI demo account: atomic (the approval must be undone) and not atomic (the approval must stay). Run: pnpm check:atomic
import { createPublicClient, encodeFunctionData, erc20Abi, http, maxUint256, type Address } from "viem";
import { falconFromSeed } from "@qpay/falcon";
import { buildWalletTx, signQPay, submitAlt, submitStock, waitForInclusion } from "@qpay/frametx";
import { endpoints, loadDeployment } from "./lib/config.ts";
import { loadSeed } from "./lib/seed.ts";

const SPENDER = "0x000000000000000000000000000000000000a70a" as Address;

async function main() {
  const client = createPublicClient({ transport: http(endpoints.node) });
  const chainId = await client.getChainId();
  const d = loadDeployment(chainId);
  const token = d.tokens[0].address;
  const signer = falconFromSeed(loadSeed());
  const allowance = () =>
    client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [d.account, SPENDER] });

  async function run(atomic: boolean, amount: bigint) {
    const calls = [
      { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SPENDER, amount] }), label: `approve ${amount}` },
      // Transferring more USDC than the account holds always reverts.
      { to: d.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [SPENDER, maxUint256] }), label: "reverting transfer" },
    ];
    const nonceSeq = BigInt(await client.getTransactionCount({ address: d.account }));
    const { tx } = buildWalletTx({
      chainId: BigInt(chainId), account: d.account, paymaster: d.paymaster, usdc: d.usdc, calls, nonceSeq,
      maxFeePerGas: 3_000_000n, maxPriorityFeePerGas: 2_000_000n, usdcPerEth: BigInt(d.usdcPerEth), atomic,
    });
    const signed = await signQPay(tx, (digest) => signer.sign(digest));
    const alt = await submitAlt(endpoints, signed);
    await submitStock(endpoints, signed).catch(() => undefined);
    if (!alt.accepted) throw new Error(`alt mempool refused: ${alt.reason}`);
    const status = await waitForInclusion(endpoints, alt.hash);
    // Devnet inclusion can take minutes; wait for the receipt itself rather than trusting the mempool's status.
    type Receipt = { status: string; frameReceipts?: { status: string }[] } | null;
    let receipt: Receipt = null;
    for (let i = 0; i < 80 && !receipt; i++) {
      receipt = (await client.request({ method: "eth_getTransactionReceipt" as never, params: [alt.hash] as never })) as Receipt;
      if (!receipt) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!receipt) throw new Error(`not included after 4 minutes (mempool status ${status})`);
    const after = await allowance();
    console.log(`- atomic=${atomic}: ${status}, frames ${receipt?.frameReceipts?.map((f) => f.status).join(" ") ?? "?"}, allowance now ${after}`);
    return after;
  }

  const start = await allowance();
  console.log(`account ${d.account}, ${d.tokens[0].symbol} allowance to the test spender: ${start}`);
  const atomicAfter = await run(true, start + 111n);
  const plainAfter = await run(false, start + 222n);
  const atomicWorks = atomicAfter === start;
  const plainKeeps = plainAfter === start + 222n;
  console.log(atomicWorks && plainKeeps ? "PASS: ATOMIC_BATCH undoes the batch; without it the approval stays" : "FAIL");
  if (!atomicWorks || !plainKeeps) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
