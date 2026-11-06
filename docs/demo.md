# Demo script (4 minutes, plus 3 minutes of Q&A)

**Setup before going on stage:**
- The sidecar is running (`./devnet/sidecar.sh`) and the app is running (`pnpm app`). Both are pointed at `https://altmempool.forshtat.com`.
- Browser tab 1: http://localhost:5180
- Browser tab 2: the explorer, open on the last transaction (link in the README).
- Run `pnpm send` once to warm up. Check the account shows USDC and 0 ETH.
- Backup: the recorded video (`docs/media/`, made on the day).

## 0:00 to 0:30. The problem

> "Ethereum accounts are secured by ECDSA, which a quantum computer breaks. Post-quantum signatures exist. Falcon-512 can be verified onchain for about 0.7M gas. But EIP-8141 gives the canonical mempool a 100k validation cap. So a post-quantum account can't get a transaction in today. Also, a new user holds USDC, not ETH, so they can't pay gas without a relayer or a paymaster company."

## 0:30 to 1:00. The account

Show the account card: Falcon-512, **0 ETH**, the USDC balance, and 0.02 ETH of refundable stake.

> "No ECDSA key exists for this account. Its only rule is a Falcon-512 signature, checked by code in its own VERIFY frame."

Point at the frames table. There are four frames. Two VERIFY frames are the validation, and two SENDER frames are the gas repayment and the payment. There is no bundler, no relayer and no paymaster server.

## 1:00 to 2:15. Send

Press **Sign with Falcon and send**. While it runs:

> "The browser just signed with Falcon in a few milliseconds. The same signed transaction now goes to three mempools."

Read out the three gates as they fill in:
1. **Canonical, rejected.** "Prefix gas budget exceeds MAX_VERIFY_GAS. That's EIP-8141's 100k rule."
2. **Stock ERC-8421 alt mempool, rejected.** "1,050,100 exceeds 100,000. Even today's alt mempool can't take any post-quantum signature, because it uses one flat cap."
3. **Our alt mempool, admitted, then OnChain.** "We implemented the ERC-8421 draft's per-entity budget. The staked account gets up to 1M, and the unstaked paymaster stays under 100k. We sent it upstream as a PR."

The result alert shows the recipient +5 USDC, the paymaster about +0.017 USDC for gas, and **ETH changed by 0 wei**.

## 2:15 to 3:00. Try to break it

- **Tamper signature.** The transaction is rejected at frame 0 with `BadFalconSignature()`. Nothing is charged, and the balance is unchanged.
- **Underpay gas fee.** The transaction is rejected at frame 1 with `FeeTooLow(fee, quote)`. The paymaster's rule is enforced by code, not by a server.

## 3:00 to 3:40. Proof

Switch to the explorer tab. Show the stock node's rejection record for our transaction, then the block that included it on the public devnet. Point at the README numbers: about 700k gas for the Falcon VERIFY (7x the canonical cap), 28k for the paymaster VERIFY, and a fee of about $0.017.

## 3:40 to 4:00. Close

> "Q-Pay is a post-quantum USDC wallet with zero ETH and no middlemen. It works today on the public devnet because the alt mempool can admit expensive validation for staked accounts. That's the exact case the EF prize describes. Our BUDGET-010 patch is the piece that makes it possible."

## Likely questions

| Question | Answer |
|---|---|
| Why not run the Falcon check in a later frame? | Then the payer pays before the signature is checked, so anyone could drain the paymaster with bad signatures. The check has to happen in VERIFY, before APPROVE. |
| Why does the account need stake? | Under ERC-8421, stake buys the larger validation budget. It's refundable, and its spendable ETH stays 0. |
| Is the verifier safe? | It's ZKNOX's experimental falcon8 core behind our adapter, and it's unaudited. Swapping in an audited verifier only changes one address. |
| What stops paymaster griefing? | In VERIFY, the paymaster checks that the repay frame pays at least the quote and that the sender holds the USDC. A remaining gap: it charges on max cost, and a post-op refund is future work. |
| Why a mock USDC? | Real USDC is a proxy. Reading its implementation slot during validation is a non-associated storage read, which would need the paymaster to be staked too. |
| How does it reach the chain? | Our sidecar relays admitted transactions through ethrex's privileged frame-transaction submit, which is how the alt-mempool miner path works on this devnet. |
