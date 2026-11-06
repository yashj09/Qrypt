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
dapp page                 web wallet (no install)                       Qrypt extension
─────────                 ───────────────────────                       ───────────────
EIP-1193 request ──▶ createQryptPopupProvider               inpage.js (EIP-6963 announce) ─▶ content.js ─▶ background.js
                     window.open(/connect)                               chrome.windows.create(approve.html?rid=…)
                            │ postMessage (origin from browser)                  │ chrome.runtime messages (origin from sender tab)
                            ▼                                                    ▼
                     /connect, key in the site's localStorage      approve.html, key in the vault (unlock first if locked)
                            └──────────── same review / execute code (lib/connect/approve.ts) ───────────┘
```

- Reads (`eth_call`, balances, receipts) go straight to the node; only the four approval methods open an approval screen.
- The requesting origin is never taken from the dapp's payload. The popup uses `MessageEvent.origin`; the extension uses the sender tab's URL.
- `eth_sendTransaction` becomes one call in a frame transaction, is submitted to our alt mempool (falling back to the hosted one), and returns the frame transaction hash.
- Signatures are Falcon-512 over the EIP-191 or EIP-712 hash. Dapps check them with the account's ERC-1271 `isValidSignature`.
- The two wallets hold separate keys. The extension's pages (popup, dashboard, onboarding, approve) are built from the same `app/src` as the website, by `app/vite.extension.config.ts`, into `extension/dist`.

## The vault (extension and web wallet)

`lib/vault/core.ts` is one implementation with two storage backends: `chrome.storage` in the extension, and `localStorage` / `sessionStorage` on the website.

- A random 256-bit data key encrypts the Falcon seed with AES-GCM. The data key is wrapped once per unlock method: by a PBKDF2-SHA-256 key from the password (600k rounds), and optionally by an HKDF key from Touch ID's WebAuthn PRF output.
- Unlocking puts the data key in `chrome.storage.session`: memory only, cleared on browser restart, not readable by content scripts. The background worker's alarm clears it after 15 idle minutes; activity in any extension page keeps it alive.
- Signing reads the seed through the `KeyStore` interface (`lib/keystore.ts`). The website plugs in localStorage; the extension plugs in the vault. Everything above that (`useWallet`, the components) is shared.
- On the website, the unlocked data key lives in `sessionStorage`, and a plain seed left by an older version is moved into the vault on the next visit.
- Touch ID / Face ID is offered only when `getClientExtensionResults().prf` comes back enabled. Without PRF there's no secret to wrap the key with, and a fingerprint gate that doesn't encrypt anything would be theatre.
- The extension fetches `/api/config` at startup for the current alt-mempool URL, so restarting the tunnel doesn't require a new build.

## Face ID recovery

- Creating with Face ID makes a discoverable passkey for `qrypt.money` with PRF. Its PRF output, through HKDF, gives a key-encryption key (KEK).
- The client seals the Falcon seed under the KEK and `PUT`s `/api/recovery` with `{id: sha256(credentialId), record, ts, signature}`. The signature is the account's current Falcon key over `Qrypt recovery v1 / id / account / sha256(record) / ts`. The server checks it by calling the account's ERC-1271 `isValidSignature`, accepts a timestamp within 5 minutes, and refuses to point an existing id at a different account. Records go to a private Vercel Blob store.
- On a new device, "recover with Face ID" asks for any Qrypt passkey, fetches the record by the credential's hash, decrypts it, and checks onchain that the key still controls the account.
- Rotating the key re-uploads the record, signed by the new key.

## One dashboard, three hosts

`components/dashboard/wallet-dashboard.tsx` is the wallet on wide screens: a sidebar (Portfolio, Send, Activity, Under the hood, Settings) and the open section in the URL hash. The website's `/app` and the extension's fullscreen tab both render it on the same `useWallet()`; each passes its own settings cards and lock, and the extension adds Connected sites. "Keep open beside wallet" pins the inspector as a right panel on screens 1280 px and wider (`localStorage` `qrypt.pinHood`). Sections size their columns with container queries, so they stack when the panel is open. Phones get `components/mobile/` instead; the popup has its own compact layout. Every wallet page is dark; only the landing page is light.

## Phone app and push

- `/app` below 768 px renders `components/mobile/`: home, number-pad send, receive (QR of a pay link), scan (`qr-scanner`), activity, settings. Pay links, EIP-681 URIs and plain addresses all parse through `lib/payment-request.ts`.
- `manifest.webmanifest`, the icons (`pnpm icons`) and the Apple meta tags make it installable. `public/sw.js` has no fetch handler and no cache, so the code that runs is always the deployed code. It only shows push notifications and opens the app when one is tapped.
- Turning notifications on subscribes the browser (VAPID) and `POST`s `/api/push` with the subscription, signed by the Falcon key and checked through ERC-1271 like recovery. Only known push-service hosts are accepted.
- `scripts/push-watcher.ts` runs on the laptop. It reloads subscriptions from Blob every minute, reads `Transfer` logs to those accounts every 4 seconds (ERC-20s, and ETH through the EIP-7708 system address), and sends Web Push. Subscriptions the push service reports gone are deleted.

## Trust and limits

- The Falcon verifier and helper are unaudited research code (ZKNOX, experimental branch).
- The paymaster charges on `max_cost`, not on actual gas used. There is no post-op refund yet.
- Each user's Falcon key lives in their browser, encrypted by the vault, and is recoverable from their backup file or, with Face ID, from the ciphertext on our server.
- Recovery and notifications use our private Blob store; notifications also need the laptop watcher. The CLI demo account's key lives in `.qpay/falcon-seed.hex`.
- The extension needs the hosted wallet site to be reachable, since approvals happen there.
