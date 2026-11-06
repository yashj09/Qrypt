import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address, Hex } from "viem";
import type { Endpoints } from "@qpay/frametx";

export const ROOT = resolve(import.meta.dirname, "../..");
export const STATE_DIR = resolve(ROOT, ".qpay");

/** Local devnet defaults: Kurtosis publishes ethrex RPC from port 32000, the sidecar listens on 14337. */
export const endpoints: Endpoints = {
  node: process.env.QPAY_NODE_RPC ?? "http://127.0.0.1:32002",
  altMempool: process.env.QPAY_ALT_RPC ?? "http://127.0.0.1:14337/rpc/",
};

/** Throwaway devnet key funded in the Kurtosis genesis (published on purpose in the sidecar repo). */
export const deployerKey = (process.env.QPAY_DEPLOYER_KEY ??
  "0x06f911c1ecb2053bb443ba0a0e28d630c583c3c0c2f334a9ecdc8c7c6ad4ea15") as Hex;

export const STAKING_REGISTRY = (process.env.QPAY_STAKING_REGISTRY ?? "") as Address | "";

export interface Deployment {
  chainId: number;
  verifier: Address;
  keyConverter: Address;
  usdc: Address;
  paymaster: Address;
  account: Address;
  usdcPerEth: string;
  stakingRegistry: Address;
}

export const deploymentPath = (chainId: number) => resolve(ROOT, "deployments", `${chainId}.json`);

export function loadDeployment(chainId: number): Deployment {
  const path = deploymentPath(chainId);
  if (!existsSync(path)) throw new Error(`no deployment at ${path}; run pnpm setup first`);
  return JSON.parse(readFileSync(path, "utf8"));
}
