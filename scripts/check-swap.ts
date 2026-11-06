// Offline checks for the Uniswap v4 helpers: price math, pool keys and the exact bytes we send the router.
//   pnpm test:swap-encoding
import assert from "node:assert/strict";
import { decodeAbiParameters, decodeFunctionData, parseEther, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import {
  Actions,
  NATIVE,
  abis,
  encodeMint,
  encodeSwapExactIn,
  fullRangeLiquidity,
  fullRangeTicks,
  isqrt,
  minOut,
  pathKeys,
  poolKey,
  priceFromSqrt,
  sqrtPriceX96,
} from "../app/src/lib/uniswap-v4.ts";

const USDC = "0x13cb6782bb3b525418237cc4ea2d3e4a9ab25ab5" as Address;
const TEUR = "0xd6d325bd53125d6cccb39f61e9379c8f28e3fddb" as Address;
const ok = (msg: string) => console.log(`- ${msg}`);

// isqrt is exact on squares and floors otherwise.
for (const n of [0n, 1n, 2n, 99n, 10n ** 40n, 2n ** 255n - 1n]) {
  const r = isqrt(n);
  assert.ok(r * r <= n && (r + 1n) * (r + 1n) > n, `isqrt(${n})`);
}
ok("isqrt floors correctly up to 2^255");

// Keys are sorted, native ETH first.
assert.equal(poolKey(TEUR, USDC, 500, 10).currency0, USDC);
assert.equal(poolKey(USDC, NATIVE, 3000, 60).currency0, NATIVE);
ok("pool keys sort currencies by address, native ETH first");

// 1 tEUR = 1.08 USDC with USDC as currency0 means 1/1.08 tEUR per USDC.
const fx = sqrtPriceX96(parseUnits("1000000", 6), parseUnits("1080000", 6));
assert.ok(Math.abs(priceFromSqrt(fx) - 1 / 1.08) < 1e-9);
// 3000 USDC per ETH: 3000e6 base units per 1e18 wei.
const eth = sqrtPriceX96(3000n * 10n ** 6n, 10n ** 18n);
assert.ok(Math.abs(priceFromSqrt(eth) / 3e-9 - 1) < 1e-6);
ok("sqrtPriceX96 round-trips the FX price and the paymaster's ETH price");

// Full-range liquidity never asks for more than we offer.
const L = fullRangeLiquidity(eth, parseEther("10"), 30_000n * 10n ** 6n);
const Q96 = 2n ** 96n;
assert.ok((L * Q96) / eth <= parseEther("10") && (L * eth) / Q96 <= 30_000n * 10n ** 6n);
assert.deepEqual(fullRangeTicks(60), { tickLower: -887220, tickUpper: 887220 });
ok("full-range liquidity stays within the offered amounts; ticks are spacing-aligned");

assert.equal(minOut(1_000_000n, 50), 995_000n);
ok("0.5% slippage on 1.000000 gives a minimum of 0.995000");

// A single-hop swap decodes back to the same struct and the three router actions.
const key = poolKey(USDC, TEUR, 500, 10);
const data = encodeSwapExactIn({ currencyIn: USDC, currencyOut: TEUR, hops: [{ key, zeroForOne: true }], amountIn: 10_000_000n, amountOutMinimum: 9_200_000n, deadline: 1n });
const { args } = decodeFunctionData({ abi: abis.universalRouter, data });
assert.equal(args[0], "0x10");
const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], args[1][0] as Hex);
assert.equal(actions, "0x060c0f");
const [single] = decodeAbiParameters(
  [{ type: "tuple", components: [
    { name: "poolKey", type: "tuple", components: [{ name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] },
    { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "hookData", type: "bytes" },
  ] }],
  params[0],
);
assert.equal(single.poolKey.fee, 500);
assert.equal(single.zeroForOne, true);
assert.equal(single.amountIn, 10_000_000n);
assert.equal(single.amountOutMinimum, 9_200_000n);
const [settleCurrency, settleMax] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[1]);
assert.equal(settleCurrency.toLowerCase(), USDC);
assert.equal(settleMax, 10_000_000n);
const [takeCurrency, takeMin] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[2]);
assert.equal(takeCurrency.toLowerCase(), TEUR);
assert.equal(takeMin, 9_200_000n);
ok("single-hop swap: V4_SWAP with SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL; struct decodes back");

// A two-hop path names each hop by the currency it arrives at.
const ethPool = poolKey(NATIVE, USDC, 3000, 60);
const path = pathKeys(TEUR, [{ key, zeroForOne: false }, { key: ethPool, zeroForOne: false }]);
assert.equal(path[0].intermediateCurrency.toLowerCase(), USDC);
assert.equal(path[1].intermediateCurrency, zeroAddress);
const multi = encodeSwapExactIn({ currencyIn: TEUR, currencyOut: NATIVE, hops: [{ key, zeroForOne: false }, { key: ethPool, zeroForOne: false }], amountIn: 1n, amountOutMinimum: 0n, deadline: 1n });
const [multiActions] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], decodeFunctionData({ abi: abis.universalRouter, data: multi }).args[1][0] as Hex);
assert.equal(multiActions, `0x0${Actions.SWAP_EXACT_IN.toString(16)}0c0f`);
ok("two-hop tEUR -> USDC -> ETH uses SWAP_EXACT_IN with a two-key path");

// Minting into a native-ETH pool sweeps leftover ETH back.
const mint = encodeMint({ key: ethPool, tickLower: -60, tickUpper: 60, liquidity: 1n, amount0Max: 1n, amount1Max: 1n, owner: USDC, deadline: 1n });
const [mintActions] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], decodeFunctionData({ abi: abis.positionManager, data: mint }).args[0] as Hex);
assert.equal(mintActions, "0x020d14");
ok("minting into the ETH pool is MINT_POSITION, SETTLE_PAIR, SWEEP");
console.log("PASS");
