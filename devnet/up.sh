#!/usr/bin/env bash
# Local EIP-8141 devnet: ethrex (eip8141-tracer, amd64 under Rosetta) + Lighthouse via Kurtosis,
# with the sidecar's single-node config. Needs colima started with --vm-type vz --vz-rosetta.
set -euo pipefail
SIDECAR_DIR="${SIDECAR_DIR:-$HOME/dev/ethmumbai_tools/sidecar}"
ENCLAVE="${ENCLAVE:-qpay-devnet}"
SOCK=/tmp/qpay-docker.sock

# Kurtosis bind-mounts the Docker socket path into containers. Colima's host socket lives on a virtiofs
# mount that cannot be bind-mounted, so use one path that resolves to the right socket on both sides.
ln -sf "$HOME/.colima/default/docker.sock" "$SOCK"
colima ssh -- sudo ln -sf /var/run/docker.sock "$SOCK"
export DOCKER_HOST="unix://$SOCK"

docker pull --platform linux/amd64 ghcr.io/forshtat/ethrex:eip8141-tracer-latest
docker tag ghcr.io/forshtat/ethrex:eip8141-tracer-latest ethrex:local
kurtosis engine start
kurtosis run --enclave "$ENCLAVE" \
  github.com/ethpandaops/ethereum-package@b5b3af65248f11702216e377d0377bcd8ccf4caf \
  --args-file "$SIDECAR_DIR/test/e2e/kurtosis/eip8141-single-node.yaml"
kurtosis port print "$ENCLAVE" el-1-ethrex-lighthouse rpc
