import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, parseEther, type Address, type Hex } from "viem";
import { falconFromSeed } from "@qpay/falcon";
import { bytesToHex } from "@qpay/frametx";
import { ROOT, STAKING_REGISTRY, deploymentPath, type Deployment } from "./lib/config.ts";
import { artifact, connect, deploy, deployRaw } from "./lib/chain.ts";
import { loadSeed } from "./lib/seed.ts";

const USDC_PER_ETH = 3000n * 10n ** 6n;
const ACCOUNT_STAKE = parseEther("0.02");
const PAYMASTER_FLOAT = parseEther("5");
const FACTORY_FLOAT = parseEther("4");
const ACCOUNT_USDC = 100n * 10n ** 6n;

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
  const keyConverterArt = artifact("contracts/falcon", "FalconKeyConverter");
  const keyConverter = await deploy(ctx, keyConverterArt);
  log("verifier", verifier);

  const signer = falconFromSeed(loadSeed());
  const nttKey = (await ctx.publicClient.readContract({
    address: keyConverter,
    abi: keyConverterArt.abi,
    functionName: "toNttKey",
    args: [bytesToHex(signer.publicKeyCoeffs)],
  })) as Hex;
  log("falcon pubkey", `${(nttKey.length - 2) / 2} bytes (NTT domain)`);

  const usdcArt = artifact("contracts", "MockUSDC");
  const usdc = await deploy(ctx, usdcArt);
  const paymaster = await deploy(ctx, artifact("contracts", "UsdcPaymaster"), [usdc, USDC_PER_ETH], PAYMASTER_FLOAT);
  const factoryArt = artifact("contracts", "QPayFactory");
  const factory = await deploy(ctx, factoryArt, [verifier, registry, usdc, ACCOUNT_STAKE, ACCOUNT_USDC], FACTORY_FLOAT);
  const create = await ctx.wallet.writeContract({ address: factory, abi: factoryArt.abi, functionName: "create", args: [nttKey] });
  await ctx.publicClient.waitForTransactionReceipt({ hash: create });
  const account = (await ctx.publicClient.readContract({
    address: factory,
    abi: factoryArt.abi,
    functionName: "accountOf",
    args: [keccak256(nttKey)],
  })) as Address;
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
  };
  mkdirSync(resolve(ROOT, "deployments"), { recursive: true });
  writeFileSync(deploymentPath(chainId), JSON.stringify(deployment, null, 2) + "\n");
  log("written", deploymentPath(chainId));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
