// Swaps from the CLI demo account through Qrypt's Uniswap v4 pools, as one atomic, Falcon-signed frame transaction
// with gas paid in USDC. Also the end-to-end check that the wallet's call sequence works onchain.
//   QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm swap USDC tEUR 10 [--slippage 50] [--min-out-too-high]
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits, type Address, type PublicClient } from "viem";
import { falconFromSeed } from "@qpay/falcon";
import { buildWalletTx, signQPay, simulate, submitAlt, submitStock, waitForInclusion } from "@qpay/frametx";
import { NATIVE, minOut, type UniswapDeployment } from "../app/src/lib/uniswap-v4.ts";
import { findRoute, quote, routeLabel, swapCalls } from "../app/src/lib/swap.ts";
import { endpoints, loadDeployment } from "./lib/config.ts";
import { loadSeed } from "./lib/seed.ts";

const [fromSym = "USDC", toSym = "tEUR", amountArg = "10"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (name: string) => process.argv.indexOf(`--${name}`);
const SLIPPAGE_BPS = flag("slippage") > 0 ? Number(process.argv[flag("slippage") + 1]) : 50;
const IMPOSSIBLE = flag("min-out-too-high") > 0;

async function main() {
  const client = createPublicClient({ transport: http(endpoints.node) }) as PublicClient;
  const chainId = await client.getChainId();
  const d = loadDeployment(chainId) as ReturnType<typeof loadDeployment> & { uniswap?: UniswapDeployment };
  if (!d.uniswap) throw new Error("no Uniswap deployment; run pnpm deploy:uniswap");
  const u = d.uniswap;
  const currencies: Record<string, { address: Address; decimals: number }> = {
    USDC: { address: d.usdc, decimals: 6 },
    ETH: { address: NATIVE, decimals: 18 },
    ...Object.fromEntries(d.tokens.map((t) => [t.symbol, { address: t.address, decimals: t.decimals }])),
  };
  const from = currencies[fromSym], to = currencies[toSym];
  if (!from || !to) throw new Error(`unknown currency; use ${Object.keys(currencies).join(", ")}`);
  const symbol = (c: Address) => Object.entries(currencies).find(([, v]) => v.address.toLowerCase() === c.toLowerCase())?.[0] ?? c;
  const balance = (c: Address) =>
    c === NATIVE ? client.getBalance({ address: d.account }) : client.readContract({ address: c, abi: erc20Abi, functionName: "balanceOf", args: [d.account] });

  const route = findRoute(u, from.address, to.address);
  if (!route) throw new Error(`no route ${fromSym} -> ${toSym}`);
  const amountIn = parseUnits(amountArg, from.decimals);
  const q = await quote(client, u, route, amountIn);
  const min = IMPOSSIBLE ? q.amountOut * 2n : minOut(q.amountOut, SLIPPAGE_BPS);
  console.log(`route      ${routeLabel(route, symbol)}`);
  console.log(`quote      ${amountArg} ${fromSym} -> ${formatUnits(q.amountOut, to.decimals)} ${toSym} (impact ${(q.priceImpact * 100).toFixed(3)}%)`);
  console.log(`minimum    ${formatUnits(min, to.decimals)} ${toSym}${IMPOSSIBLE ? " (deliberately impossible)" : ` at ${SLIPPAGE_BPS / 100}% slippage`}`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const calls = swapCalls(u, route, amountIn, min, deadline, { in: fromSym, out: toSym });
  const nonceSeq = BigInt(await client.getTransactionCount({ address: d.account }));
  const { tx, fee } = buildWalletTx({
    chainId: BigInt(chainId), account: d.account, paymaster: d.paymaster, usdc: d.usdc, calls, nonceSeq,
    maxFeePerGas: 3_000_000n, maxPriorityFeePerGas: 2_000_000n, usdcPerEth: BigInt(d.usdcPerEth), atomic: true,
  });
  console.log(`frames     ${calls.map((c) => c.label).join(" | ")} (atomic), gas fee ${formatUnits(fee, 6)} USDC`);

  const before = { in: await balance(from.address), out: await balance(to.address), eth: await client.getBalance({ address: d.account }) };
  const signer = falconFromSeed(loadSeed());
  const signed = await signQPay(tx, (digest) => signer.sign(digest));
  if (flag("simulate") > 0) {
    const sim = (await simulate(endpoints, signed)) as { frameResults?: { status?: string; gasUsed?: string; stateGasUsed?: string; error?: string; revertReason?: string }[] } & Record<string, unknown>;
    const frames = (sim.frameResults ?? (sim as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[];
    console.log("simulated  " + (frames.length ? "" : JSON.stringify(sim).slice(0, 600)));
    frames.forEach((f, i) => console.log(`  frame ${i}: ${JSON.stringify(f).slice(0, 220)}`));
    if (process.env.SIM_DUMP) (await import("node:fs")).writeFileSync(process.env.SIM_DUMP, JSON.stringify(sim, null, 1));
    return;
  }
  const alt = await submitAlt(endpoints, signed);
  await submitStock(endpoints, signed).catch(() => undefined);
  if (!alt.accepted) throw new Error(`alt mempool refused: ${alt.reason}`);
  await waitForInclusion(endpoints, alt.hash);
  let receipt: { blockNumber: string } | null = null;
  for (let i = 0; i < 80 && !receipt; i++) {
    receipt = (await client.request({ method: "eth_getTransactionReceipt" as never, params: [alt.hash] as never })) as typeof receipt;
    if (!receipt) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!receipt) throw new Error("not included after 4 minutes");
  const after = { in: await balance(from.address), out: await balance(to.address), eth: await client.getBalance({ address: d.account }) };
  // The gas fee also comes out of USDC, so buying USDC shows up net of it.
  const received = after.out - before.out + (toSym === "USDC" ? fee : 0n);
  console.log(`included   block ${BigInt(receipt.blockNumber)}, tx ${alt.hash}`);
  console.log(`paid       ${formatUnits(before.in - after.in, from.decimals)} ${fromSym}${fromSym === "USDC" ? " (includes the gas fee)" : ""}`);
  console.log(`received   ${formatUnits(received, to.decimals)} ${toSym}`);
  if (IMPOSSIBLE) {
    const unchanged = received === 0n && (fromSym === "USDC" ? before.in - after.in <= fee : before.in === after.in);
    console.log(unchanged ? "PASS: the swap reverted and the whole batch with it; only the gas fee was paid" : "FAIL: something moved");
    if (!unchanged) process.exit(1);
  } else if (received < min) {
    console.log("FAIL: received less than the minimum");
    process.exit(1);
  } else if (fromSym !== "ETH" && toSym !== "ETH" && after.eth !== before.eth) {
    console.log("FAIL: ETH balance changed");
    process.exit(1);
  } else console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
