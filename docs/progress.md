# Progress

## 2026-11-06

- [x] Repo scaffold: pnpm workspace with `contracts/` (Foundry), `contracts/falcon/` (separate Foundry profile for the verifier), and `packages/frametx` and `packages/falcon`.
- [x] Spike S2: the Falcon round trip works. noble signatures verify through `QPayFalcon8Verifier`, and tampering is rejected (`forge test` in `contracts/falcon`).
- [x] Contracts: `QPayAccount` (Falcon VERIFY, stakes in its constructor), `UsdcPaymaster` (introspects the repay frame, immutable price), `MockUSDC`.
- [x] `@qpay/frametx`: builder for the 4-frame transaction, fee quote, Falcon signing hook, and canonical and alt-mempool clients.
- [x] Sidecar fork: ERC-8421 BUDGET-010 per-entity validation budgets (lives in the sidecar fork, not this repo).
- [ ] Local devnet: Kurtosis is blocked on the `/var/run/docker.sock` symlink, which needs sudo.
- [ ] S1: the helper opcodes read the signature hash and signature correctly (needs a live chain).
- [ ] End-to-end send on the devnet.
- [ ] App.
- [ ] README, demo video, submission.
