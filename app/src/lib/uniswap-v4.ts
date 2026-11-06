import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, zeroAddress, type Address, type Hex } from "viem"

/**
 * Uniswap v4 for Qrypt: pool keys, price math and call encoding, with no network access. Used by the deploy script
 * (scripts/deploy-uniswap.ts) and the wallet (lib/swap.ts). Constants follow the pinned sources:
 * @uniswap/v4-periphery@1.0.3 src/libraries/Actions.sol and src/libraries/PathKey.sol, and
 * @uniswap/universal-router@2.1.0 contracts/libraries/Commands.sol.
 *
 * Swap structs, for the deployed Universal Router 2.1.0 (checked against it with eth_call):
 * - ExactInputSingleParams has the 2.0 layout: poolKey, zeroForOne, amountIn, amountOutMinimum, hookData.
 * - ExactInputParams adds `uint256[] minHopPriceX36` after the path (per-hop minimum prices; empty disables them).
 * The 1.0.3 package's IV4Router.sol still shows the 2.0 multi-hop layout, and router 2.1.1 later added
 * minHopPriceX36 to the single-hop struct too; @uniswap/v4-sdk's v4Planner.ts tracks these versions.
 */

/** Canonical Permit2; the devnet has it predeployed at the usual address. */
export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
/** v4 represents native ETH as the zero address. */
export const NATIVE: Address = zeroAddress

export const Actions = {
  MINT_POSITION: 0x02,
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE_ALL: 0x0f,
  SWEEP: 0x14,
} as const

export const Commands = { V4_SWAP: 0x10 } as const

export interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

export interface UniswapDeployment {
  poolManager: Address
  positionManager: Address
  universalRouter: Address
  quoter: Address
  stateView: Address
  permit2: Address
  pools: PoolKey[]
}

const POOL_KEY = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const

const POOL_KEY_FIELD = { ...POOL_KEY, name: "poolKey" } as const

const PATH_KEY = {
  type: "tuple[]",
  components: [
    { name: "intermediateCurrency", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
    { name: "hookData", type: "bytes" },
  ],
} as const

export const abis = {
  positionManager: parseAbi([
    "function initializePool((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) payable returns (int24)",
    "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
    "function multicall(bytes[] data) payable returns (bytes[] results)",
  ]),
  universalRouter: parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]),
  permit2: parseAbi([
    "function approve(address token, address spender, uint160 amount, uint48 expiration)",
    "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  ]),
  quoter: parseAbi([
    "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
    "function quoteExactInput((address exactCurrency, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)",
  ]),
  stateView: parseAbi([
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
  ]),
}

const lower = (a: Address) => a.toLowerCase()
export const sameCurrency = (a: Address, b: Address) => lower(a) === lower(b)

/** A pool's currencies must be sorted by address; native ETH (0x0) always comes first. */
export function poolKey(a: Address, b: Address, fee: number, tickSpacing: number, hooks: Address = zeroAddress): PoolKey {
  const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a]
  return { currency0, currency1, fee, tickSpacing, hooks }
}

export const poolId = (key: PoolKey): Hex => keccak256(encodeAbiParameters([POOL_KEY], [key]))

// --- price math -------------------------------------------------------------------------------------------------

const Q96 = 2n ** 96n
const Q192 = 2n ** 192n

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt of a negative number")
  if (n < 2n) return n
  // Newton's method descending from a power of two above the root: monotone, exact, and a few dozen steps at most.
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2))
  for (;;) {
    const y = (x + n / x) >> 1n
    if (y >= x) return x
    x = y
  }
}

/**
 * sqrt(price) in Q64.96, where price is currency1 base units per currency0 base unit, given as a fraction
 * `amount1 / amount0` of base units (e.g. 3000e6 USDC per 1e18 wei).
 */
export const sqrtPriceX96 = (amount1: bigint, amount0: bigint): bigint => isqrt((amount1 * Q192) / amount0)

/** currency1 base units per currency0 base unit, as a float for display. */
export const priceFromSqrt = (sqrtP: bigint): number => {
  const ratio = Number((sqrtP * sqrtP * 10n ** 18n) / Q192) / 1e18
  return ratio
}

/**
 * Liquidity for a full-range position that uses at most `amount0` and `amount1`. With the bounds at the extreme ticks,
 * L = min(amount0 · sqrtP / Q96, amount1 · Q96 / sqrtP) to well under a basis point; 0.5% is held back for rounding.
 */
export function fullRangeLiquidity(sqrtP: bigint, amount0: bigint, amount1: bigint): bigint {
  const l0 = (amount0 * sqrtP) / Q96
  const l1 = (amount1 * Q96) / sqrtP
  const l = l0 < l1 ? l0 : l1
  return (l * 995n) / 1000n
}

const MAX_TICK = 887272
export const fullRangeTicks = (tickSpacing: number) => {
  const max = Math.floor(MAX_TICK / tickSpacing) * tickSpacing
  return { tickLower: -max, tickUpper: max }
}

/** Minimum output after slippage, in basis points (50 = 0.5%). */
export const minOut = (amountOut: bigint, slippageBps: number): bigint => (amountOut * BigInt(10_000 - slippageBps)) / 10_000n

// --- encoding -----------------------------------------------------------------------------------------------------

const actionsBytes = (actions: number[]): Hex => `0x${actions.map((a) => a.toString(16).padStart(2, "0")).join("")}`

const routerInput = (actions: number[], params: Hex[]): Hex =>
  encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actionsBytes(actions), params])

const currencyAndAmount = (currency: Address, amount: bigint): Hex =>
  encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currency, amount])

/** One hop of a route: the pool and the direction of the swap through it. */
export interface Hop {
  key: PoolKey
  zeroForOne: boolean
}

/** `UniversalRouter.execute` calldata for an exact-input swap that pays from and pays out to the caller. */
export function encodeSwapExactIn(p: {
  currencyIn: Address
  currencyOut: Address
  hops: Hop[]
  amountIn: bigint
  amountOutMinimum: bigint
  deadline: bigint
}): Hex {
  let swap: { action: number; param: Hex }
  if (p.hops.length === 1) {
    const [hop] = p.hops
    swap = {
      action: Actions.SWAP_EXACT_IN_SINGLE,
      param: encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              POOL_KEY_FIELD,
              { name: "zeroForOne", type: "bool" },
              { name: "amountIn", type: "uint128" },
              { name: "amountOutMinimum", type: "uint128" },
              { name: "hookData", type: "bytes" },
            ],
          },
        ],
        [{ poolKey: hop.key, zeroForOne: hop.zeroForOne, amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum, hookData: "0x" }],
      ),
    }
  } else {
    swap = {
      action: Actions.SWAP_EXACT_IN,
      param: encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "currencyIn", type: "address" },
              { ...PATH_KEY, name: "path" },
              { name: "minHopPriceX36", type: "uint256[]" },
              { name: "amountIn", type: "uint128" },
              { name: "amountOutMinimum", type: "uint128" },
            ],
          },
        ],
        // An empty per-hop price list is allowed (the router checks length 0 or path length); amountOutMinimum
        // already bounds the whole swap.
        [{ currencyIn: p.currencyIn, path: pathKeys(p.currencyIn, p.hops), minHopPriceX36: [], amountIn: p.amountIn, amountOutMinimum: p.amountOutMinimum }],
      ),
    }
  }
  const input = routerInput(
    [swap.action, Actions.SETTLE_ALL, Actions.TAKE_ALL],
    [swap.param, currencyAndAmount(p.currencyIn, p.amountIn), currencyAndAmount(p.currencyOut, p.amountOutMinimum)],
  )
  return encodeFunctionData({
    abi: abis.universalRouter,
    functionName: "execute",
    args: [actionsBytes([Commands.V4_SWAP]), [input], p.deadline],
  })
}

/** A v4 path names each hop by the currency it arrives at. */
export function pathKeys(currencyIn: Address, hops: Hop[]) {
  let current = currencyIn
  return hops.map(({ key }) => {
    const next = sameCurrency(key.currency0, current) ? key.currency1 : key.currency0
    current = next
    return { intermediateCurrency: next, fee: key.fee, tickSpacing: key.tickSpacing, hooks: key.hooks, hookData: "0x" as Hex }
  })
}

/** `PositionManager.modifyLiquidities` calldata to mint a position (and return leftover native ETH to `owner`). */
export function encodeMint(p: {
  key: PoolKey
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount0Max: bigint
  amount1Max: bigint
  owner: Address
  deadline: bigint
}): Hex {
  const mint = encodeAbiParameters(
    [POOL_KEY, { type: "int24" }, { type: "int24" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "address" }, { type: "bytes" }],
    [p.key, p.tickLower, p.tickUpper, p.liquidity, p.amount0Max, p.amount1Max, p.owner, "0x"],
  )
  const settle = encodeAbiParameters([{ type: "address" }, { type: "address" }], [p.key.currency0, p.key.currency1])
  const native = sameCurrency(p.key.currency0, NATIVE)
  const actions = native ? [Actions.MINT_POSITION, Actions.SETTLE_PAIR, Actions.SWEEP] : [Actions.MINT_POSITION, Actions.SETTLE_PAIR]
  const params = native
    ? [mint, settle, encodeAbiParameters([{ type: "address" }, { type: "address" }], [NATIVE, p.owner])]
    : [mint, settle]
  return encodeFunctionData({ abi: abis.positionManager, functionName: "modifyLiquidities", args: [routerInput(actions, params), p.deadline] })
}
