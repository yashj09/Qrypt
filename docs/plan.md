# Q-Pay implementation plan

## Context

**Event.** ETHGlobal Mumbai. Solo, with Claude Code writing the code. Submissions are due **Sat 7 Nov 09:00 IST**, and you have about 20 or more build hours.

**Goal.** First a finalist slot, then the EF prize "Best use of the Frame Transaction Alternative Mempool" ($5k). The prize asks for apps that *need* the alt mempool. It names two examples: (a) VERIFY budget above 100k, such as PQ-secure smart wallets; (b) flexible paymaster state access, such as ERC-20 or quota paymasters. To qualify you must show real alt-mempool usage, meaning an admitted tx on the devnet explorer or code that submits one, and be able to explain the design and its trade-offs.

**Product.** A brand-new account with 0 spendable ETH sends USDC. One EIP-8141 frame transaction does three things:
- a **Falcon post-quantum signature** is checked in the account's VERIFY frame;
- a **USDC paymaster** VERIFY frame approves payment, and the account repays the gas in USDC;
- the USDC transfer runs.

The canonical mempool rejects it, and the alt mempool admits it.

**Decisions you made.**
- New standalone repo.
- **Post-quantum is non-negotiable.**
- Frontend is Vite + React + TS + shadcn.
- If Falcon doesn't fit, run our own sidecar with a new rule (no DEFAULT-gate hack).
- The account is pre-deployed by a script.
- Build ethrex locally as insurance, in parallel.

## Research findings that shape the design (6 Nov)

1. **The devnet runs an older EIP-8141 layout than eips.ethereum.org.**
   - ethrex is `v23.0.0-eip8141-tracer-9aa3645d`, chain id `0x539`.
   - The tx is `0x06 || rlp([chain_id, nonce_keys[], nonce_seq, sender, frames, signatures, [prio, maxFee, maxBlobFee], blobs, recent_roots])`.
   - The signature hash replaces signature bytes with **empty bytes** when `msg` is empty, so a Falcon signature placed in an ARBITRARY signature entry is excluded from the hash.
   - We build to the devnet layout using the sidecar codec or the npm package `@forshtat/hegota-support@0.0.1`.
2. **The admission cap.**
   - The devnet sidecar code enforces a **flat `MAX_VERIFY_GAS = 100_000`**.
   - The newer ERC-8421 draft (BUDGET-010) allows **1M for staked entities**. Whether the hosted devnet applies that is unverified.
   - Staking is cheap on the devnet: `NaiveStakingRegistry` at `0xd51c…2d2f`, min stake 0.01 ETH, unstake delay 0.
   - An unstaked paymaster can't touch its own storage.
3. **Falcon costs.**
   - NIST `ZKNOX_falcon` costs 3.9M gas. `ZKNOX_falcon_fused` costs about 0.73M (exp branch, Fireblocks keccak helper, solc 0.8.30 via-IR).
   - The only browser signer is kohaku's NIST Falcon WASM: `packages/pq-account/js/software-signer/falconSigner.js`, producing a 1064-byte signature and a 1024-byte compact key. So the verifier **must be a NIST variant**.
   - Prior art: pq-dksap uses Dilithium in a DEFAULT frame, which is a weaker pattern. I found no Falcon-in-VERIFY implementation.
4. **Solidity can't emit APPROVE, TXPARAM or SIGDATACOPY.**
   - The workshop's `HegotaSupport` delegatecalls tiny Yul helpers. Only APPROVE and SIGPARAM are verified on the devnet.
   - Fallbacks are a hand-written Yul account, or the solc fork `chiranjeev13/solidity v0.8.38-eip8141.0` (untested).
   - Foundry and anvil don't know these opcodes. Frame logic only runs on ethrex, or through `ethrex_simulateFrameTransaction`.
5. **Infrastructure.**
   - The working endpoints are the ethrex node `https://altmempool.forshtat.com`, the miner sidecar `…/rpc` and the gateway `https://altmempoolgateway.forshtat.com/rpc`.
   - The explorer is `https://explorer.altmempool.wtf/`. The faucet is `skandha_explorer_faucet`.
   - **The chain is stalled at block `0x63ac6`** (re-checked just now). The `*.altmempool.wtf` devnet hosts aren't live.
6. **Local machine.** It has forge 1.8.7, node 24, pnpm and bun. There's no Rust and no Docker. `gh` isn't logged in, so you must run `gh auth login` before we push.

## Architecture

```
qpay/                          new standalone git repo (in /Users/yashj/dev/ethmumbai_2026)
  contracts/                   Foundry
    src/QPayAccount.sol        Falcon account (VERIFY): sighash + ARBITRARY sig -> NIST Falcon verifier -> APPROVE(EXECUTION)
    src/UsdcPaymaster.sol      staked payer (VERIFY): checks next frames repay fee in USDC + sender USDC balance -> APPROVE(PAYMENT)
    src/MockUSDC.sol           plain non-proxy ERC-20, 6 decimals (avoids proxy implementation-slot reads)
    lib/                       ETHFALCON (NIST verifier), mempool-workshop HegotaSupport helpers
    script/Deploy.s.sol        deploy verifier, helpers, USDC, paymaster (stake + ETH float), account(pubkey)
  packages/frametx/            TS: devnet-layout codec, 4-frame Q-Pay tx builder, Falcon signer wrapper, submit helpers
  scripts/                     node CLIs: keygen, deploy-account, send (end-to-end), gates (probe both mempools)
  app/                         Vite + React + TS + shadcn: wallet, send, mempool-gates panel, failure-path buttons
  sidecar/                     submodule -> our fork of forshtat/mempool-workshop-sidecar (only if we need a new rule)
  docs/                        plan.md, architecture.md, decisions.md, progress.md, demo.md, hackathon-checklist.md
```

**Transaction layout.** This follows EIP Example 3 and the ERC-8421 prefix shape `[only_verify, pay]`.

| # | Mode | Target | What it does |
|---|---|---|---|
| 0 | VERIFY, flags 0x2 | sender (null) | `TXPARAM(0x08)` gives the sighash; `SIGDATACOPY` reads the 1064-byte Falcon signature from `signatures[0]` (ARBITRARY, empty msg); STATICCALL `verify(pubkey, sighash, sig)`; then `APPROVE(EXECUTION)`. The public key (1024 bytes) is in the account's own storage. |
| 1 | VERIFY, flags 0x1 | paymaster | `FRAMEDATALOAD` on frame 2 checks it is `usdc.transfer(paymaster, fee)` with `fee ≥ gasQuote`. It also reads `usdc.balanceOf(sender)`, a slot associated with the sender, so it's allowed. Then `APPROVE(PAYMENT)`. |
| 2 | SENDER | MockUSDC | `transfer(paymaster, fee)`: the gas is repaid in USDC |
| 3 | SENDER | MockUSDC | `transfer(recipient, amount)`: the payment itself. Frames 2 and 3 are an atomic batch (flag 0x4), so the fee and the payment both happen or neither does. |

**Why the canonical mempool rejects it.**
- Frame 0's VERIFY gas (0.73M to 3.9M) is above the 100k cap.
- Frame 1's paymaster reads storage outside `tx.sender`.

The gates panel shows **real** responses. The same raw tx goes to ethrex `eth_sendRawTransaction` (canonical: rejected, with the reason) and to the alt-mempool `eth_sendFrameTransaction` (admitted). The explorer then shows it included.

**Two ways the post-quantum check gets admitted.** The booth settles which one.
- **Path H, hosted.** Use this if the hosted miner admits staked entities above 100k. Stake the account with 0.01 ETH and use `ZKNOX_falcon_fused` (~0.73M). The demo runs on the hosted devnet.
- **Path L, local.** Use this if the hosted cap is a flat 100k.
  - Fork the sidecar and add a new rule: the ERC-8421 BUDGET-010 staked-entity budget. A stretch goal is a "canonical PQ-verifier exception" that raises the budget only for gas spent inside an allow-listed verifier code hash, without requiring the user to stake. That answers the "Three Gates" paper's open question about post-quantum transactions.
  - Run that sidecar in miner mode against a **local ethrex** (rustup plus the `eip8141-tracer` build).
  - Demo: the hosted gateway rejects with the 100k cap, and our node with the new rule admits and includes. A custom rule only works end to end when our sidecar is the block-building path, because the hosted miner re-validates with its own rules.

**Honest caveat in the README.** The account's spendable balance is 0 ETH. In Path H, 0.01 ETH of refundable stake is locked in the registry. In Path L with the canonical-verifier rule, no stake is needed.

## Steps

### Step 0. Booth and setup (first hour)

- [ ] Ask the alt-mempool booth (Pierre and Alex) these five questions.
  - [ ] Will chain `0x539` resume, or will new devnets come up on `*.altmempool.wtf`? What are their RPC and gateway URLs?
  - [ ] Does the hosted **miner** sidecar admit a **staked** sender or paymaster with VERIFY above 100k (BUDGET-010)? What is the minimum stake?
  - [ ] How does the miner include alt-mempool txs that ethrex's canonical pool rejects? Can our own sidecar with custom rules get inclusion on the hosted chain?
  - [ ] Are HegotaSupport's TXPARAM, SIGDATACOPY and FRAMEDATALOAD helpers deployed and working on the devnet?
  - [ ] Any guidance for a PQ verifier (~0.7M+ gas) in a VERIFY frame?
- [ ] Record the answers in `docs/decisions.md` and choose **Path H or Path L**.
- [ ] Start the local insurance build in the background. Install rustup, clone `forshtat/ethrex` at the `eip8141-tracer` branch, and run `cargo build --release`. Evidence is the binary existing.

### Step 1. Spikes before product code (about 3 hours). Each ends in evidence.

- [ ] **S0, chain path.** Submit the workshop's ExampleWallet ECDSA frame tx with our TS builder. Evidence is an admitted, included tx hash on the explorer, or the decision to switch to Path L.
- [ ] **S1, opcode helpers.** Run a throwaway account that reads `TXPARAM(0x08)` and `SIGDATACOPY` through `ethrex_simulateFrameTransaction` with tracing. Evidence is a trace showing the right sighash and signature bytes. If the helpers fail, write the account in hand-written Yul.
- [ ] **S2, Falcon round trip.** Node signs a 32-byte hash with kohaku's `falconSigner.js`, and a Foundry test calls the NIST verifier (fused, else `ZKNOX_falcon`) on anvil. Evidence is `forge test` passing, with gas reported.
- [ ] **S3, admission probe.** Simulate and submit a VERIFY frame costing ~0.8M gas from a staked sender. Evidence is the sidecar's accept response or its exact rejection reason.

### Step 2. Build (commit after each part)

- [ ] **C1, scaffold.**
  - Set up the repo: `git init`, a `.gitignore`, and an MIT license.
  - Create a pnpm workspace with `contracts/`, `packages/frametx`, `scripts/` and `app/` (shadcn init).
  - Add the docs skeleton.
  - Move the old brainstorm files **out of the repo**, into `/Users/yashj/dev/ethmumbai_2026_archive/` (moved, not deleted).
  - Add `ethmumbai_2026/` to the parent repo's `.git/info/exclude`.
- [ ] **C2, contracts.** `MockUSDC`, `UsdcPaymaster`, `QPayAccount` and `Deploy.s.sol`. Add Foundry tests for the non-frame logic: Falcon verify through the account's internal verify function, and the paymaster's fee and balance checks in a harness.
- [ ] **C3, `packages/frametx` and scripts.** The devnet codec (vendored from the sidecar's `codec.ts`, or `@forshtat/hegota-support`), `buildQPayTx()`, a Falcon signer, `submitAlt()`, `submitCanonical()` and `simulate()`. Script `scripts/send.ts` runs the whole thing. Evidence is an included tx where USDC moved and the fee was paid in USDC, with the receipt and the explorer link.
- [ ] **C4, sidecar fork (Path L only).** Add the BUDGET-010 staked budget, then optionally the canonical-PQ-verifier exception, plus a local devnet run script. Evidence is the hosted gateway rejecting and our sidecar admitting and including the same tx.
- [ ] **C5, app.**
  - An account card showing a PQ badge, 0 ETH and the USDC balance.
  - A send form.
  - A mempool-gates panel with real canonical and alt-mempool responses, plus the static rule checks.
  - An explorer link.
  - Failure buttons: a tampered signature (rejected at VERIFY) and insufficient USDC (the paymaster refuses).
- [ ] **C6, stretch.** A daily-quota paymaster mode, using a post-op DEFAULT frame that increments the counter. Also the canonical-PQ-verifier exception rule, if it wasn't done in C4.
- [ ] **C7, submission.**
  - README covering the architecture, the frames table, what is real and what is mocked, the trade-offs, and an **AI-usage attribution** section.
  - `docs/progress.md` final.
  - A 2–4 minute demo video (720p or better, real narration, not sped up).
  - Slides.
  - Submit before 09:00 Sat.

**Decision checkpoints.**
- If S0 or S3 fails and the local ethrex isn't running by the end of Step 1 plus 2 hours, fall back to the **SDK plus admission-simulator** deliverable (offline, same prize).
- If the Falcon gas doesn't fit anywhere, raise the budget in our own rule. Post-quantum stays.

## Project rules (from you)

- **Commits.** Feature-sized chunks (C1 to C7, plus fixes). Messages are short and informal, with the required Co-Authored-By line.
- **Files kept out of the repo.** No brainstorm or idea files in the repo. This plan, consolidated, becomes `docs/plan.md`. Research is archived outside the repo.
- **Docs.** `docs/` holds `architecture.md`, `decisions.md` (a dated log with the reason for each decision), `progress.md` (updated after each commit), `demo.md` (script) and `hackathon-checklist.md` (rules and submission items extracted from REPORT.md).
- **Approval.** Major architecture changes, such as switching paths or changing the verifier or frame layout, get your approval before I implement them.

## Verification

- **Unit tests.** `forge test` covers Falcon verify through the account's verify path (a valid signature passes; one flipped bit fails), and the paymaster's quote and balance checks.
- **Chain end to end.** `pnpm tsx scripts/send.ts` asserts all of these:
  - the alt mempool status reaches `OnChain`;
  - the recipient's USDC goes up by `amount`;
  - the paymaster's USDC goes up by `fee`;
  - the sender's ETH stays at 0;
  - the canonical `eth_sendRawTransaction` returns a rejection.
- **Failure paths.** A tampered signature and too little USDC are both rejected, with nothing charged.
- **UI.** Drive the app in the browser with Claude Code's **verify** skill: account loaded, send succeeds, the gates panel shows real responses, both failure buttons reject. Save screenshots to `docs/media/`.
- **Qualification evidence.** The explorer link to our admitted tx goes in the README.

## Risks

- **The hosted chain stays stalled.** That forces Path L and its local build time. Mitigation is the parallel Rust build and asking the booth now.
- **Helper opcodes fail.** Mitigation is the hand-written Yul account (adds 2–3 hours).
- **Falcon signer and verifier encodings don't match.** Mitigation is spike S2 before any account code.
- **USDC proxy storage reads.** Mitigation is the non-proxy MockUSDC.
- **Paymaster loses gas if the repay frame fails.** Mitigation is the atomic batch of frames 2 and 3, plus the paymaster checking the sender's USDC balance in VERIFY.
- **`gh` isn't authenticated.** You run `gh auth login` before C1's push.
