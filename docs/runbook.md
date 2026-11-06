# Runbook

## Check the devnet is alive

```sh
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' https://altmempool.forshtat.com
```

The block number should go up every 6 seconds. If it stays the same for a minute, the chain is stalled.

## If the devnet was reset

A reset wipes our contracts. To tell: `eth_getCode` on the account in `deployments/1337.json` returns `0x`, or the block number is suddenly small.

1. Wait for Hegota. Frame transactions only work from **block 64** onward, about 6.5 minutes after the reset. Before that, sends fail.
2. Redeploy, which takes about 1 minute. The deployer key in `.qpay/deployer.hex` gets refunded from the shared genesis key automatically.
   ```sh
   QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm setup
   ```
3. Restart the sidecar, so it reads the new staking registry from `deployments/1337.json`.
   ```sh
   pkill -f "skandha.js node"; QPAY_NODE_RPC=https://altmempool.forshtat.com ./devnet/sidecar.sh
   ```
4. Smoke test.
   ```sh
   QPAY_NODE_RPC=https://altmempool.forshtat.com pnpm send 0x000000000000000000000000000000000000dEaD 1
   ```
   Expected: canonical rejected, stock rejected, ours accepted, `status OnChain`, `account ETH 0 -> 0`.
5. Reload the app. It picks up the new `deployments/1337.json`, keyed by chain id.

The Falcon seed in `.qpay/falcon-seed.hex` is kept, so the account's key stays the same, but it gets a new address.

## If the hosted devnet is down for good: local devnet

This needs Colima started with `--vm-type vz --vz-rosetta`, the Kurtosis CLI in `~/.local/bin`, and the arm64 ethrex image `ethrex:local-arm64`. See the header of `devnet/up.sh` for how to build that image.

```sh
export PATH=$HOME/.local/bin:$PATH
./devnet/up.sh                              # prints the ethrex RPC port at the end
export QPAY_NODE_RPC=http://127.0.0.1:<port>
pnpm setup && ./devnet/sidecar.sh           # in a second terminal: pnpm send …
QPAY_NODE_RPC=$QPAY_NODE_RPC pnpm app
```

The local chain also starts before Hegota: wait for block 64. There is no stock gateway locally, so the app's stock gate shows an error. Set `QPAY_STOCK_RPC` to the hosted gateway, or ignore that gate.

## Processes during the demo

| Process | Command | Port |
|---|---|---|
| Our sidecar (BUDGET-010) | `./devnet/sidecar.sh` | 14337 |
| App | `pnpm app` | 5180 |

## Public deployment for judges

| Piece | Where |
|---|---|
| App and onboarding function | Vercel project `qpay` (root `app/`), https://qpay-psi.vercel.app |
| Our BUDGET-010 sidecar | Laptop: `./devnet/sidecar.sh`, exposed with `cloudflared tunnel --url http://127.0.0.1:14337` |
| Vercel env | `ONBOARD_KEY` (devnet operator key = `.qpay/deployer.hex`), `QPAY_FACTORY`, `QPAY_NODE_RPC`, `VITE_ALT_RPC` (tunnel URL + `/rpc/`) |

**Keep the sidecar and tunnel running as detached processes,** so closing a terminal or an agent session doesn't kill them:

```sh
QPAY_NODE_RPC=https://altmempool.forshtat.com nohup ./devnet/sidecar.sh > .qpay/sidecar.log 2>&1 < /dev/null & disown
nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:14337 > .qpay/tunnel.log 2>&1 < /dev/null & disown
```

To check them: `ps -ax | grep -E "skandha.js node|cloudflared tunnel --no-autoupdate --url"`. Keep the laptop awake with `caffeinate -dimsu &`.

**If the tunnel restarts,** its URL changes. Point the app at the new URL and redeploy (about 1 minute):

```sh
U=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" .qpay/tunnel.log | tail -1)
printf '%s' "$U/rpc/" | npx vercel env add VITE_ALT_RPC production --force
npx vercel deploy --prod --yes
```

Until you redeploy, judges' transactions still land through the organisers' hosted alt mempool, which now admits them. The app falls back to it automatically.

**After a devnet reset,** run the reset steps above. Then update `QPAY_FACTORY` from the new `deployments/1337.json`, commit, and redeploy. The deployment JSON is bundled into the app.

**Factory float:** each new account uses 0.02 ETH of stake from `QPayFactory`. The factory was funded with 4 ETH, enough for about 200 accounts. Top it up with a plain transfer from the deployer key.
