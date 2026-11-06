# Why a 700k-gas VERIFY frame is a reasonable public-mempool citizen

The alt-mempool team asked every project, after they lifted the devnet's validation gas limits, to:

> explain why spending 10 million gas in verify frame is not going to be a problem for the mempool nodes and block builders who will need to run all of this before getting paid one cent, and why this is not violating CROPS … The point is to have *some* viable public mempool option for your validations, not to whitelist your contract on Alchemy.

This page answers that for Q-Pay, with numbers measured on the public devnet. The short answer has three parts:
- Q-Pay doesn't need unlimited validation. It needs about **0.72M gas**, bounded, from a **staked** entity.
- Its validation **can't be invalidated by anyone but the sender**.
- The rule that admits it (ERC-8421 BUDGET-010) is open to every account, with **no allowlist**.

## 1. What our validation actually costs

| Frame | Who | Execution gas (onchain receipt) | Reads |
|---|---|---|---|
| 0, VERIFY | `QPayAccount` (staked) | 676k–724k, depending on the signature | The account's own storage (Falcon public key) and the immutable code of the verifier and the Keccak helper |
| 1, VERIFY | `UsdcPaymaster` (unstaked) | 27,922 | The paymaster's immutables, and the sender's USDC balance slot (associated with the sender) |

**Measured node cost.** These are medians of 15 calls against the hosted ethrex node, with the latency of a no-op RPC subtracted. They come from one node over the network, so treat them as indicative.

| Work | Q-Pay transaction | Trivial frame transaction (ECDSA self-relay) |
|---|---|---|
| Executing it (`ethrex_simulateFrameTransaction`, no trace) | about **5 ms** | about 0 ms |
| ERC-7562 traced validation (what a sidecar runs once at admission) | about **305 ms** | about 0 ms |

So executing a Falcon check is cheap: about 5 ms, or roughly 1/80 of a 60M-gas block. Most of the admission cost is the **opcode-level ERC-7562 tracer** walking about 700k gas of NTT arithmetic. Section 5 shows how to remove most of that.

## 2. Why it can't be used to DoS mempool nodes

**The budget is bounded.** We don't ask for 10M gas. Our sidecar patch ([forshtat/mempool-workshop-sidecar#2](https://github.com/forshtat/mempool-workshop-sidecar/pull/2)) implements ERC-8421 BUDGET-010 like this:
- An unstaked entity gets at most **100k** validation gas, the same as the canonical mempool.
- A staked entity gets at most **1M**, configurable.
- A transaction asking for more is rejected **before simulation**, from its declared frame limits alone. The node spends nothing on it.

**Expensive validation costs the sender something.** Only staked entities get more than 100k. Stake is locked capital with an unstake delay, so each identity that wants the larger budget must lock funds. ERC-8421's reputation rules (`opsSeen` versus `opsIncluded`, throttling, banning) then cap how much unpaid validation work any one staked entity can cause. An attacker needs fresh stake per identity, and each identity's pending transactions are limited.

**There's no free option and no mass invalidation.** This is the property that makes heavy validation dangerous elsewhere, and Q-Pay doesn't have it:
- The account's VERIFY frame is a **pure function** of the transaction bytes, the account's own storage and immutable code. A signature that verifies at admission still verifies when a builder includes the transaction. The only things that invalidate it are the sender's own nonce moving or the sender replacing its key, and both need the sender's own Falcon-signed transaction.
- The paymaster's VERIFY frame reads only the sender's USDC balance. That balance only goes down through a transfer the sender signs.
- No third party can flip many pending Q-Pay transactions from valid to invalid with one cheap state change. Compare a privacy pool whose root rotates, or a paymaster reading a shared oracle.

**Failed validation is cheap and attributable.** If the signature is wrong, frame 0 reverts with `BadFalconSignature()` before `APPROVE`. The node has spent at most one bounded simulation, the staked sender takes the reputation hit, and nobody is charged. We demo this path live.

## 3. Why builders don't run it "before getting paid one cent"

- **Builders get paid.** The paymaster approves payment in frame 1, after the account's VERIFY succeeds, and the transaction pays its full gas in ETH: about 821k gas, all at the offered price. Builders don't run unpaid validation. Validation that passes the mempool passes again in the block, for the determinism reasons in section 2.
- **The mempool pays once per transaction,** not once per block. That's the ERC-7562 tracing in section 1. Because our validation reads no third-party state, a node never has to re-trace a pending Q-Pay transaction when unrelated state changes. One admission costs one trace.
- **The whole transaction is about 1.4% of a 60M-gas block.** A builder including 40 Q-Pay transactions spends about half a block of gas on them and is paid for all of it.

## 4. Why this doesn't violate CROPS

- **C, censorship resistant.**
  - **No allowlist.** BUDGET-010 is a rule about stake and gas, open to every account. Any ERC-8421 node running it admits any staked entity's transaction. We never asked anyone to allowlist our contract.
  - **No dependency on us after creation.** Our onboarding function only pays for account creation. Afterwards the account depends on no server of ours: any compliant node can carry its transactions, and in the demo both the organisers' node and ours admitted them.
- **O, open source.** Everything is MIT: the account, the paymaster, the verifier adapter, the client, and the sidecar patch with tests. Anyone can rebuild and run the whole stack from the repos.
- **P, private.**
  - The Falcon private key is generated in the user's browser and never leaves it; only the public key is sent.
  - **Remaining gap:** the RPC providers see the account's address and its reads. Routing reads through Anon-RPC is a natural next step that we haven't done.
- **S, secure.**
  - There's **no ECDSA path**, so the account's authorization is post-quantum.
  - **Trade-off:** the verifier is ZKNOX's experimental, unaudited `falcon_core8` behind our adapter. Swapping in an audited verifier means changing one immutable address.
  - The stake is refundable.

## 5. How to make it cheaper for nodes

1. **Skip tracing inside a known, pure verifier.** The ERC-7562 rules only care about storage access, banned opcodes and calls. A STATICCALL into a contract whose code hash is on a published list of pure signature verifiers (no SLOAD outside itself, no state, no environment opcodes) can't break those rules. Its insides don't need opcode-level tracing. This is the canonical-contract exception that the ["Three Gates"](https://ethresear.ch/t/frame-transactions-and-the-three-gates-to-privacy/24666) post proposes for privacy pools, applied to post-quantum verifiers. By the section 1 numbers it should cut our admission cost from about 305 ms toward about 5 ms. **Not implemented; a proposal.**
2. **A precompile for the expensive arithmetic.** Most of the gas is NTT polynomial arithmetic and SHAKE hashing. An NTT or Falcon precompile, as proposed in the post-quantum discussions, would shrink both the gas and the trace. This would make post-quantum accounts viable under a much smaller budget.
3. **A per-sender budget instead of stake.** For accounts that can't stake, the budget could come from a canonical post-quantum verifier rather than from stake, so the node trusts the verifier, not the sender.

## 6. What stays out of scope

- **The paymaster charges on `max_cost`, not on gas used.** A post-op refund frame would fix that.
- **Stake per user (0.02 ETH, refundable) is real friction.** Item 3 above is how we'd remove it.
- **The numbers come from one devnet node.** A production-grade node and tracer would differ.
