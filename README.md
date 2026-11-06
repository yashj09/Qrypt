# Q-Pay

A post-quantum wallet for EIP-8141 frame transactions. A brand-new account with 0 spendable ETH sends USDC: a Falcon-512 signature authorizes it, and a permissionless paymaster takes the gas back in USDC. There is no ECDSA path, and no relayer or bundler company in the loop.

The canonical mempool rejects these transactions, because the Falcon check costs far more than its 100k validation gas cap. The alternative mempool admits them under ERC-8421's per-entity budget for staked entities.

Work in progress for ETHGlobal Mumbai 2026. See `docs/` for the plan, the decisions and the progress.
