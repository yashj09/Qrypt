# Progress

## 2026-11-06

- [x] Repo scaffold: pnpm workspace with `contracts/` (Foundry), `contracts/falcon/` (separate Foundry profile for the verifier), and `packages/frametx` and `packages/falcon`.
- [x] Spike S2: the Falcon round trip works. noble signatures verify through `QPayFalcon8Verifier`, and tampering is rejected (`forge test` in `contracts/falcon`).
- [x] Contracts: `QPayAccount` (Falcon VERIFY, stakes in its constructor), `UsdcPaymaster` (introspects the repay frame, immutable price), `MockUSDC`.
- [x] `@qpay/frametx`: builder for the 4-frame transaction, fee quote, Falcon signing hook, and canonical and alt-mempool clients.
- [x] Sidecar fork: ERC-8421 BUDGET-010 per-entity validation budgets (lives in the sidecar fork, not this repo).
- [x] Hosted devnet was reset at about 12:00 IST and came back up. Contracts are deployed on it (chain 1337, `deployments/1337.json`).
- [x] Our BUDGET-010 sidecar runs against the hosted ethrex and relays through `ethrex_submitPrivilegedFrameTransaction`.
- [x] S1 and S3 were proven by the real end-to-end run. The Falcon VERIFY frame ran onchain using 678k–722k gas.
- [x] End-to-end send: canonical rejected, stock alt mempool rejected, ours admitted, OnChain, and the account's ETH stayed at 0 (`pnpm send`).
- [x] Failure paths: a tampered signature fails at frame 0 with `BadFalconSignature()`, and an underpaid fee fails at frame 1 with `FeeTooLow`. Nothing is charged.
- [x] App: the browser signs with Falcon (about 3–7 ms), shows three live gates, a status timeline and balance deltas. Driven in a real browser.
- [x] Local devnet insurance: a native arm64 ethrex image is built (`ethrex:local-arm64`), and `devnet/up.sh` uses it.
- [x] Sidecar fork published (`yashj09/mempool-workshop-sidecar@budget-010`) with unit tests (executor 388/388). Upstream PR: forshtat/mempool-workshop-sidecar#2.
- [x] Explorer evidence: the official explorer shows the stock Gateway rejecting our transaction. The same transaction is onchain in block 726.
- [x] App shows per-frame gas from the onchain receipt (Falcon VERIFY 676k–724k, 6.8–7.2x the canonical cap).
- [x] README proof table and measured numbers, `docs/runbook.md`, `docs/demo.md`, `docs/submission.md`.
- [x] Redesign as **Eyrie**: landing page at `/`, app at `/app` with a light wallet and a dark under-the-hood inspector (mempool verdicts, gas bars against the 100k cap, stress tests), onboarding stepper, review step, receipt and activity list. Verified on production in incognito: onboard, send included in block 2747 with 0 wei ETH spent, tamper rejected at frame 0.
- [x] Full wallet, each part verified on the live devnet:
  - any asset: tEUR send (block 6409) and ETH send (block 6432), receive with QR, activity from chain logs;
  - account v2 redeployed: receive ETH, key rotation (block 6466; the new key's send landed in 6471, and the old key is rejected with `BadFalconSignature`), ERC-1271;
  - backup and restore in a fresh profile (a wrong password is caught, and a rotated-away backup is refused), then close account (block 6484; stake and balances are 0);
  - popup connect: connect, ERC-1271 sign-in, tEUR claim (block 6529);
  - Chrome extension: `pnpm test:extension` passes, with the claim in block 6582.
- [ ] Demo video (you record it), slides, and the dashboard submission.
