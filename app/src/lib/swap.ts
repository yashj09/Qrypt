import { encodeFunctionData, erc20Abi, type Address, type PublicClient } from "viem"
import type { Call } from "@qpay/frametx"
import {
  NATIVE,
  abis,
  encodeSwapExactIn,
  pathKeys,
  poolId,
  priceFromSqrt,
  sameCurrency,
  type Hop,
  type PoolKey,
  type UniswapDeployment,
} from "./uniswap-v4"

/**
 * Swaps through Qrypt's Uniswap v4 pools. A currency is a token address, or NATIVE (0x0) for ETH. Every function takes
 * the client and the deployment, so the wallet and the CLI (scripts/swap.ts) share it.
 */

export interface Route {
  currencyIn: Address
  currencyOut: Address
  hops: Hop[]
}

/** The best route between two currencies: a direct pool, else two hops through a currency both sides share. */
export function findRoute(u: UniswapDeployment, currencyIn: Address, currencyOut: Address): Route | null {
  if (sameCurrency(currencyIn, currencyOut)) return null
  const touches = (key: PoolKey, c: Address) => sameCurrency(key.currency0, c) || sameCurrency(key.currency1, c)
  const hop = (key: PoolKey, from: Address): Hop => ({ key, zeroForOne: sameCurrency(key.currency0, from) })
  const other = (key: PoolKey, c: Address) => (sameCurrency(key.currency0, c) ? key.currency1 : key.currency0)

  const direct = u.pools.find((k) => touches(k, currencyIn) && touches(k, currencyOut))
  if (direct) return { currencyIn, currencyOut, hops: [hop(direct, currencyIn)] }
  for (const first of u.pools.filter((k) => touches(k, currencyIn))) {
    const mid = other(first, currencyIn)
    const second = u.pools.find((k) => k !== first && touches(k, mid) && touches(k, currencyOut))
    if (second) return { currencyIn, currencyOut, hops: [hop(first, currencyIn), hop(second, mid)] }
  }
  return null
}

export interface Quote {
  route: Route
  amountIn: bigint
  amountOut: bigint
  /** amountOut at the pools' current mid prices, before fees and price impact. */
  amountAtMid: bigint
  /** Fraction lost to price impact (pool fees excluded), e.g. 0.004 = 0.4%. */
  priceImpact: number
  /** Total pool fee along the route, e.g. 0.0035 for 0.05% + 0.30%. */
  feeRate: number
  quotedAt: number
}

/** Mid price of one hop as output per input, in base units. */
async function midPrice(client: PublicClient, u: UniswapDeployment, hop: Hop): Promise<number> {
  const [sqrtP] = await client.readContract({ address: u.stateView, abi: abis.stateView, functionName: "getSlot0", args: [poolId(hop.key)] })
  if (sqrtP === 0n) throw new Error("This pool isn't initialized.")
  const p = priceFromSqrt(sqrtP) // currency1 per currency0
  return hop.zeroForOne ? p : 1 / p
}

export async function quote(client: PublicClient, u: UniswapDeployment, route: Route, amountIn: bigint): Promise<Quote> {
  if (amountIn <= 0n) throw new Error("Enter an amount.")
  const simulate = () =>
    route.hops.length === 1
      ? client.simulateContract({
          address: u.quoter,
          abi: abis.quoter,
          functionName: "quoteExactInputSingle",
          args: [{ poolKey: route.hops[0].key, zeroForOne: route.hops[0].zeroForOne, exactAmount: amountIn, hookData: "0x" }],
        })
      : client.simulateContract({
          address: u.quoter,
          abi: abis.quoter,
          functionName: "quoteExactInput",
          args: [{ exactCurrency: route.currencyIn, path: pathKeys(route.currencyIn, route.hops), exactAmount: amountIn }],
        })
  let amountOut: bigint
  try {
    amountOut = (await simulate()).result[0]
  } catch {
    throw new Error("No quote: the pool doesn't have enough liquidity for this amount.")
  }
  const mids = await Promise.all(route.hops.map((h) => midPrice(client, u, h)))
  const mid = mids.reduce((a, b) => a * b, 1)
  const feeRate = 1 - route.hops.reduce((acc, h) => acc * (1 - h.key.fee / 1_000_000), 1)
  const amountAtMid = BigInt(Math.floor(Number(amountIn) * mid))
  const afterFees = Number(amountAtMid) * (1 - feeRate)
  const priceImpact = afterFees > 0 ? Math.max(0, 1 - Number(amountOut) / afterFees) : 0
  return { route, amountIn, amountOut, amountAtMid, priceImpact, feeRate, quotedAt: Date.now() }
}

/**
 * Gas budget per frame. The devnet charges Amsterdam "state gas" for fresh storage (a first approval, Permit2's
 * allowance slot), so approvals get the same budget as a token transfer. Measured with `pnpm swap … --simulate`.
 */
const APPROVE_GAS = { execution: 150_000n, state: 250_000n }
const PERMIT2_GAS = { execution: 150_000n, state: 250_000n }
const swapGas = (hops: number) => ({ execution: 400_000n + 200_000n * BigInt(hops), state: 400_000n })

/**
 * The account's calls for an exact-input swap, meant to run as one atomic batch:
 * 1. approve exactly `amountIn` to Permit2,
 * 2. let the Universal Router pull that amount through Permit2 for this block only (expiration 0),
 * 3. UniversalRouter.execute(V4_SWAP: swap, settle from the account, take at least `amountOutMinimum` to it).
 * ETH in skips the approvals and sends `amountIn` as the call's value.
 */
export function swapCalls(
  u: UniswapDeployment,
  route: Route,
  amountIn: bigint,
  amountOutMinimum: bigint,
  deadline: bigint,
  symbols: { in: string; out: string },
): Call[] {
  const execute: Call = {
    to: u.universalRouter,
    data: encodeSwapExactIn({ currencyIn: route.currencyIn, currencyOut: route.currencyOut, hops: route.hops, amountIn, amountOutMinimum, deadline }),
    value: sameCurrency(route.currencyIn, NATIVE) ? amountIn : 0n,
    label: `Uniswap v4: swap ${symbols.in} for ${symbols.out}`,
    gas: swapGas(route.hops.length),
  }
  if (sameCurrency(route.currencyIn, NATIVE)) return [execute]
  return [
    {
      to: route.currencyIn,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [u.permit2, amountIn] }),
      label: `Approve ${symbols.in} to Permit2`,
      gas: APPROVE_GAS,
    },
    {
      to: u.permit2,
      data: encodeFunctionData({ abi: abis.permit2, functionName: "approve", args: [route.currencyIn, u.universalRouter, amountIn, 0] }),
      label: "Permit2: allow the Universal Router, this block only",
      gas: PERMIT2_GAS,
    },
    execute,
  ]
}

/** Route label for the review screen, e.g. "USDC → ETH · 0.30%". */
export const routeLabel = (route: Route, symbol: (c: Address) => string) =>
  [route.currencyIn, ...route.hops.map((h) => (h.zeroForOne ? h.key.currency1 : h.key.currency0))].map(symbol).join(" → ") +
  " · " +
  route.hops.map((h) => `${(h.key.fee / 10_000).toFixed(2)}%`).join(" + ")

/** Dollars per whole unit of each currency, from the pools' mid prices with USDC as $1. Unpriced currencies are left out. */
export async function usdPrices(
  client: PublicClient,
  u: UniswapDeployment,
  usdc: Address,
  currencies: { address: Address; decimals: number }[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await Promise.all(
    currencies.map(async (c) => {
      if (sameCurrency(c.address, usdc)) {
        out[c.address.toLowerCase()] = 1
        return
      }
      const route = findRoute(u, c.address, usdc)
      if (!route) return
      try {
        const mids = await Promise.all(route.hops.map((h) => midPrice(client, u, h)))
        // USDC base units per base unit of c, scaled to whole units.
        out[c.address.toLowerCase()] = (mids.reduce((a, b) => a * b, 1) * 10 ** c.decimals) / 1e6
      } catch {
        // an uninitialized pool just means no price
      }
    }),
  )
  return out
}

/** The v4 currency for a wallet asset: the token address, or NATIVE for ETH. */
export const currencyOf = (a: { kind: "eth" } | { kind: "erc20"; address: Address }): Address => (a.kind === "eth" ? NATIVE : a.address)
