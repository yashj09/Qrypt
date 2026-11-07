# Submission text (ETHGlobal dashboard)

## Project name

Qrypt

## Short description (one line)

A post-quantum wallet on EIP-8141: a Falcon-512 account with 0 ETH pays gas in USDC, connects to dapps by popup or Chrome extension, and is admitted by an ERC-8421 alt mempool.

## Description

A brand-new Ethereum account that holds only USDC sends a payment. A Falcon-512 post-quantum signature authorizes it, and the account has no ECDSA key at all. A permissionless paymaster pays the gas and takes it back in USDC inside the same transaction. There is no bundler, relayer or paymaster server.

It is a single EIP-8141 frame transaction with four frames:
1. The account's VERIFY frame reads the signature hash and the Falcon signature with the frame opcodes, and checks them onchain with a ZKNOX Falcon verifier. That costs about 700k gas.
2. The paymaster's VERIFY frame introspects the next frame. It checks that the frame repays at least the quoted fee in USDC and that the sender holds it.
3. A SENDER frame repays the gas in USDC.
4. A SENDER frame sends the payment.

That validation can't get into any mempool that exists today. The canonical mempool caps validation at 100k gas. The current ERC-8421 sidecar applies one flat 100k cap to the whole validation prefix, staked or not. We implemented the per-entity budget from the ERC-8421 draft (BUDGET-010) in the sidecar: up to 1M for a staked entity, 100k for an unstaked one. With it, the staked account's Falcon check and the unstaked paymaster's check are each admitted on their own budget. We sent the change upstream as a PR, with unit tests.

The app sends the same signed transaction to three places and shows the live response from each:
- the canonical mempool rejects it;
- the organisers' hosted alt mempool admits it now that the devnet's validation limits were lifted mid-event (before that it rejected it, and the official explorer still shows that record);
- ours admits it under a bounded, stake-gated budget, and it lands on the public devnet.

The app then shows the per-frame gas from the receipt. A tampered signature is rejected in VERIFY, and so is an underpaid fee. Nothing is charged in either case.

Payments are where it starts; Qrypt is a whole wallet on the same transactions:
- **Any asset:** send and receive USDC, ETH and any ERC-20, with a QR receive screen and an activity list read from chain logs.
- **Browser extension:** a full wallet in the toolbar with a fullscreen dashboard, its Falcon key in a password-locked vault (envelope encryption, auto-lock, Touch ID through WebAuthn PRF where supported). Dapps discover it through EIP-6963 and approve in the extension's own window.
- **No-install path:** dapps can also reach the web wallet through a popup provider. A demo dapp at `/dapp` connects, signs in, and claims test tokens either way.
- **Sign in with Qrypt:** messages and typed data are signed with Falcon-512, and dapps verify them onchain through the account's ERC-1271.
- **Key safety:** a password-encrypted backup file that is checked onchain on restore, key rotation signed by the old key, and closing the account (unstake and sweep) in one transaction.

## How it's made

- **Contracts (Solidity, Foundry):**
  - `QPayAccount`, a Falcon-only smart account. It stakes itself in its constructor, so its first transaction already gets the staked budget.
  - `UsdcPaymaster`. Its price is an immutable, so validation reads none of its own storage.
  - `MockUSDC`, a non-proxy token. Its balance slots count as associated with the sender.
  - The frame opcodes (APPROVE, TXPARAM, SIGPARAM, SIGDATACOPY, FRAMEPARAM, FRAMEDATALOAD) are reached through `@forshtat/hegota-support`'s Yul helpers.
- **Post-quantum:**
  - Falcon-512 signing happens in the browser with `@noble/post-quantum`, which uses fresh randomness per signature.
  - Verification uses ZKNOX ETHFALCON's experimental `falcon_core8`, behind an ERC-7913-style adapter we wrote.
  - A converter contract turns the signer's coefficient-domain key into the verifier's NTT-domain key once, with a free `eth_call`.
- **Mempool:** a fork of forshtat/mempool-workshop-sidecar with ERC-8421 BUDGET-010, meaning per-entity gas sums, a staked ceiling, and a stake check. It relays admitted transactions to ethrex through `ethrex_submitPrivilegedFrameTransaction`.
- **Client:** a TypeScript frame-transaction builder on the devnet's wire layout. In it, the Falcon signature sits in an ARBITRARY signature entry, which is left out of the signature hash. The client is built with viem, Vite, React, shadcn/ui on Base UI, and Motion. It has a landing page and the app: one dark dashboard shared with the extension, with an "under the hood" inspector (pinnable beside any screen) that shows the live mempool verdicts, per-frame gas against the 100k cap, and stress tests. Phones get their own layout and an installable PWA. The transaction builder takes any list of calls after the three fixed frames, which is what every wallet feature builds on.
- **Extension:** MV3, its pages built from the same React code as the website (a `KeyStore` interface swaps localStorage for an encrypted vault). Approvals happen in an extension window that reuses the website's review/execute code. Tested end to end with Playwright's Chromium against the live devnet: onboarding, lock/unlock, popup send, EIP-6963 connect, ERC-1271 sign-in, a dapp transaction, key rotation, backup and import.
- **No-install connect:** an EIP-1193 popup provider and the website's `/connect` approval page.
- **Account v2:** `receive()`, `rotateKey` callable only by the account itself, and ERC-1271. Solidity routes empty-calldata calls to `receive()`, so a zero-value one runs the VERIFY logic.
- **Infrastructure:**
  - The demo runs on the public alt-mempool devnet (chain 1337).
  - We also have a local fallback devnet: ethrex plus Lighthouse through Kurtosis.
  - The published ethrex image hangs under Rosetta on Apple Silicon, so the fallback uses ethrex built natively for arm64.

## Partner prize: Ethereum Foundation, Best use of the Frame Transaction Alternative Mempool

**How we used it.** Qrypt needs both things the brief names:
- a verification budget well above 100k, for the post-quantum smart wallet;
- flexible paymaster state access, for the ERC-20 paymaster.

Both are in one transaction. The canonical mempool rejects it. We admit it on the alt mempool by implementing BUDGET-010. Our evidence is a transaction included in block 726 on the public devnet, the stock Gateway's rejection record in the official explorer, and the upstream PR https://github.com/forshtat/mempool-workshop-sidecar/pull/2.

**Feedback:**
1. **No post-quantum signature can ever be admitted today.** The sidecar enforces one flat `MAX_VERIFY_GAS` over the whole prefix, and staking doesn't change that. The docs' landing page says a post-quantum signature "needs stake", but nothing in the code makes stake help. Our PR implements the draft's per-entity budgets.
2. **The budget numbers disagree.** The draft says 1M for a staked entity; the landing page says 2.5M. Settling on one number would help builders size their VERIFY frames.
3. **The devnet stalled, then went down, then was reset during the hackathon.** A status page or a heads-up in Discord would save teams hours. After a reset, frame transactions only work from block 64 (about 6.5 minutes in), which isn't documented.
4. **The ethrex image is amd64 only, and it hangs under Rosetta on Apple Silicon.** A multi-arch image would make local devnets much easier. Kurtosis on Colima also needs a docker-socket workaround.
5. **The devnet's signature hash and the current EIP-8141 text differ.** The devnet replaces an elided ARBITRARY signature with empty bytes; the EIP now commits to its length. The devnet also keeps the top-level recent-roots field. Builders following the EIP will compute the wrong hash.
6. **Real USDC on the devnet is a proxy.** A paymaster that reads its balance touches the implementation slot, which isn't associated with the sender, so the paymaster has to be staked. A non-proxy test stablecoin predeploy, or a note in the docs, would help.
7. **The hegota-support package is very helpful.** One rough edge: its Solidity sources can't be reached through pnpm's symlinked `node_modules` without vendoring them.

## Partner prize: Uniswap Foundation, Build with Uniswap

**How we used it.** The devnet had no DEX, so we deployed Uniswap v4 ourselves from the official npm artifacts:
- the contracts: PoolManager, PositionManager, Universal Router 2.1.0, V4Quoter and StateView, with the predeployed canonical Permit2;
- the pools: USDC/tEUR (0.05%) and native ETH/USDC (0.30%, at the paymaster's own price). tEUR↔ETH routes through USDC as a two-hop v4 swap.

A Qrypt swap is one Falcon-signed EIP-8141 frame transaction:
- three calls: `token.approve(Permit2)`, `Permit2.approve(router, amount, expiration 0)` (this block only) and `UniversalRouter.execute(V4_SWAP)`;
- they run as an atomic batch, so a revert after the approvals undoes them;
- gas is paid in USDC by our paymaster, and the account holds no ETH.

The wallet quotes with V4Quoter and shows price impact against `StateView`. It re-quotes before signing, and has slippage, minimum received and a high-impact confirmation. Swap is on the web, the phone and the extension. Code pointers are in the README's "Uniswap v4" section; developer feedback is in `FEEDBACK.md`.

## Partner prize: World, Best Use of IDKit

**Trust event:** sponsoring a new account. Each one costs our float 0.02 ETH of stake and 100 USDC, so without a check one person could drain it. **Credential:** World ID 4.0 Proof of Human, the minimum that answers "is this a different human?". Passport allows several per person, Selfie Check is medium assurance, and we need no attributes.

- The proof's signal is `keccak256` of the Falcon public key being sponsored, so it can't be reused for another key.
- The server checks the action, environment, credential and binding, verifies the proof with `developer.world.org/api/v4/verify`, and claims the nullifier atomically.
- Paths, all tested against World's staging network with the Simulator:
  - success;
  - the same human again, refused and offered recovery;
  - cancel, which returns to create, recover with Face ID, or import a backup.
- Integration debrief: `docs/world-id.md`.

## Links

- Live app: https://qrypt.money (World ID runs on a staging app: verify with the World ID Simulator)
- Demo dapp: https://qrypt.money/dapp
- Chrome extension (load unpacked): https://qrypt.money/qrypt-extension.zip
- Repo: https://github.com/yashj09/qpay
- Sidecar fork (BUDGET-010): https://github.com/yashj09/mempool-workshop-sidecar/tree/budget-010
- Upstream PR: https://github.com/forshtat/mempool-workshop-sidecar/pull/2
- Demo video: to be added
