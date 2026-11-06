import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROOT, endpoints, deployerKey } from "./config.ts";

export async function connect() {
  const probe = createPublicClient({ transport: http(endpoints.node) });
  const id = await probe.getChainId();
  const chain = defineChain({
    id,
    name: `qpay-devnet-${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [endpoints.node] } },
  });
  const account = privateKeyToAccount(deployerKey);
  const publicClient = createPublicClient({ chain, transport: http(endpoints.node) }) as PublicClient;
  const wallet = createWalletClient({ chain, account, transport: http(endpoints.node) });
  return { chain, publicClient, wallet, deployer: account };
}

export interface Artifact {
  abi: Abi;
  bytecode: Hex;
}

/** Reads a Foundry artifact from `contracts/out` or `contracts/falcon/out`. */
export function artifact(project: "contracts" | "contracts/falcon", name: string): Artifact {
  const json = JSON.parse(readFileSync(resolve(ROOT, project, "out", `${name}.sol`, `${name}.json`), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode.object };
}

/** Deploys and waits; ethrex charges state gas for new code, so gas is estimated with headroom. */
export async function deploy(
  ctx: Awaited<ReturnType<typeof connect>>,
  art: Artifact,
  args: unknown[] = [],
  value = 0n,
): Promise<Address> {
  const hash = await ctx.wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args, value });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deploy reverted: ${hash}`);
  return receipt.contractAddress;
}

export async function deployRaw(ctx: Awaited<ReturnType<typeof connect>>, initCode: Hex): Promise<Address> {
  const hash = await ctx.wallet.sendTransaction({ data: initCode, to: null });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`raw deploy reverted: ${hash}`);
  return receipt.contractAddress;
}
