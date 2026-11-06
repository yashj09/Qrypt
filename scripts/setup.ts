import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEther, type Address, type Hex } from "viem";
import { ROOT, STAKING_REGISTRY, deploymentPath, type Deployment } from "./lib/config.ts";
import { artifact, connect, deploy, deployRaw } from "./lib/chain.ts";
import { deployWalletLayer } from "./lib/wallet-layer.ts";

const USDC_PER_ETH = 3000n * 10n ** 6n;
const PAYMASTER_FLOAT = parseEther("5");

async function main() {
  const ctx = await connect();
  const chainId = ctx.chain.id;
  const log = (k: string, v: string) => console.log(`${k.padEnd(16)} ${v}`);
  log("chain", String(chainId));

  const registry: Address =
    STAKING_REGISTRY || (await deploy(ctx, artifact("contracts", "NaiveStakingRegistry")));
  log("stakingRegistry", registry);

  const helperInit = readFileSync(resolve(ROOT, "contracts/falcon/helpers/f1600_zknox.initcode.hex"), "utf8").trim() as Hex;
  const helper = await deployRaw(ctx, helperInit);
  const verifier = await deploy(ctx, artifact("contracts/falcon", "QPayFalcon8Verifier"), [helper]);
  const keyConverter = await deploy(ctx, artifact("contracts/falcon", "FalconKeyConverter"));
  log("verifier", verifier);

  const usdcArt = artifact("contracts", "MockUSDC");
  const usdc = await deploy(ctx, usdcArt);
  const paymaster = await deploy(ctx, artifact("contracts", "UsdcPaymaster"), [usdc, USDC_PER_ETH], PAYMASTER_FLOAT);
  const { factory, account, tokens } = await deployWalletLayer(ctx, { verifier, registry, usdc, keyConverter });
  log("usdc", usdc);
  log("paymaster", paymaster);
  log("factory", factory);
  log("account", account);

  const deployment: Deployment = {
    chainId,
    verifier,
    keyConverter,
    usdc,
    paymaster,
    factory,
    account,
    usdcPerEth: USDC_PER_ETH.toString(),
    stakingRegistry: registry,
    tokens,
  };
  mkdirSync(resolve(ROOT, "deployments"), { recursive: true });
  writeFileSync(deploymentPath(chainId), JSON.stringify(deployment, null, 2) + "\n");
  log("written", deploymentPath(chainId));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
