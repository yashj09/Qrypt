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
