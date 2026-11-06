import { formatEther, formatUnits } from "viem"

export const usdc = (v: bigint) => `${Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`
export const eth = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
export const short = (hex: string, n = 6) => (hex.length > 2 * n + 2 ? `${hex.slice(0, n + 2)}…${hex.slice(-n)}` : hex)
export const gas = (v: bigint) => `${Number(v).toLocaleString()} gas`
