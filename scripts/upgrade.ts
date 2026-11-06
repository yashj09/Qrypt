import { writeFileSync } from "node:fs";
import { deploymentPath, loadDeployment, type Deployment } from "./lib/config.ts";
import { connect } from "./lib/chain.ts";
import { deployWalletLayer } from "./lib/wallet-layer.ts";

/** Redeploys only what depends on the account contract; the verifier, USDC, paymaster and registry stay. */
async function main() {
  const ctx = await connect();
  const chainId = ctx.chain.id;
  const old = loadDeployment(chainId);
  const layer = await deployWalletLayer(ctx, {
    verifier: old.verifier,
    registry: old.stakingRegistry,
    usdc: old.usdc,
    keyConverter: old.keyConverter,
  });
  const next: Deployment = { ...old, ...layer };
  writeFileSync(deploymentPath(chainId), JSON.stringify(next, null, 2) + "\n");
  console.log(`factory   ${old.factory} -> ${next.factory}`);
  console.log(`account   ${old.account} -> ${next.account}`);
  for (const t of next.tokens) console.log(`token     ${t.symbol} ${t.address}`);
  console.log(`written   ${deploymentPath(chainId)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
