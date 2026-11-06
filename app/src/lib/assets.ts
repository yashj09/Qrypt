import { erc20Abi, parseAbiItem, type Address, type Hex } from "viem"
import { erc20Transfer, defaultGas, type Call } from "@qpay/frametx"
import { client, readBalances, type Balances, type Deployment } from "@/lib/qpay"
import { units } from "@/lib/format"

export type Asset = { kind: "eth" } | { kind: "erc20"; address: Address; symbol: string; decimals: number }

export const ETH: Asset = { kind: "eth" }

export const assetKey = (a: Asset) => (a.kind === "eth" ? "eth" : a.address.toLowerCase())
export const assetSymbol = (a: Asset) => (a.kind === "eth" ? "ETH" : a.symbol)
export const assetDecimals = (a: Asset) => (a.kind === "eth" ? 18 : a.decimals)

export const usdcAsset = (d: Deployment): Asset => ({ kind: "erc20", address: d.usdc, symbol: "USDC", decimals: 6 })

export function transferCall(asset: Asset, to: Address, amount: bigint): Call {
  return asset.kind === "eth"
    ? { to, value: amount, label: "Send ETH", gas: defaultGas.transfer }
    : { to: asset.address, data: erc20Transfer(to, amount), label: `Send ${asset.symbol}`, gas: defaultGas.transfer }
}

export const balanceOf = (asset: Asset, who: Address): Promise<bigint> =>
  asset.kind === "eth"
    ? client.getBalance({ address: who })
    : client.readContract({ address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [who] })

export const formatAsset = (asset: Asset, v: bigint) => `${units(v, assetDecimals(asset))} ${assetSymbol(asset)}`

/** USDC first (it pays gas), then the deployment's tokens, then the ones the user added, then ETH. */
export function knownAssets(d: Deployment, account: Address): Asset[] {
  const listed: Asset[] = d.tokens.map((t) => ({ kind: "erc20", address: t.address, symbol: t.symbol, decimals: t.decimals }))
  const seen = new Set([usdcAsset(d), ...listed].map(assetKey))
  const custom = loadCustomTokens(d, account).filter((a) => !seen.has(assetKey(a)))
  return [usdcAsset(d), ...listed, ...custom, ETH]
}

const customKey = (d: Deployment, account: Address) => `qpay.tokens.${d.chainId}.${account.toLowerCase()}`

function loadCustomTokens(d: Deployment, account: Address): Asset[] {
  try {
    return JSON.parse(localStorage.getItem(customKey(d, account)) ?? "[]") as Asset[]
  } catch {
    return []
  }
}

export function addCustomToken(d: Deployment, account: Address, asset: Asset) {
  const next = [...loadCustomTokens(d, account).filter((a) => assetKey(a) !== assetKey(asset)), asset]
  localStorage.setItem(customKey(d, account), JSON.stringify(next))
}

/** Reads an ERC-20's symbol and decimals; throws with a readable message if the address isn't one. */
export async function readToken(address: Address): Promise<Asset> {
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ])
    return { kind: "erc20", address, symbol, decimals }
  } catch {
    throw new Error("That address isn't an ERC-20 token on this chain.")
  }
}

export type Holdings = Record<string, bigint>

export async function readHoldings(assets: Asset[], who: Address): Promise<Holdings> {
  const values = await Promise.all(assets.map((a) => balanceOf(a, who)))
  return Object.fromEntries(assets.map((a, i) => [assetKey(a), values[i]]))
}

export interface TokenTransfer {
  hash: Hex
  block: bigint
  logIndex: number
  direction: "in" | "out"
  asset: Asset
  amount: bigint
  counterparty: Address
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")

/** EIP-7708: this chain logs plain ETH transfers as ERC-20-style `Transfer` events from this system address. */
const ETH_TRANSFER_LOG_ADDRESS: Address = "0xfffffffffffffffffffffffffffffffffffffffe"

const logAddress = (a: Asset): Address => (a.kind === "eth" ? ETH_TRANSFER_LOG_ADDRESS : a.address)

/**
 * Every token and ETH transfer into or out of the account, newest first. Gas repayments to the paymaster are left
 * out: they're fees, shown on each payment instead.
 */
export async function readTransfers(d: Deployment, account: Address, assets: Asset[]): Promise<TokenTransfer[]> {
  const batches = await Promise.all(
    assets.flatMap((asset) =>
      (["in", "out"] as const).map(async (direction) => {
        const logs = await client.getLogs({
          address: logAddress(asset),
          event: transferEvent,
          args: direction === "in" ? { to: account } : { from: account },
          fromBlock: 0n,
        })
        return logs.map((l) => ({
          hash: l.transactionHash,
          block: l.blockNumber,
          logIndex: l.logIndex,
          direction,
          asset,
          amount: l.args.value ?? 0n,
          counterparty: (direction === "in" ? l.args.from : l.args.to) as Address,
        }))
      }),
    ),
  )
  return batches
    .flat()
    .filter((t) => !(t.direction === "out" && t.counterparty.toLowerCase() === d.paymaster.toLowerCase()))
    .sort((a, b) => Number(b.block - a.block) || b.logIndex - a.logIndex)
}

export interface WalletSnapshot {
  balances: Balances
  holdings: Holdings
  transfers: TokenTransfer[]
}

export async function readWallet(d: Deployment, account: Address, assets: Asset[]): Promise<WalletSnapshot> {
  const [balances, holdings, transfers] = await Promise.all([
    readBalances(d, account),
    readHoldings(assets, account),
    readTransfers(d, account, assets),
  ])
  return { balances, holdings, transfers }
}
