# Decisions

Each entry gives the date, the decision, and why. Newest last.

## 2026-11-06

**Target the EF alt-mempool prize with a post-quantum wallet that pays gas in USDC.** The prize asks for apps that need the alt mempool. It names PQ-secure smart wallets (VERIFY above 100k gas) and ERC-20 paymasters (flexible paymaster state access). Q-Pay does both in one transaction.

**Post-quantum is non-negotiable; the USDC paymaster is the second headline.** This was your call. If something has to give, the paymaster goes first.

**Falcon-512 in a VERIFY frame, checked by a ZKNOX falcon8 verifier through our adapter.** Spike S2 measured 590k to 637k gas per verify. The other measured options were the fused core (671k to 714k) and `ZKNOX_falcon` (3.95M). All three are unaudited experimental code, pinned at ETHFALCON commit `012e080`.

**Sign with `@noble/post-quantum`, not the kohaku WASM.** The kohaku WASM has no entropy source and replays the same randomness on every load. noble uses fresh randomness per signature. Its public key is in the coefficient domain, so we convert it once with `FalconKeyConverter.toNttKey`, a free `eth_call`.

**The signature travels in an ARBITRARY signature entry with an empty `msg`.** On the devnet layout that entry's bytes are elided from the signature hash, so the account signs the hash and reads its own signature with `SIGDATACOPY`. VERIFY frame data is committed to the hash, so it can't carry the signature.

**Solidity reaches the frame opcodes through `@forshtat/hegota-support`.** Plain Solidity can't emit APPROVE, TXPARAM or SIGDATACOPY. HegotaSupport deploys one Yul helper per opcode in each contract's constructor, so it works on any chain running the devnet's ethrex build. Its sources are vendored in `contracts/lib/hegota-support`, because solc can't follow pnpm's symlinks.

**Every current alt mempool caps validation at a flat 100k, so we run our own sidecar with ERC-8421 BUDGET-010.** The workshop sidecar (hosted and stock) sums all validation-prefix execution limits against `MAX_VERIFY_GAS = 100_000`, regardless of stake (`validationPrefix.ts`). The ERC-8421 draft budgets per entity: 100k unstaked, 1M staked. The docs' landing page says a PQ signature "needs stake". We implemented BUDGET-010 in a sidecar fork: per-entity sums, a staked ceiling set by `SKANDHA_MAX_VERIFY_GAS_STAKED_ENTITY` (default 1M), and a stake check for any entity above 100k. ethrex's simulate call treats the canonical cap as informational and still traces, so no ethrex change is needed.

**The account stakes itself from its constructor.** Its first Falcon transaction already needs the staked budget, so it can't stake through one. The registry keys stake by `msg.sender`, and a constructor runs as the account, so staking there works.

**The paymaster price is an immutable.** Its validation then reads no storage of its own. The only foreign storage it reads is the sender's MockUSDC balance, a slot associated with the sender.

**Use a local devnet (Kurtosis: ethrex plus Lighthouse).** The hosted devnet has been stalled at block `0x63ac6` since Thu 5 Nov 22:58 UTC, and its docs say it may be reset at any time. On this Mac we run it through Colima with Rosetta, because ethrex ships only an amd64 image.

## 6 Nov: product redesign

**The product is now called Eyrie.** An eyrie is a falcon's nest, and Falcon-512 is the signature scheme. "Q-Pay" collided with existing payment brands (QPay in Qatar and Mongolia). Candidates we checked and dropped: PostQ (a post-quantum startup already uses it), Sigil (several crypto wallets), Kestrel (a Solana DeFi product), Trellis and Saker (domains and brands taken). Only the UI, README and submission text are renamed. The contracts, `@qpay/*` packages and repo keep the old name, because renaming deployed contracts would mean redeploying them for nothing.

**Two visual layers: a light wallet and a dark "under the hood" inspector.** Users see a calm wallet. Judges see frames, gas and mempool verdicts. The inspector is open by default because that's what the EF prize is judged on. It reuses shadcn's `.dark` tokens by putting `className="dark"` on the panel, so there's one component set.

**Libraries: shadcn/ui on Base UI plus Motion, nothing else.** No Radix (the project already uses Base UI primitives), no Magic UI or Aceternity (decorative effects read as generic), no router (two routes, and `/app` is lazy-loaded so the landing page ships no viem or Falcon code).

**`lib/qpay.ts` only gained additive changes** (an onboarding progress callback and `estimateFee`), so the send path the judges use didn't change.

## 6 Nov (night): a full wallet

**Transactions are a list of calls.** `buildWalletTx` emits `[Falcon VERIFY, paymaster VERIFY, repay USDC, ...calls]`. The paymaster only inspects the frame after it, so any asset send, dapp call, key rotation or sweep needs no new contract. This replaced the fixed four-frame payment, which was a special case.

**Account v2, not a new contract family.** `receive()`, `rotateKey` and ERC-1271 were added to `QPayAccount`, and only the factory layer was redeployed (`pnpm deploy:account`): the verifier, USDC, paymaster and registry are unchanged. One trap: Solidity sends every empty-calldata call to `receive()`, including the zero-value VERIFY frame. So `receive()` runs the VERIFY logic when `msg.value == 0`, and accepts ETH otherwise.

**Closing an account needs no contract code.** The account calls the registry's `unlockStake` and `withdrawStake` from SENDER frames; with an unstake delay of 0, both fit in one transaction, followed by the sweeps.

**The fee bound is deliberately generous.** A frame carrying ETH and no calldata came out 2.9k gas over our `max_cost` model, and the paymaster rejected it with `FeeTooLow`. The bound now adds 9k gas per value frame and 2% overall, which is about 0.0003 USDC per transaction. Underpaying makes a transaction fail; overpaying by a fraction of a cent doesn't.

**Dapp connect has one approval page and two ways in.** The `/connect` page on the wallet's origin is the only code that touches the Falcon key. The popup provider reaches it with `window.open` and `postMessage`. The extension is a key-less relay that opens the same page and gets the answer back through `externally_connectable`. We rejected a self-contained extension wallet with its own key store: it would mean two accounts, two approval UIs, and a key in extension storage. In both flavours the requesting origin comes from the browser, never from the dapp.

**Sign-in uses ERC-1271, not ECDSA recovery.** A Falcon signature can't be `ecrecover`ed, so dapps call the account's `isValidSignature`. It costs about 0.7M gas, but it's free in an `eth_call`.

**Activity comes from chain logs.** `Transfer` events in and out, plus the devnet's EIP-7708 ETH transfer logs from `0xff…fe`, so the history follows the account to any device. Local storage keeps only attempts that never reached the chain.

**Key backup is a password-encrypted file, made in the browser.** It uses PBKDF2-SHA-256 at 600k rounds and AES-GCM, through WebCrypto with no dependency. Restoring compares the decrypted key with the account's onchain `falconPubkey`, so a backup that was rotated away is refused rather than silently installed.

**Extension testing is automated.** `pnpm test:extension` loads the unpacked extension in Playwright's Chromium and runs discover, connect, sign-in and claim against the live devnet.

## 7 Nov: the extension becomes the wallet

**The key moves into the extension.** The first extension was a key-less relay to the website's `/connect`, which made "Open wallet" just open a website. A Talisman-style wallet needs the key where the UI is: popup, fullscreen dashboard and approval window all inside the extension. The website keeps its own key for people without the extension; a backup file moves an account between them. This reverses the 6 Nov "one account, two ways in" decision, on purpose.

**Envelope encryption with a session key.** A random data key encrypts the seed; the password (PBKDF2, 600k) and optionally Touch ID (WebAuthn PRF + HKDF) each wrap that data key. The unlocked data key lives in `chrome.storage.session`, which survives the service worker being killed but not a browser restart. Auto-lock is 15 idle minutes.

**Touch ID only where it's real.** Chrome's own profile passkeys don't support PRF; iCloud Keychain passkeys do (Chrome 132+). We create the passkey, check whether PRF came back, and only then wrap the key. Otherwise we say so and keep the password.

**One codebase, two builds.** Signing goes through a `KeyStore` interface and all wallet state lives in `useWallet()`, so the website, popup and dashboard share every feature. The extension pages are a second Vite build of the same `src`.

**Approvals inside the extension.** The background worker opens `approve.html`, which unlocks first if needed and reuses the website's review/execute code. `externally_connectable` is gone: nothing outside the extension can talk to it except through the page provider.
