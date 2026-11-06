import { keccak256, parseEther, type Address, type Hex } from "viem";
import { falconFromSeed } from "@qpay/falcon";
import { bytesToHex } from "@qpay/frametx";
import { artifact, deploy, type connect } from "./chain.ts";
import { loadSeed } from "./seed.ts";
import type { TokenInfo } from "./config.ts";

const ACCOUNT_STAKE = parseEther("0.02");
const FACTORY_FLOAT = parseEther("4");
const ACCOUNT_USDC = 100n * 10n ** 6n;
const TEST_EURO = { name: "Test Euro", symbol: "tEUR", decimals: 6 };

type Ctx = Awaited<ReturnType<typeof connect>>;

/**
 * Everything that changes when the account contract changes: the factory (which embeds the account's code), the
 * demo account it creates for this machine's Falcon seed, and the extra test token the wallet lists.
 */
export async function deployWalletLayer(
  ctx: Ctx,
  core: { verifier: Address; registry: Address; usdc: Address; keyConverter: Address },
): Promise<{ factory: Address; account: Address; tokens: TokenInfo[] }> {
  const tEur = await deploy(ctx, artifact("contracts", "MockToken"), [TEST_EURO.name, TEST_EURO.symbol, TEST_EURO.decimals]);

  const factoryArt = artifact("contracts", "QPayFactory");
  const factory = await deploy(
    ctx,
    factoryArt,
    [core.verifier, core.registry, core.usdc, ACCOUNT_STAKE, ACCOUNT_USDC],
    FACTORY_FLOAT,
  );

  const converter = artifact("contracts/falcon", "FalconKeyConverter");
  const nttKey = (await ctx.publicClient.readContract({
    address: core.keyConverter,
    abi: converter.abi,
    functionName: "toNttKey",
    args: [bytesToHex(falconFromSeed(loadSeed()).publicKeyCoeffs)],
  })) as Hex;
  const create = await ctx.wallet.writeContract({ address: factory, abi: factoryArt.abi, functionName: "create", args: [nttKey] });
  await ctx.publicClient.waitForTransactionReceipt({ hash: create });
  const account = (await ctx.publicClient.readContract({
    address: factory,
    abi: factoryArt.abi,
    functionName: "accountOf",
    args: [keccak256(nttKey)],
  })) as Address;

  return { factory, account, tokens: [{ address: tEur, ...TEST_EURO }] };
}
