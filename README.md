# Q-Pay

**Post-quantum USDC payments on EIP-8141 frame transactions. Zero ETH, zero middlemen.**

A brand-new account that holds only USDC sends a payment. A **Falcon-512** signature authorizes it, and there is no ECDSA key anywhere. A permissionless paymaster pays the gas and takes it back **in USDC inside the same transaction**. There is no bundler, relayer or paymaster server: the validation rules are code running in VERIFY frames.

| | |
|---|---|
| **Canonical mempool** (EIP-8141) | **Rejects** it: the Falcon check costs about 0.7M gas, over the 100k validation cap, and the paymaster reads storage outside `tx.sender` |
| **Alternative mempool** (ERC-8421) | **Admits** it, under the per-entity validation budget (BUDGET-010) we implemented in the sidecar: the staked account gets up to 1M, and the unstaked paymaster stays under 100k |

Built at ETHGlobal Mumbai 2026 for the Ethereum Foundation "Best use of the Frame Transaction Alternative Mempool" prize. Its brief names PQ-secure smart wallets and ERC-20 paymasters. Q-Pay does both in one transaction.

## How it works

See [docs/architecture.md](docs/architecture.md) for the full picture. In short:

1. The app builds four frames: the account's VERIFY (Falcon), the paymaster's VERIFY (USDC repayment check), a SENDER `usdc.transfer(paymaster, fee)`, and a SENDER `usdc.transfer(recipient, amount)`.
2. It signs the frame transaction's signature hash with Falcon-512 in the browser, and puts the 1064-byte signature in an ARBITRARY signature entry. That entry is left out of the hash.
3. `QPayAccount` reads the hash (`TXPARAM`) and the signature (`SIGDATACOPY`) inside its VERIFY frame, checks them with the ZKNOX falcon8 verifier, and approves execution.
4. `UsdcPaymaster` introspects the next frame (`FRAMEDATALOAD`), checks the fee against `TXPARAM.MAX_COST` and checks the sender's USDC balance, then approves payment.

## Run it

Requirements: Node 24, pnpm, Foundry, bun (for the sidecar).

```sh
pnpm install
pnpm build:contracts && (cd contracts/falcon && forge build)

# deploy to the public alt-mempool devnet (chain 1337)
QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm setup

# run the ERC-8421 sidecar with our BUDGET-010 patch (sidecar/budget-010.patch) against that node
QPAY_NODE_RPC=https://altmempool.forshtat.com SIDECAR_DIR=/path/to/patched/sidecar ./devnet/sidecar.sh

# end to end from the CLI
QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm send 0xRecipient 5
QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm send 0xRecipient 5 --tamper   # rejected at VERIFY

# the demo app
QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm app
```

`devnet/up.sh` starts a local ethrex and Lighthouse devnet through Kurtosis, as an alternative to the public one.

## Tests

```sh
cd contracts/falcon && forge test   # noble Falcon signatures verify; tampering is rejected
```

## Trade-offs and limits

- The Falcon verifier is ZKNOX's experimental, unaudited `falcon_core8` (ETHFALCON `012e080`), behind our adapter. It costs 590k–640k gas per verify.
- The account stakes 0.02 ETH, which is refundable, so its expensive validation gets the staked budget. Its spendable ETH is 0.
- The paymaster charges on the transaction's maximum cost, not on gas actually used. A post-op refund frame would fix this.
- The sidecar rule is a patch on the workshop sidecar. ERC-8421 BUDGET-010 is still a draft, and its numbers may change.
- The demo Falcon seed sits in `.qpay/` on the presenter's laptop, and the dev server reads it so the browser can sign.

## Built on

ethrex `eip8141-tracer` (devnet), forshtat/mempool-workshop-sidecar (ERC-8421 sidecar), `@forshtat/hegota-support` (frame opcodes from Solidity), ZKNoxHQ/ETHFALCON (Falcon verifier), `@noble/post-quantum` (Falcon signer), viem, Foundry, Vite, React, shadcn/ui.

## AI usage

Built with Claude Code (Anthropic) as the coding agent, directed by the author:

- **Research and planning.** Claude Code gathered the protocol, tooling and prize research. `docs/plan.md` and `docs/decisions.md` record the plan and the decisions, and every major decision was approved by the author.
- **Code.** Claude Code wrote most of the code in `contracts/`, `packages/`, `scripts/`, `app/` and `sidecar/budget-010.patch`. The author reviewed it, ran it and decided how it should work.
- **Spike.** A Claude Code subagent ran the Falcon round-trip spike, whose results became `contracts/falcon/` and `packages/falcon/`.
- **Commits.** Each commit carries a `Co-Authored-By: Claude` trailer.

## License

MIT
