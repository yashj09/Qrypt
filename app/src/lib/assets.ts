import { erc20Abi, type Address } from "viem"
import { erc20Transfer, defaultGas, type Call } from "@qpay/frametx"
import { client, type Deployment } from "@/lib/qpay"
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
