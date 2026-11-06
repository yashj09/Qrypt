# Architecture

## What happens when you press Send

```
browser (app/)                         our sidecar fork (ERC-8421 + BUDGET-010)          ethrex devnet (chain 1337)
──────────────                         ─────────────────────────────────────────         ──────────────────────────
build frame tx    ──┐
sign sighash with   │  eth_sendRawTransaction ───────────────────────────────────────────▶ canonical mempool: REJECT
Falcon-512 (noble) ─┤                                                                        (VERIFY gas > 100k, foreign SLOAD)
                    └─ eth_sendFrameTransaction ──▶ simulate + trace (ethrex_simulate…) ──▶
                                                    per-entity budgets: account staked ≤1M,
                                                    paymaster unstaked ≤100k → ADMIT
                                                    relay (ethrex_submitPrivilegedFrameTx) ─▶ included in a block
```

## The transaction

| # | Mode | Target | Execution gas | What it does |
|---|---|---|---|---|
| 0 | VERIFY, scope EXECUTION | account (null) | 950k | `QPayAccount` fallback: `sigparam` gets the signature length, `txparam(SIG_HASH)` gets the digest, `sigdatacopy` gets the 1064-byte Falcon signature, the verifier is staticcalled, then `approve(EXECUTION)` |
| 1 | VERIFY, scope PAYMENT | paymaster | 100k | `UsdcPaymaster` fallback: frame 2 must be a SENDER `usdc.transfer(paymaster, fee)` with `fee ≥ quote(TXPARAM.MAX_COST)`, and the sender must hold `fee`; then `approve(PAYMENT)` |
| 2 | SENDER | MockUSDC | 150k exec, 250k state | `transfer(paymaster, fee)`: the gas is repaid in USDC |
| 3… | SENDER | anything | 300k exec, 250k state by default | One frame per call: a payment, a token or ETH send, a dapp's `eth_sendTransaction`, `rotateKey`, or the close-account sweep |

The builder is `buildWalletTx` in `packages/frametx/src/qpay.ts`. The paymaster's rule only looks at frame 2, so frames 3 onward need no paymaster change. The fee is quoted from an upper bound on `max_cost`, plus 9k gas for each frame carrying ETH and a 2% margin.

`signatures[0]` is `{scheme: ARBITRARY, signer: 0x, msg: 0x, signature: <1064 bytes>}`. On this devnet the bytes of an entry with an empty `msg` are left out of the signature hash, so the account can sign the hash and carry its own signature in the same transaction.

## Contracts

| Contract | Path | Notes |
|---|---|---|
| `QPayAccount` | `contracts/src/QPayAccount.sol` | Stores the 1024-byte NTT-domain Falcon key in its own storage. It stakes in its constructor, which runs as the account, so `msg.sender` is the account. It has no ECDSA path and no `execute`: a SENDER frame already calls its target as the account. v2 adds `receive()`, `rotateKey(bytes)` (callable only by the account itself) and ERC-1271 `isValidSignature`. Because Solidity sends every empty-calldata call to `receive()`, a zero-value one runs the VERIFY logic |
| `MockToken` | `contracts/src/MockToken.sol` | Generic test ERC-20 with an open `mint`, deployed as tEUR for the demo dapp's faucet |
| `UsdcPaymaster` | `contracts/src/UsdcPaymaster.sol` | Price is an immutable, so validation reads none of its own storage. It reads only the sender's USDC balance slot, which is associated with the sender |
| `MockUSDC` | `contracts/src/MockUSDC.sol` | Non-proxy ERC-20 with 6 decimals. A proxy (real USDC) would read an implementation slot that is not associated with the sender |
| `QPayFalcon8Verifier` | `contracts/falcon/src/` | Adapter over ZKNOX `falcon_core8` (ETHFALCON `012e080`, experimental). `verify(pubkey, digest, sig) → 0x024ad318`. About 590k–640k gas |
| `FalconKeyConverter` | `contracts/falcon/src/` | Coefficient-domain key to NTT-domain key, read once with `eth_call` |
| `NaiveStakingRegistry` | `contracts/src/` | ERC-8421 `IStakingRegistry`, copied from the sidecar repo |

Frame opcodes come from `@forshtat/hegota-support` (vendored in `contracts/lib/hegota-support`). Solidity can't emit them, so each contract deploys one tiny Yul helper per opcode in its constructor.

## The mempool rule we added

The workshop sidecar sums every validation-prefix frame's execution limit against one flat `MAX_VERIFY_GAS = 100_000`, so no post-quantum signature can ever be admitted. Our fork implements ERC-8421 BUDGET-010 instead:

- It groups prefix execution gas by entity (frame target, with null meaning `tx.sender`) and charges signature-verification cost to the sender.
- Every entity must stay at or under `MAX_VERIFY_GAS_STAKED_ENTITY`. The default is 1M, configurable through `SKANDHA_MAX_VERIFY_GAS_STAKED_ENTITY`.
- An entity above `MAX_VERIFY_GAS_PER_ENTITY` (100k) must be staked: `stake ≥ minStake` and no withdrawal started.

The fork branch is [yashj09/mempool-workshop-sidecar@budget-010](https://github.com/yashj09/mempool-workshop-sidecar/tree/budget-010), sent upstream as [forshtat/mempool-workshop-sidecar#2](https://github.com/forshtat/mempool-workshop-sidecar/pull/2). The same change is in `sidecar/budget-010.patch`, against `2e22ff0`. It touches `validationPrefix.ts`, `validators/frameTx.ts` and their unit tests.

## Connecting dapps

```
dapp page                 popup flavour                            extension flavour
─────────                 ─────────────                            ─────────────────
EIP-1193 request ──▶ createEyriePopupProvider            inpage.js (EIP-6963 announce) ─▶ content.js ─▶ background.js
                     window.open(/connect?transport=popup)        chrome.windows.create(/connect?transport=extension&rid=…)
                            │ postMessage (origin from browser)               │ externally_connectable (origin from sender tab)
                            ▼                                                 ▼
                     /connect approval page (wallet origin, holds the Falcon key)
                     connect · personal_sign · eth_signTypedData_v4 · eth_sendTransaction
```

- Reads (`eth_call`, balances, receipts) go straight to the node; only the four approval methods open `/connect`.
- The requesting origin is never taken from the dapp's payload. The popup uses `MessageEvent.origin`; the extension uses the sender tab's URL.
- `eth_sendTransaction` becomes one call in a frame transaction, is submitted to our alt mempool (falling back to the hosted one), and returns the frame transaction hash.
- Signatures are Falcon-512 over the EIP-191 or EIP-712 hash. Dapps check them with the account's ERC-1271 `isValidSignature`.
- The extension (`extension/`, MV3, plain JS) holds no keys. It's a relay, so one account and one approval screen serve both flavours.

## Trust and limits

- The Falcon verifier and helper are unaudited research code (ZKNOX, experimental branch).
- The paymaster charges on `max_cost`, not on actual gas used. There is no post-op refund yet.
- Each user's Falcon key lives in their browser's local storage, recoverable only from their encrypted backup file. The CLI demo account's key lives in `.qpay/falcon-seed.hex`.
- The extension needs the hosted wallet site to be reachable, since approvals happen there.
