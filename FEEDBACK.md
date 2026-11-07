# Uniswap developer feedback

Qrypt is a post-quantum smart-account wallet on an EIP-8141 devnet (chain 1337). We deployed Uniswap v4 there ourselves and built swaps into the wallet. Each swap is one Falcon-signed frame transaction: approve to Permit2, a one-block Permit2 allowance, and `UniversalRouter.execute`, run as an atomic batch with gas paid in USDC. Code: [`scripts/deploy-uniswap.ts`](scripts/deploy-uniswap.ts), [`app/src/lib/uniswap-v4.ts`](app/src/lib/uniswap-v4.ts), [`app/src/lib/swap.ts`](app/src/lib/swap.ts).

## What worked well

- **Compiled artifacts in the npm packages.** `@uniswap/v4-core` ships `out/`, `@uniswap/v4-periphery` ships `foundry-out/`, and `@uniswap/universal-router` ships `artifacts/`. We deployed PoolManager, PositionManager, V4Quoter, StateView and the Universal Router to a chain Uniswap has never seen, with no compiler and no submodules. Everything is under the 24 KB limit and needs no linking.
- **Canonical Permit2** was already predeployed on the devnet, so the router and PositionManager could use the standard address.
- **PositionManager `multicall([initializePool, modifyLiquidities])`** seeds a pool in one transaction, including native ETH with `SWEEP` for the change.
- **V4Quoter** works through a plain `eth_call` (viem `simulateContract`), and `StateView.getSlot0` gives the mid price for price impact.
- **Native ETH as `currency0 = address(0)`** let a smart account with 0 ETH buy and sell ETH without WETH.
- **Permit2 `expiration = 0` means "this block only".** That's the right allowance for an atomic batch: if the swap reverts, nothing usable is left behind. It's only documented in `Allowance.sol`.

## Friction

1. **Swap struct layouts don't match the published periphery.** `@uniswap/universal-router@2.1.0` expects `ExactInputParams` with a `uint256[] minHopPriceX36` after the path. `@uniswap/v4-periphery@1.0.3`, the latest periphery on npm, still shows the old struct in `IV4Router.sol`. Encoding from the periphery package makes every multi-hop swap revert **with no revert data**. The single-hop struct in 2.1.0 is still the old one, but `@uniswap/v4-sdk`'s `v4Planner.ts` says the 2.1.1 router adds `minHopPriceX36` there too. We only worked it out by reading the SDK and testing both layouts with `eth_call`.
   - **Ask:** publish the periphery commit each router release is built from, document the struct per router version, and make `CalldataDecoder` revert with a selector, not empty data.
2. **Malformed action params revert without data.** The strict-encoding checks in `CalldataDecoder` are good, but a silent revert is the hardest failure to debug. A `MalformedParams(uint256 actionIndex)` error would have saved an hour.
3. **`RouterParameters` gained `spokePool` in 2.1.0.** It isn't in the deployment docs, so a constructor call copied from the docs fails to encode.
4. **Self-hosting v4 on a new chain isn't a documented path.** The Trading API and routing are mainnet-chain only, which is fair. A short guide would help teams on devnets and appchains: deploy these five artifacts, with these constructor arguments, then initialize and seed a pool. The `foundry-out` deploy scripts exist but aren't mentioned.
5. **Permit2 for smart accounts.** A contract account can't sign Permit2 messages the usual way, so every swap is three calls: `token.approve(Permit2)`, `Permit2.approve(router, amount, 0)`, `execute`. A documented pattern for "smart account, no signatures, atomic batch" would help, or a router path that pulls with a plain ERC-20 allowance.

## The one improvement we'd most want

Struct layouts per Universal Router version in the docs, with a revert reason on malformed params. Everything else was smooth.
