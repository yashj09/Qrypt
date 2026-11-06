#!/usr/bin/env bash
# Runs our ERC-8421 sidecar fork (BUDGET-010 per-entity validation budgets) against the local ethrex,
# relaying admitted frame transactions itself (bundling mode auto).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIDECAR_DIR="${SIDECAR_DIR:-$HOME/dev/ethmumbai_tools/sidecar}"
NODE_RPC="${QPAY_NODE_RPC:?set QPAY_NODE_RPC to the ethrex RPC url}"
CHAIN_ID=$(printf '%d' "$(curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$NODE_RPC" | sed 's/.*"result":"\([^"]*\)".*/\1/')")
REGISTRY=$(node -e "console.log(require('$ROOT/deployments/$CHAIN_ID.json').stakingRegistry)")
DATA="$ROOT/.qpay/sidecar"
mkdir -p "$DATA"
cat > "$DATA/config.json" <<JSON
{
  "entryPoints": ["0x00000000000000000000000000000000000000aa"],
  "canonicalEntryPoint": "0x00000000000000000000000000000000000000aa",
  "standardMempoolId": "QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk",
  "supportedMempools": [{"mempoolId": "QmcFZKUX9qoo3StwVycJTAhwdiqbEjcwNvQVK246p3z1rk", "entryPoint": "0x00000000000000000000000000000000000000aa"}],
  "relayers": ["${QPAY_DEPLOYER_KEY:-0x06f911c1ecb2053bb443ba0a0e28d630c583c3c0c2f334a9ecdc8c7c6ad4ea15}"],
  "rpcEndpoint": "$NODE_RPC",
  "rpcEndpointSubmit": "$NODE_RPC",
  "stakingRegistryAddress": "$REGISTRY",
  "minStake": "10000000000000000",
  "minUnstakeDelay": 0,
  "bundleInterval": 3000
}
JSON
cd "$SIDECAR_DIR"
exec bun --bun packages/cli/bin/skandha.js node \
  --configFile "$DATA/config.json" --dataDir "$DATA" \
  --api.address 127.0.0.1 --api.port 14337 --api.wsPort 14337 \
  --p2p.host 127.0.0.1 --p2p.enrHost 127.0.0.1 --p2p.port 4337 --p2p.enrPort 4337 \
  --executor.bundlingMode auto \
  --explorer.enable \
  --api.cors "${QPAY_SIDECAR_CORS:-https://explorer.altmempool.wtf}"
