// Deploys Uniswap v4 on the devnet from the official npm artifacts and seeds Qrypt's two pools. Idempotent: contracts
// already in deployments/<chain>.json (with code onchain) are reused, and a pool that already has liquidity is skipped.
//   QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm deploy:uniswap
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, encodeFunctionData, erc20Abi, http, maxUint160, maxUint256, parseAbi, parseEther, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  NATIVE,
  PERMIT2,
  abis,
  encodeMint,
  fullRangeLiquidity,
  fullRangeTicks,
  poolId,
  poolKey,
  priceFromSqrt,
  sqrtPriceX96,
  type PoolKey,
  type UniswapDeployment,
} from "../app/src/lib/uniswap-v4.ts";
import { connect, deploy, type Artifact } from "./lib/chain.ts";
import { ROOT, deploymentPath, loadDeployment, sharedFunderKey } from "./lib/config.ts";

const UNI = resolve(ROOT, "node_modules/@uniswap");
function uniswapArtifact(path: string): Artifact {
  const json = JSON.parse(readFileSync(resolve(UNI, path), "utf8"));
  const bytecode = typeof json.bytecode === "string" ? json.bytecode : json.bytecode.object;
  return { abi: json.abi, bytecode: bytecode as Hex };
}

const ARTIFACTS = {
  poolManager: "v4-core/out/PoolManager.sol/PoolManager.json",
  positionManager: "v4-periphery/foundry-out/PositionManager.sol/PositionManager.json",
  quoter: "v4-periphery/foundry-out/V4Quoter.sol/V4Quoter.json",
  stateView: "v4-periphery/foundry-out/StateView.sol/StateView.json",
  universalRouter: "universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json",
};

/** PositionManager's gas allowance for subscriber callbacks on unsubscribe; the value Uniswap deploys with. */
const UNSUBSCRIBE_GAS_LIMIT = 300_000n;
const ZERO32 = `0x${"00".repeat(32)}` as Hex;
const mintable = parseAbi(["function mint(address to, uint256 amount)"]);

async function main() {
  const ctx = await connect();
  const { publicClient, wallet, deployer } = ctx;
  const chainId = ctx.chain.id;
  const d = loadDeployment(chainId) as ReturnType<typeof loadDeployment> & { uniswap?: UniswapDeployment };
  const tEUR = d.tokens.find((t) => t.symbol === "tEUR");
  if (!tEUR) throw new Error("no tEUR in the deployment; run pnpm deploy:account first");
  if ((await publicClient.getCode({ address: PERMIT2 })) === undefined) throw new Error("Permit2 is not predeployed on this chain");

  const hasCode = async (a?: Address) => !!a && ((await publicClient.getCode({ address: a })) ?? "0x").length > 2;
  const send = async (to: Address, data: Hex, value = 0n, label = "") => {
    const hash = await wallet.sendTransaction({ to, data, value });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    return r;
  };
  const write = async (address: Address, abi: readonly unknown[], functionName: string, args: unknown[], label: string) => {
    const hash = await wallet.writeContract({ address, abi: abi as never, functionName: functionName as never, args: args as never });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  };

  // --- contracts -------------------------------------------------------------------------------------------------
  // Saved after every deploy, so a run that fails halfway resumes instead of redeploying.
  const saved: Partial<UniswapDeployment> = { ...d.uniswap };
  const save = () => writeFileSync(deploymentPath(chainId), JSON.stringify({ ...d, uniswap: { pools: [], ...saved } }, null, 2) + "\n");
  const reuse = async (key: keyof typeof ARTIFACTS, args: unknown[]) => {
    const existing = saved[key] as Address | undefined;
    if (await hasCode(existing)) {
      console.log(`${key.padEnd(16)} ${existing} (existing)`);
      return existing!;
    }
    const address = await deploy(ctx, uniswapArtifact(ARTIFACTS[key]), args);
    saved[key] = address as never;
    save();
    console.log(`${key.padEnd(16)} ${address}`);
    return address;
  };
  const poolManager = await reuse("poolManager", [deployer.address]);
  const positionManager = await reuse("positionManager", [poolManager, PERMIT2, UNSUBSCRIBE_GAS_LIMIT, NATIVE, NATIVE]);
  const universalRouter = await reuse("universalRouter", [
    {
      permit2: PERMIT2,
      weth9: NATIVE,
      v2Factory: NATIVE,
      v3Factory: NATIVE,
      pairInitCodeHash: ZERO32,
      poolInitCodeHash: ZERO32,
      v4PoolManager: poolManager,
      v3NFTPositionManager: NATIVE,
      v4PositionManager: positionManager,
      spokePool: NATIVE, // Across bridging, unused here
    },
  ]);
  const quoter = await reuse("quoter", [poolManager]);
  const stateView = await reuse("stateView", [poolManager]);

  // --- pools -----------------------------------------------------------------------------------------------------
  // USDC/tEUR is an FX pair: 0.05% fee. ETH/USDC uses the paymaster's own price so swaps and gas quotes agree.
  const usdcPerEth = BigInt(d.usdcPerEth);
  // Each pool is priced as "`amountB` of B is worth `amountA` of A", and seeded with exactly those amounts.
  interface PoolSpec { label: string; a: Address; b: Address; amountA: bigint; amountB: bigint; fee: number; tickSpacing: number }
  const specs: PoolSpec[] = [
    // 1 tEUR = 1.08 USDC (both 6 decimals): 1M tEUR against 1.08M USDC.
    { label: "USDC/tEUR 0.05%", a: tEUR.address, b: d.usdc, amountA: parseUnits("1000000", 6), amountB: parseUnits("1080000", 6), fee: 500, tickSpacing: 10 },
    // 10 ETH at the paymaster's price.
    { label: "ETH/USDC 0.30%", a: NATIVE, b: d.usdc, amountA: parseEther("10"), amountB: 10n * usdcPerEth, fee: 3000, tickSpacing: 60 },
  ];
  const pools = specs.map((p) => {
    const key: PoolKey = poolKey(p.a, p.b, p.fee, p.tickSpacing);
    const aIs0 = key.currency0.toLowerCase() === p.a.toLowerCase();
    const [amount0, amount1] = aIs0 ? [p.amountA, p.amountB] : [p.amountB, p.amountA];
    // sqrt(currency1 per currency0) = sqrt(amount1 / amount0).
    return { key, label: p.label, amount0, amount1, sqrtP: sqrtPriceX96(amount1, amount0) };
  });

  // The deployer needs 10 ETH for the ETH/USDC pool on top of gas; top up from the shared devnet genesis key.
  const need = parseEther("12");
  const balance = await publicClient.getBalance({ address: deployer.address });
  if (balance < need) {
    const funder = createWalletClient({ chain: ctx.chain, account: privateKeyToAccount(sharedFunderKey), transport: http(ctx.chain.rpcUrls.default.http[0]) });
    const hash = await funder.sendTransaction({ to: deployer.address, value: need - balance + parseEther("1"), gas: 250_000n });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  for (const pool of pools) {
    const id = poolId(pool.key);
    const [slot0Price] = await publicClient.readContract({ address: stateView, abi: abis.stateView, functionName: "getSlot0", args: [id] });
    const liquidity = await publicClient.readContract({ address: stateView, abi: abis.stateView, functionName: "getLiquidity", args: [id] });
    if (slot0Price !== 0n && liquidity > 0n) {
      console.log(`pool ${pool.label.padEnd(16)} exists, price ${priceFromSqrt(slot0Price)}`);
      continue;
    }
    const { sqrtP, amount0, amount1 } = pool;

    // Tokens are freely mintable test tokens; approve them to Permit2, and Permit2 to the PositionManager.
    for (const [currency, amount] of [[pool.key.currency0, amount0], [pool.key.currency1, amount1]] as const) {
      if (currency === NATIVE) continue;
      await write(currency, mintable, "mint", [deployer.address, amount], "mint");
      await write(currency, erc20Abi, "approve", [PERMIT2, maxUint256], "approve Permit2");
      await write(PERMIT2, abis.permit2, "approve", [currency, positionManager, maxUint160, 2n ** 48n - 1n], "Permit2 approve");
    }
    const { tickLower, tickUpper } = fullRangeTicks(pool.key.tickSpacing);
    const init = encodeFunctionDataSafe("initializePool", [pool.key, sqrtP]);
    const mint = encodeMint({
      key: pool.key,
      tickLower,
      tickUpper,
      liquidity: fullRangeLiquidity(sqrtP, amount0, amount1),
      amount0Max: amount0,
      amount1Max: amount1,
      owner: deployer.address,
      deadline,
    });
    const value = pool.key.currency0 === NATIVE ? amount0 : 0n;
    await send(positionManager, encodeFunctionDataSafe("multicall", [[init, mint]]), value, `seed ${pool.label}`);
    const [after] = await publicClient.readContract({ address: stateView, abi: abis.stateView, functionName: "getSlot0", args: [id] });
    console.log(`pool ${pool.label.padEnd(16)} seeded at price ${priceFromSqrt(after)} (currency1 per currency0 base unit)`);
  }

  const uniswap: UniswapDeployment = { poolManager, positionManager, universalRouter, quoter, stateView, permit2: PERMIT2, pools: pools.map((p) => p.key) };
  writeFileSync(deploymentPath(chainId), JSON.stringify({ ...d, uniswap }, null, 2) + "\n");
  console.log(`written          ${deploymentPath(chainId)}`);
}

const encodeFunctionDataSafe = (functionName: "initializePool" | "multicall", args: unknown[]): Hex =>
  encodeFunctionData({ abi: abis.positionManager, functionName, args: args as never });

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
