#!/usr/bin/env bash
# Local EIP-8141 devnet: ethrex (eip8141-tracer) + Lighthouse via Kurtosis, with the sidecar's single-node config.
# The published ethrex image is amd64 only and hangs under Rosetta, so on Apple Silicon build it natively first:
#   docker buildx build --load -t ethrex:local-arm64 <path to forshtat/ethrex at eip8141-tracer>
set -euo pipefail
SIDECAR_DIR="${SIDECAR_DIR:-$HOME/dev/ethmumbai_tools/sidecar}"
ENCLAVE="${ENCLAVE:-qpay-devnet}"
SOCK=/tmp/qpay-docker.sock

# Kurtosis bind-mounts the Docker socket path into containers. Colima's host socket lives on a virtiofs
# mount that cannot be bind-mounted, so use one path that resolves to the right socket on both sides.
ln -sf "$HOME/.colima/default/docker.sock" "$SOCK"
colima ssh -- sudo ln -sf /var/run/docker.sock "$SOCK"
export DOCKER_HOST="unix://$SOCK"

if [ "$(uname -m)" = "arm64" ]; then
  docker tag ethrex:local-arm64 ethrex:local
else
  docker pull ghcr.io/forshtat/ethrex:eip8141-tracer-latest
  docker tag ghcr.io/forshtat/ethrex:eip8141-tracer-latest ethrex:local
fi
kurtosis engine start
kurtosis run --enclave "$ENCLAVE" \
  github.com/ethpandaops/ethereum-package@b5b3af65248f11702216e377d0377bcd8ccf4caf \
  --args-file "$SIDECAR_DIR/test/e2e/kurtosis/eip8141-single-node.yaml"
kurtosis port print "$ENCLAVE" el-1-ethrex-lighthouse rpc
